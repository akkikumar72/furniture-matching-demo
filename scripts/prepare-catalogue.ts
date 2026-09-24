import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { fetchListing, type Listing } from "../src/lib/listings";
import { publicFetch } from "../src/lib/public-fetch";
import { mapLimited } from "../src/lib/matching";
import type { Country } from "../src/lib/types";

const sources = JSON.parse(
  await readFile("data/catalogue-sources.json", "utf8"),
) as { urls: string[] };
await mkdir("data/images", { recursive: true });
const results = await mapLimited(sources.urls, 3, async (url) => {
  const market = new URL(url).pathname.split("/")[1].toUpperCase();
  const country = market as Country;
  try {
    const listing = await fetchListing(url, country);
    if (!listing?.images.length)
      throw new Error("No unambiguous product schema or image");
    const image = await publicFetch(listing.images[0], 8_000_000);
    const bytes = await sharp(image.bytes, { limitInputPixels: 30_000_000 })
      .rotate()
      .resize(1000, 1000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const localImage = `data/images/${hash}.jpg`;
    await writeFile(localImage, bytes);
    console.log(
      `${country} ${listing.name}: ${listing.offer.stock}, shipping ${listing.offer.shipping}`,
    );
    return { ...listing, localImage, contentHash: hash };
  } catch (error) {
    console.error(
      `Skipped ${url}: ${error instanceof Error ? error.message : "source failed"}`,
    );
    return null;
  }
});
const listings = results.filter(
  (value): value is Listing & { localImage: string; contentHash: string } =>
    value !== null,
);
await writeFile(
  "data/catalogue.json",
  JSON.stringify({ preparedAt: new Date().toISOString(), listings }, null, 2) +
    "\n",
);
console.log(
  `Saved ${listings.length} offers for ${new Set(listings.map((item) => item.productKey)).size} variants. No AI calls made.`,
);
if (listings.length < sources.urls.length) process.exitCode = 1;
