import OpenAI from "openai";
import { configuration, setupStatus } from "../src/lib/config";
import { database, IMAGE_BUCKET } from "../src/lib/supabase";

async function main() {
  const status = setupStatus();
  if (!status.ready) {
    console.error(
      `Missing: ${status.missing.join(", ")}. Add them to .env.local. Values are never printed.`,
    );
    process.exitCode = 1;
    return;
  }
  const config = configuration();
  const db = database();
  const checks = await Promise.allSettled([
    new OpenAI({
      apiKey: config.openaiKey,
      timeout: 15_000,
      maxRetries: 0,
    }).models.retrieve(config.model),
    db.from("furniture_variants").select("id", { count: "exact" }).limit(1),
    db.storage.getBucket(IMAGE_BUCKET),
    db.from("furniture_offers").select("country"),
  ]);
  const model = checks[0];
  console.log(
    `OpenAI model ${config.model}: ${model.status === "fulfilled" ? "accessible (generation not tested)" : "unavailable; check key and model access"}`,
  );
  const variants = checks[1];
  const dbOkay =
    variants.status === "fulfilled" &&
    !variants.value.error &&
    Array.isArray(variants.value.data);
  console.log(
    `Database schema: ${dbOkay ? `${variants.value.count} variants` : "unavailable; apply the SQL migration"}`,
  );
  const bucket = checks[2];
  const bucketOkay =
    bucket.status === "fulfilled" &&
    !bucket.value.error &&
    !bucket.value.data.public;
  console.log(
    `Private image storage: ${bucketOkay ? "ready" : "missing, inaccessible, or public"}`,
  );
  const offers = checks[3];
  if (offers.status === "fulfilled" && !offers.value.error) {
    const rows = offers.value.data;
    console.log(
      `Country offers: ${["SE", "DE", "GB"].map((country) => `${country}=${rows.filter((row) => row.country === country).length}`).join(", ")}`,
    );
  }
  if (
    model.status !== "fulfilled" ||
    !dbOkay ||
    !bucketOkay ||
    !variants.value.count
  )
    process.exitCode = 1;
}
main().catch(() => {
  console.error("Setup check failed. Verify the service URLs and keys.");
  process.exitCode = 1;
});
