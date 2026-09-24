# Form. Furniture matching demo

A local Next.js application: upload one cropped image, choose Sweden, Germany or the UK, and compare up to five visually similar products with current country purchase evidence. The six reference crops from the supplied PDF are included as sample inputs.

![Form showing a coffee table matched to two IKEA tables in stock in Sweden](docs/screenshot.jpg)

## Current state

The application, Supabase migration, catalogue preparation/import scripts, source retrieval, image ranking, caching and interface are implemented. The prepared catalogue contains **31 real IKEA variants and 81 country offers**, fetched on 23 September 2026. The catalogue deliberately includes near alternatives and a few distractors. It is not an exact-identification dataset.

**Live OpenAI matching and managed Supabase are connected and tested.** The migration and catalogue import are complete in the configured project. Real browser searches have returned catalogue and web products, with unconfirmed offers kept separate. No synthetic results are used by the application. See `docs/validation.md` for measured latency, individual outcomes and remaining limits.

## Set up

Requires Node.js 22+ and npm. Run commands from this folder.

1. Install dependencies with `npm ci`. Copy `.env.example` to `.env.local` **only if `.env.local` does not already exist**. Fill in:

   ```dotenv
   OPENAI_API_KEY=your-openai-api-key
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your-server-side-supabase-secret-key
   OPENAI_MODEL=gpt-6-astra
   ```

   `SUPABASE_SERVICE_ROLE_KEY` is also accepted for projects using legacy service-role keys. Never use an anon/publishable key here. These values stay server-side; do not prefix them with `NEXT_PUBLIC_`. The OpenAI project needs billing and access to the configured model, web search and `text-embedding-3-small`. `npm run setup:check` checks model access, not generation/tool compatibility. The requested model is configurable; no silent model substitution occurs.

2. Create a managed Supabase project. Paste **`supabase/migrations/202609230001_furniture_demo.sql`** into its SQL editor and run it. It creates only `furniture_*` tables, a restricted vector-search function, and the private `furniture-images` bucket. Application tables have RLS enabled; only the server service key accesses them. There are no user accounts or public storage policies.

3. Run `npm run catalogue:prepare` to refresh the hand-selected retailer pages and download product images. Then run `npm run catalogue:import`. Import uploads the images to private storage, generates visual descriptions and 1536-dimensional text embeddings, and writes country offers with their source evidence. Import makes paid OpenAI calls. It processes two variants at a time and reuses descriptions already imported for the same image/model. If a retailer page disappears, preparation skips it, saves the successful records, and exits nonzero with a list of failures. Inspect that list before continuing. This is a bounded import, not a crawler.

4. Run `npm run setup:check`. Resolve any missing schema/bucket/model access and confirm nonzero variants. Then run `npm run dev` and open **http://127.0.0.1:3000**. Restart after changing `.env.local`.

5. Select the wooden chair, side table, coffee table, green chair and cantilever chair samples, one at a time. Run a search for each. Inspect actual photos, purchase URLs, prices and evidence. Change to Germany or the UK and search again. Repeat an unchanged search to check the cache label. Try the poster too; its visual specificity and sparse catalogue coverage make it a harder case.

For a production build running locally: `npm run build`, then `npm start`. There is no deployment configuration.

## Matching flow

`POST /api/match` accepts `multipart/form-data` with `image` (JPEG, PNG or WebP, up to 10 MB) and `country` (`SE`, `DE`, `GB`). It returns `matches`, `unverified`, `description`, per-source status/counts, cache state, country, processing time and generation time. Missing setup returns 503, invalid input 400/413, and a matching failure 502.

1. Normalize the image and hash it. Reuse a description/embedding cache when available. The uploaded reference is processed in memory and sent to OpenAI; it is not retained in Supabase storage. Catalogue images use private storage.
2. `gpt-6-astra` describes visible shape, construction, colour, surface and text. `text-embedding-3-small` embeds **that text**, not the image pixels.
3. Run country-filtered pgvector retrieval and OpenAI live web discovery concurrently, requesting at most **eight catalogue candidates and eight web candidates**. Web search returns raw image-result source pages and cited URLs; at most eight unique URLs are fetched. Model-written prose URLs are not trusted as product records.
4. Fetch actual retailer pages. Parse an unambiguous `Product`/`Offer` JSON-LD record. Identity, image URL, price, stock and delivery evidence come from the listing. Prices can come from the offer or its unambiguous current `UnitPriceSpecification`; crossed-out and membership prices are excluded. Deduplicate by canonical offer URL and retailer product identifiers, preserving variant parameters. Refresh stale catalogue evidence.
5. Require explicit `InStock` and a matching `shippingDestination.addressCountry`, each checked within 24 hours, for the purchasable table. An explicit `doesNotShip` exclusion blocks eligibility. Domain, currency and model assertions never establish delivery. Known unavailable/unsupported offers are removed. Unknown evidence is kept separately. Postcode restrictions remain visible; country evidence is not a postcode guarantee.
6. Fetch up to 16 shortlisted photos and compare them with the reference using `gpt-6-astra`. Prioritize shape and construction, then colour/surface. The model orders known IDs and gives a short similarity/difference explanation. Unknown IDs, duplicates and irrelevant matches are discarded. Return at most five eligible results, with no padding or fabricated confidence percentages.

Descriptions are cached for 30 days. Complete match responses are cached for one hour, keyed by image hash, model and country. Cache reads recheck evidence age and regenerate private signed image URLs. Cached searches keep their original purchase-evidence timestamps. Import clears only match-response cache entries. Transient source outages are not cached. A failed source is reported while results from the other source can still be shown.

The six built-in examples also have a separate **30-day Supabase cache of visual rankings**, keyed by the actual normalized crop, model, description version and country. Opening the page or changing country preloads saved example results through `GET /api/examples?country=SE`. This endpoint never calls OpenAI. Warm server and browser copies last up to five minutes, capped by purchase-evidence expiry; concurrent prefetches share one request. Private thumbnail URLs are regenerated in one batch. Offers older than 24 hours are checked against their original retailer listings without repeating AI work. Expired/unconfirmed offers remain outside the purchasable table, and known unavailable offers are excluded. A cache miss still uses the normal live search when the user presses Search, then saves the new example result.

Before a demo, run `npm run examples:warm` to load saved results and refresh old retailer evidence without AI credits. To initially seed the cache from the existing rehearsal recordings in `output/live`, use `npm run examples:warm -- --seed-recordings`. These recordings cover all six Sweden examples, the cantilever chair in Germany and the UK, and the wooden chair in the UK. Other country/example combinations need one live search before they can be cached. The poster and green chair recordings contain uncertain alternatives only; caching does not turn them into verified matches. Original search and purchase-evidence timestamps are retained. Warming in the CLI prepares persistent evidence; the running app fills its own memory cache on page load.

Saved searches made before the eight-per-source cap retain their original candidate counts. Reusing those results makes no new candidate discovery requests; fresh searches use the new cap.

Remote page/image downloads allow only public HTTP(S) addresses, pin DNS resolution, revalidate redirects, and enforce size/time limits. This localhost demo has no authentication, abuse controls or production monitoring. Keep it bound to localhost.

## Files

| File                                                  | Purpose                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `src/components/matcher.tsx`                          | Upload, samples, countries, results, evidence and error states  |
| `src/app/api/match/route.ts`                          | Server-only upload/matching endpoint                            |
| `src/lib/pipeline.ts`                                 | Concurrent sources, cache, eligibility, shortlist and ranking   |
| `src/lib/ai.ts`                                       | OpenAI vision, text embeddings, web discovery, image comparison |
| `src/lib/listings.ts`                                 | Product/offer metadata and purchase evidence                    |
| `src/lib/matching.ts`                                 | Freshness, deduplication, ID validation                         |
| `src/lib/public-fetch.ts`                             | Restricted remote fetching                                      |
| `data/catalogue-sources.json`                         | Bounded, hand-selected retailer URLs                            |
| `data/catalogue.json`                                 | Prepared records and observed evidence                          |
| `scripts/prepare-catalogue.ts`                        | Refresh metadata and local product photos, no AI calls          |
| `scripts/import-catalogue.ts`                         | Idempotent Supabase import with precomputed AI descriptions     |
| `supabase/migrations/202609230001_furniture_demo.sql` | Schema, pgvector retrieval, private storage                     |

Products, variants, images/descriptions/embeddings, and country offers are separate. The small catalogue uses an exact cosine scan in pgvector. An approximate vector index would add complexity without helping a 31-variant demo.

## Validation and limitations

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. The focused tests cover country/stock/freshness eligibility, variant-safe deduplication, source provenance, untrusted AI IDs/URLs, ambiguous listing data and private-network fetch rejection. Browser rehearsal notes and the short recording are in `docs/validation.md` when present.

- Catalogue coverage is IKEA only; live web discovery is the path to other retailers. Different countries can have fewer offers or different variants. Posters are a particular coverage gap.
- The parser intentionally supports explicit product JSON-LD evidence. Retailers that block server requests, require JavaScript, or publish delivery only in prose may appear as unconfirmed or be omitted. This favors evidence over recall.
- Retailer structured data can lag actual stock. Listed prices can change and may exclude delivery charges. Always use the purchase link to confirm checkout eligibility.
- Generative visual ranking is subjective. Low-resolution, obscured furniture and subtle construction details require actual rehearsal. There is no claim of exact identity or measured retrieval accuracy.
- The UI can display fewer than five results, including zero, when relevance or country evidence is insufficient. A web outage must remain visible.
- Fresh searches can take around one to two minutes. Cached requests are substantially faster. See the validation report for observed timings; API billing cost was not measured. Catalogue preparation itself does not invoke AI.
- The initial rehearsal exposed a web-search timeout. Discovery now requests a short search-only pass with low search context and a 120-second timeout. This is a best-effort prompt limit, not a guaranteed number of tool calls. A source timeout remains visible and does not hide usable catalogue results.

## Reference documentation

- [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [OpenAI image inputs](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI web and image search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI text embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [Supabase vector columns](https://supabase.com/docs/guides/ai/vector-columns)
- [Supabase private storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)
