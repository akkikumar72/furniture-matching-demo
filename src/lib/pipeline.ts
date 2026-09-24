import { createHash } from "node:crypto";
import { database, IMAGE_BUCKET } from "./supabase";
import { configuration } from "./config";
import { cachedExampleImage, saveExampleImage } from "./example-cache";
import {
  describeImage,
  DESCRIPTION_VERSION,
  discoverProducts,
  embedDescription,
  rankImages,
  retrievalText,
  type VisualDescription,
} from "./ai";
import { fetchListing, listingCandidate } from "./listings";
import {
  CANDIDATES_PER_SOURCE,
  deduplicate,
  FRESHNESS_MS,
  isPurchasable,
  mapLimited,
} from "./matching";
import type { Candidate, Country, MatchResponse, SourceStatus } from "./types";

async function readCache<T>(key: string): Promise<T | null> {
  const { data } = await database()
    .from("furniture_cache")
    .select("value")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return (data?.value as T) || null;
}
async function writeCache(key: string, value: unknown, ttlMs: number) {
  // The cache is an optimization. Search remains usable if a cache write fails.
  const { error } = await database()
    .from("furniture_cache")
    .upsert({
      key,
      value,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    });
  if (error) console.warn("[cache] write unavailable:", error.code);
}

export async function catalogueCandidates(
  embedding: number[],
  country: Country,
): Promise<Candidate[]> {
  const db = database();
  const { data, error } = await db.rpc("match_furniture_images", {
    query_embedding: embedding,
    target_country: country,
    match_count: CANDIDATES_PER_SOURCE,
  });
  if (error)
    throw new Error(
      "Catalogue unavailable. Apply the Supabase migration and run the catalogue importer.",
    );
  return await mapLimited(
    (data || []).slice(0, CANDIDATES_PER_SOURCE),
    4,
    async (row: {
      variant_id: string;
      product_key: string;
      name: string;
      brand: string | null;
      category: string | null;
      image_url: string;
      storage_path: string;
      offer: Candidate["offer"];
      similarity: number;
    }) => {
      const { data: signed } = await db.storage
        .from(IMAGE_BUCKET)
        .createSignedUrl(row.storage_path, 3600);
      const candidate: Candidate = {
        id: row.variant_id,
        productKey: row.product_key,
        name: row.name,
        brand: row.brand,
        category: row.category,
        imageUrl: signed?.signedUrl || row.image_url,
        storagePath: row.storage_path,
        source: "catalogue",
        offer: row.offer,
        similarity: row.similarity,
      };
      if (
        !isPurchasable(candidate.offer, country) ||
        Date.now() - Date.parse(candidate.offer.checkedAt) >= FRESHNESS_MS
      ) {
        try {
          const refreshed = await fetchListing(candidate.offer.url, country);
          if (refreshed && refreshed.productKey === candidate.productKey) {
            candidate.offer = refreshed.offer;
            await db
              .from("furniture_offers")
              .update({
                evidence: refreshed.offer,
                checked_at: refreshed.offer.checkedAt,
              })
              .eq("variant_id", row.variant_id)
              .eq("country", country)
              .eq("listing_url", row.offer.url);
          }
        } catch {
          /* Stale evidence stays stale and is excluded from purchasable results. */
        }
      }
      return candidate;
    },
  );
}

export async function matchFurniture(
  bytes: Buffer,
  country: Country,
): Promise<MatchResponse> {
  const start = Date.now();
  try {
    const example = await cachedExampleImage(bytes, country);
    if (example) return { ...example, elapsedMs: Date.now() - start };
  } catch {
    // A cache outage must not prevent an explicitly requested live search.
  }
  const config = configuration();
  const imageHash = createHash("sha256").update(bytes).digest("hex");
  const key = `match-v2:${config.model}:${imageHash}:${country}`;
  const cached = await readCache<MatchResponse>(key);
  if (cached) {
    // Storage URLs are regenerated, not reused after their expiry.
    const candidates = [...cached.matches, ...cached.unverified];
    await mapLimited(candidates, 4, async (candidate) => {
      if (candidate.storagePath) {
        const { data } = await database()
          .storage.from(IMAGE_BUCKET)
          .createSignedUrl(candidate.storagePath, 3600);
        if (data) candidate.imageUrl = data.signedUrl;
      }
    });
    const expired = cached.matches.filter(
      (item) => !isPurchasable(item.offer, country),
    );
    return {
      ...cached,
      matches: cached.matches.filter((item) =>
        isPurchasable(item.offer, country),
      ),
      unverified: [...cached.unverified, ...expired],
      cached: true,
      elapsedMs: Date.now() - start,
    };
  }
  const descriptionKey = `${DESCRIPTION_VERSION}:${config.model}:${imageHash}`;
  let described = await readCache<{
    visual: VisualDescription;
    embedding: number[];
  }>(descriptionKey);
  if (!described) {
    const visual = await describeImage(bytes);
    const embedding = await embedDescription(retrievalText(visual));
    described = { visual, embedding };
    await writeCache(descriptionKey, described, 30 * FRESHNESS_MS);
  }
  const [internal, external] = await Promise.allSettled([
    catalogueCandidates(described.embedding, country),
    (async () => {
      const urls = await discoverProducts(described.visual, country);
      const results = await mapLimited(urls, 4, async (url) => {
        try {
          const listing = await fetchListing(url, country);
          return listing?.images.length
            ? listingCandidate(listing, "web")
            : null;
        } catch {
          return null;
        }
      });
      return {
        candidates: results.filter((item): item is Candidate => item !== null),
        attempted: urls.length,
      };
    })(),
  ]);
  const internalItems = internal.status === "fulfilled" ? internal.value : [];
  const externalItems =
    external.status === "fulfilled" ? external.value.candidates : [];
  const sources: MatchResponse["sources"] = {
    catalogue:
      internal.status === "fulfilled"
        ? {
            state: internalItems.length ? "ready" : "partial",
            count: internalItems.length,
            message: internalItems.length
              ? `${internalItems.length} catalogue candidates searched.`
              : "No catalogue records for this country. Import the catalogue first.",
          }
        : {
            state: "unavailable",
            count: 0,
            message:
              "Catalogue unavailable. Check the Supabase migration and importer.",
          },
    web:
      external.status === "fulfilled"
        ? {
            state: externalItems.length ? "ready" : "partial",
            count: externalItems.length,
            message: externalItems.length
              ? `${externalItems.length} retailer listings retrieved.`
              : "No retailer product pages could be verified from this web search.",
          }
        : {
            state: "unavailable",
            count: 0,
            message:
              "Web search is unavailable. Catalogue results are still shown when available.",
          },
  };
  if (internal.status === "rejected")
    console.warn(
      "[catalogue]",
      internal.reason instanceof Error ? internal.reason.message : "failed",
    );
  if (external.status === "rejected")
    console.warn(
      "[web]",
      external.reason instanceof Error ? external.reason.message : "failed",
    );
  if (internal.status === "rejected" && external.status === "rejected")
    throw new Error(
      "Both search sources are unavailable. Check setup and retry.",
    );
  // Give each source room in the visual shortlist. Provider and vector scores are never blended.
  const merged = deduplicate([
    ...internalItems.slice(0, CANDIDATES_PER_SOURCE),
    ...externalItems.slice(0, CANDIDATES_PER_SOURCE),
  ]);
  const eligible = merged.filter((item) => isPurchasable(item.offer, country));
  const uncertain = merged.filter(
    (item) =>
      !isPurchasable(item.offer, country) &&
      item.offer.stock !== "out_of_stock" &&
      item.offer.shipping !== "unsupported",
  );
  const shortlist = [...eligible, ...uncertain].slice(
    0,
    CANDIDATES_PER_SOURCE * 2,
  );
  const result = shortlist.length
    ? await rankImages(bytes, shortlist)
    : { ranked: [], failedImages: 0 };
  if (result.failedImages) {
    for (const source of Object.values(sources) as SourceStatus[]) {
      if (source.state === "ready") {
        source.state = "partial";
        source.message +=
          " Some shortlisted photos could not be loaded and were omitted.";
      }
    }
  }
  const response: MatchResponse = {
    matches: result.ranked
      .filter((item) => isPurchasable(item.offer, country))
      .slice(0, 5),
    unverified: result.ranked
      .filter((item) => !isPurchasable(item.offer, country))
      .slice(0, 5),
    description: described.visual.description,
    sources,
    cached: false,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - start,
    country,
  };
  // A transient outage should not be cached for the whole hour.
  if (
    !result.failedImages &&
    sources.catalogue.state !== "unavailable" &&
    sources.web.state !== "unavailable"
  ) {
    await writeCache(key, response, 60 * 60 * 1000);
    try {
      await saveExampleImage(bytes, response);
    } catch {
      console.warn("[examples] cache write unavailable");
    }
  }
  console.info(
    `[match] ${country}, catalogue=${internalItems.length}, web=${externalItems.length}, eligible=${response.matches.length}, ms=${response.elapsedMs}`,
  );
  return response;
}
