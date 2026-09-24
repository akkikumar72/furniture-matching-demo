import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizedImage } from "../src/lib/ai";
import { database } from "../src/lib/supabase";
import { cachedExamples, saveExampleResult } from "../src/lib/example-cache";
import { COUNTRIES, type Country, type MatchResponse } from "../src/lib/types";
import type { Listing } from "../src/lib/listings";

// Import actual recorded search results. No descriptions, rankings, or evidence are invented.
const recordings = [
  ["side-table", "side-table-se.json"],
  ["poster", "poster-se.json"],
  ["wooden-chair", "wooden-chair-se-final.json"],
  ["coffee-table", "coffee-table-se.json"],
  ["green-chair", "green-chair-se-final.json"],
  ["cantilever-chair", "cantilever-chair-se.json"],
  ["cantilever-chair", "cantilever-chair-de.json"],
  ["cantilever-chair", "cantilever-chair-gb.json"],
  ["wooden-chair", "wooden-chair-gb.json"],
];

async function main() {
  if (process.argv.includes("--seed-recordings")) {
    const catalogue = JSON.parse(
      await readFile("data/catalogue.json", "utf8"),
    ) as { listings: Listing[] };
    for (const [example, file] of recordings) {
      let response = JSON.parse(
        await readFile(`output/live/${file}`, "utf8"),
      ) as MatchResponse;
      const bytes = await normalizedImage(
        await readFile(`public/examples/${example}.png`),
      );
      const imageHash = createHash("sha256").update(bytes).digest("hex");
      const { data, error } = await database()
        .from("furniture_cache")
        .select("value")
        .eq(
          "key",
          `match-v2:${process.env.OPENAI_MODEL || "gpt-6-astra"}:${imageHash}:${response.country}`,
        )
        .maybeSingle();
      if (error) throw new Error("Could not check recent search results");
      const recent = data?.value as MatchResponse | undefined;
      if (
        recent &&
        recent.country === response.country &&
        Date.parse(recent.generatedAt) > Date.parse(response.generatedAt) &&
        Object.values(recent.sources).every(
          (source) => source.state !== "unavailable",
        )
      )
        response = recent;
      for (const item of [...response.matches, ...response.unverified]) {
        if (item.storagePath) {
          const listing = catalogue.listings.find(
            (entry) => entry.productKey === item.productKey,
          );
          // Never persist expired signed URLs or their tokens in the seeded cache.
          item.imageUrl = listing?.images[0] || "";
        }
      }
      await saveExampleResult(example, response);
      console.log(`Saved ${example} / ${response.country}`);
    }
  }
  for (const country of Object.keys(COUNTRIES) as Country[]) {
    const start = Date.now();
    const { results } = await cachedExamples(country);
    console.log(
      `${country}: ${Object.keys(results).length}/6 examples ready in ${Date.now() - start} ms`,
    );
  }
  console.log("Cache-only warmup complete. No AI API requests.");
}

main().catch(() => {
  console.error(
    "Example cache warmup failed. Check Supabase connectivity and saved recordings.",
  );
  process.exitCode = 1;
});
