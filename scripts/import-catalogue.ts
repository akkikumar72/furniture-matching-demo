import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { configuration } from "../src/lib/config";
import { database, IMAGE_BUCKET } from "../src/lib/supabase";
import {
  describeImage,
  embedDescription,
  retrievalText,
  DESCRIPTION_VERSION,
} from "../src/lib/ai";
import { mapLimited } from "../src/lib/matching";
import type { Listing } from "../src/lib/listings";

type Prepared = Listing & { localImage: string; contentHash: string };
const uuid = (value: string) => {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

async function main() {
  const config = configuration();
  const db = database();
  const catalogue = JSON.parse(
    await readFile("data/catalogue.json", "utf8"),
  ) as { listings: Prepared[] };
  if (!catalogue.listings.length)
    throw new Error(
      "The catalogue is empty. Run npm run catalogue:prepare first.",
    );
  const { error: schemaError } = await db
    .from("furniture_images")
    .select("id")
    .limit(1);
  if (schemaError)
    throw new Error(
      "Supabase schema is missing or inaccessible. Apply supabase/migrations/202609230001_furniture_demo.sql first.",
    );
  const groups = new Map<string, Prepared[]>();
  for (const listing of catalogue.listings)
    groups.set(listing.productKey, [
      ...(groups.get(listing.productKey) || []),
      listing,
    ]);
  let reused = 0;
  let processed = 0;
  const failures: string[] = [];
  await mapLimited([...groups.entries()], 2, async ([key, listings]) => {
    try {
      const item =
        listings.find((entry) => entry.offer.country === "SE") || listings[0];
      // Keep furniture types distinct even when they share an IKEA series name.
      const baseName = item.name.split(" - ")[0];
      const family =
        item.brand?.toLowerCase() === "ikea"
          ? `ikea:${baseName.toLowerCase()}`
          : key;
      const productId = uuid(`product:${family}`);
      const variantId = uuid(`variant:${key}`);
      const imageId = uuid(
        `image:${key}:${item.contentHash}:${DESCRIPTION_VERSION}:${config.model}`,
      );
      const product = await db.from("furniture_products").upsert({
        id: productId,
        name: family.startsWith("ikea:") ? baseName : item.name,
        brand: item.brand,
        category: item.category,
      });
      if (product.error) throw product.error;
      const variant = await db.from("furniture_variants").upsert({
        id: variantId,
        product_id: productId,
        product_key: key,
        sku: item.sku,
        attributes: { ...item.attributes, displayName: item.name },
      });
      if (variant.error) throw variant.error;
      const { data: existing } = await db
        .from("furniture_images")
        .select("id")
        .eq("id", imageId)
        .maybeSingle();
      if (!existing) {
        const bytes = await readFile(item.localImage);
        const storagePath = `catalogue/${item.contentHash}.jpg`;
        const uploaded = await db.storage
          .from(IMAGE_BUCKET)
          .upload(storagePath, bytes, {
            contentType: "image/jpeg",
            upsert: true,
          });
        if (uploaded.error) throw uploaded.error;
        const visual = await describeImage(bytes);
        const description = retrievalText(visual);
        const embedding = await embedDescription(description);
        const saved = await db.from("furniture_images").upsert({
          id: imageId,
          variant_id: variantId,
          original_url: item.images[0],
          storage_path: storagePath,
          content_hash: item.contentHash,
          description,
          embedding,
          description_model: config.model,
        });
        if (saved.error) throw saved.error;
        processed++;
      } else reused++;
      const offers = listings.map((entry) => ({
        id: uuid(`offer:${key}:${entry.offer.country}:${entry.offer.url}`),
        variant_id: variantId,
        country: entry.offer.country,
        listing_url: entry.offer.url,
        evidence: entry.offer,
        checked_at: entry.offer.checkedAt,
      }));
      const savedOffers = await db
        .from("furniture_offers")
        .upsert(offers, { onConflict: "variant_id,country,listing_url" });
      if (savedOffers.error) throw savedOffers.error;
      console.log(
        `Imported ${item.name} (${listings.map((entry) => entry.offer.country).join(", ")})`,
      );
    } catch (error) {
      failures.push(key);
      console.error(
        `Import failed for ${key}: ${error instanceof Error ? error.message : "Database or storage request failed"}`,
      );
    }
  });
  // Imported prices and availability must be reflected in the next search.
  await db.from("furniture_cache").delete().like("key", "match-v%:%");
  console.log(
    `Done: ${processed} images described, ${reused} reused, ${failures.length} failed.`,
  );
  if (failures.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
});
