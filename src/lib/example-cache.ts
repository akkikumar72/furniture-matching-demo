import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DESCRIPTION_VERSION, normalizedImage } from "./ai";
import { cachedResult } from "./cached-result";
import { fetchListing } from "./listings";
import { FRESHNESS_MS, mapLimited } from "./matching";
import { database, IMAGE_BUCKET } from "./supabase";
import { EXAMPLES, type Country, type MatchResponse } from "./types";

export const EXAMPLE_RANKING_TTL_MS = 30 * FRESHNESS_MS;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
let hashes: Promise<Map<string, string>> | undefined;

function exampleHashes() {
  return (hashes ??= Promise.all(
    EXAMPLES.map(async (example) => {
      const bytes = await readFile(
        join(process.cwd(), "public", example.image),
      );
      return [example.file, hash(await normalizedImage(bytes))] as const;
    }),
  ).then((entries) => new Map(entries)));
}

export async function exampleCacheKey(example: string, country: Country) {
  const imageHash = (await exampleHashes()).get(example);
  if (!imageHash) throw new Error("Unknown example");
  return `example-v1:${process.env.OPENAI_MODEL || "gpt-6-astra"}:${DESCRIPTION_VERSION}:${imageHash}:${country}`;
}

type ExampleResults = {
  results: Record<string, MatchResponse>;
  expiresAt: number;
};
const warm = new Map<string, ExampleResults>();
const pending = new Map<string, Promise<ExampleResults>>();
const scope = (country: Country) =>
  `${process.env.OPENAI_MODEL || "gpt-6-astra"}:${country}`;

/** Cache-only. This path never describes images, discovers products, or ranks with AI. */
export async function cachedExamples(
  country: Country,
): Promise<ExampleResults> {
  const id = scope(country);
  const existing = warm.get(id);
  if (existing && existing.expiresAt > Date.now()) return existing;
  const active = pending.get(id);
  if (active) return active;
  const work = loadExamples(country).then((result) => {
    warm.set(id, result);
    return result;
  });
  pending.set(id, work);
  try {
    return await work;
  } finally {
    pending.delete(id);
  }
}

async function loadExamples(country: Country): Promise<ExampleResults> {
  const start = Date.now();
  const keys = await Promise.all(
    EXAMPLES.map((example) => exampleCacheKey(example.file, country)),
  );
  const db = database();
  const { data, error } = await db
    .from("furniture_cache")
    .select("key,value")
    .in("key", keys)
    .gt("expires_at", new Date().toISOString());
  if (error) throw new Error("Example cache unavailable");
  const rows = (data || []) as { key: string; value: MatchResponse }[];
  const candidates = rows.flatMap(({ value }) => [
    ...value.matches,
    ...value.unverified,
  ]);

  // Reuse visual rankings for 30 days, but never extend purchase-evidence freshness.
  // Country prefetch refreshes old offers without another paid AI search.
  const stale = new Map(
    candidates
      .filter((item) => {
        const checked = [
          item.offer.checkedAt,
          item.offer.stockEvidence?.checkedAt,
          item.offer.shippingEvidence?.checkedAt,
        ].filter(Boolean) as string[];
        return checked.some(
          (date) =>
            !Number.isFinite(Date.parse(date)) ||
            Date.now() - Date.parse(date) >= FRESHNESS_MS,
        );
      })
      .map((item) => [item.offer.url, item]),
  );
  await mapLimited([...stale.values()], 4, async (item) => {
    try {
      const listing = await fetchListing(item.offer.url, country);
      if (listing?.productKey === item.productKey) {
        for (const candidate of candidates) {
          if (
            candidate.offer.url === item.offer.url &&
            candidate.productKey === item.productKey
          ) {
            candidate.offer = listing.offer;
          }
        }
      }
    } catch {
      // Unverifiable or expired offers remain outside the purchasable table.
    }
  });
  if (stale.size) {
    await mapLimited(rows, 4, async (row) => {
      const { error: writeError } = await db
        .from("furniture_cache")
        .update({ value: row.value })
        .eq("key", row.key);
      if (writeError)
        console.warn("[examples] evidence cache write unavailable");
    });
  }

  // One signing request for all examples, instead of one request per thumbnail.
  const paths = [
    ...new Set(
      candidates.flatMap((item) =>
        item.storagePath ? [item.storagePath] : [],
      ),
    ),
  ];
  if (paths.length) {
    const { data: signed } = await db.storage
      .from(IMAGE_BUCKET)
      .createSignedUrls(paths, 3600);
    const urls = new Map(
      (signed || [])
        .filter((item) => item.signedUrl)
        .map((item) => [item.path, item.signedUrl]),
    );
    for (const item of candidates) {
      if (item.storagePath && urls.has(item.storagePath))
        item.imageUrl = urls.get(item.storagePath)!;
    }
  }
  const results: Record<string, MatchResponse> = {};
  for (const row of rows) {
    const example = EXAMPLES[keys.indexOf(row.key)];
    if (!example || row.value.country !== country) continue;
    results[example.file] = {
      ...cachedResult(row.value, country),
      elapsedMs: Date.now() - start,
    };
  }
  return {
    results,
    expiresAt: Math.min(
      Date.now() + (rows.length ? 5 * 60_000 : 15_000),
      ...Object.values(results).map((result) =>
        Date.parse(result.cacheValidUntil!),
      ),
    ),
  };
}

export async function cachedExampleImage(bytes: Buffer, country: Country) {
  const imageHash = hash(bytes);
  const example = [...(await exampleHashes())].find(
    ([, value]) => value === imageHash,
  )?.[0];
  if (!example) return null;
  return (await cachedExamples(country)).results[example] || null;
}

export async function saveExampleResult(
  example: string,
  result: MatchResponse,
) {
  if (
    Object.values(result.sources).some(
      (source) => source.state === "unavailable",
    )
  )
    return;
  const key = await exampleCacheKey(example, result.country);
  const { error } = await database()
    .from("furniture_cache")
    .upsert({
      key,
      value: result,
      expires_at: new Date(
        Date.parse(result.generatedAt) + EXAMPLE_RANKING_TTL_MS,
      ).toISOString(),
    });
  if (error) throw new Error("Could not save example cache");
  warm.delete(scope(result.country));
}

export async function saveExampleImage(bytes: Buffer, result: MatchResponse) {
  const imageHash = hash(bytes);
  const example = [...(await exampleHashes())].find(
    ([, value]) => value === imageHash,
  )?.[0];
  if (example) await saveExampleResult(example, result);
}
