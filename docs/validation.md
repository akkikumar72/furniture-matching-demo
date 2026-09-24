# Live demo validation

Tested on **23 September 2026**, with the local Next.js production build, the authenticated in-app browser, managed Supabase and actual OpenAI API responses. The live artifacts below contain no mocked results.

## Result

The application works end to end. Upload, image description, vector retrieval, web discovery, photo comparison, purchase filtering and caching all ran successfully. **It is not a reliable five-results-per-image demo.** Four Swedish samples returned 1–3 purchasable alternatives; the green chair and poster had visually similar web candidates but insufficient delivery/stock evidence for the main table.

For the happy-path presentation, use the **wooden chair, side table, coffee table and cantilever chair**. The cantilever chair also demonstrates Sweden, Germany and UK offers. Similarity is subjective; these are alternatives, not exact product identifications. The side-table and coffee-table results in particular differ noticeably in construction.

## Actual browser searches

All rows below were submitted through the real interface and returned HTTP 200. `Unconfirmed` counts are separately displayed alternatives, never main-table offers.

| Reference                      | Market  | Purchasable | Unconfirmed | Duration | Notes                                                      |
| ------------------------------ | ------- | ----------: | ----------: | -------: | ---------------------------------------------------------- |
| Wooden chair                   | Sweden  |           2 |           4 |   32.6 s | Catalogue + web products; final discovery prompt           |
| Side table, uploaded from disk | Sweden  |           1 |           5 |  109.9 s | Initial discovery prompt                                   |
| Coffee table                   | Sweden  |           2 |           3 |   93.3 s | Initial discovery prompt                                   |
| Green chair                    | Sweden  |           0 |           5 |   27.7 s | Both sources worked; delivery evidence missing             |
| Cantilever chair               | Sweden  |           3 |           2 |   42.0 s | SEK offers                                                 |
| Framed poster                  | Sweden  |           0 |           4 |   47.0 s | Related Monaco posters found; purchase evidence incomplete |
| Cantilever chair               | Germany |           2 |           5 |   37.4 s | EUR offers, explicit DE delivery evidence                  |
| Wooden chair                   | UK      |           0 |           3 |   27.1 s | Coverage gap for this reference and market                 |
| Cantilever chair               | UK      |           2 |           5 |   42.8 s | GBP offers, explicit GB delivery evidence                  |
| Cantilever chair, repeated     | Germany |           2 |           5 |  0.187 s | Cache label shown; original evidence times retained        |

The first wooden-chair run took 104.5 seconds and returned a Svenssons/Muuto web product alongside the IKEA catalogue product. Its repeated request took 0.184 seconds. Results vary across new searches. Cached requests retain the previous ranking for one hour.

The final discovery prompt produced six fresh searches in 27–47 seconds in this rehearsal. This small sample is not a latency guarantee. Side-table and coffee-table timing above predates the prompt change; their full live searches were not repeated afterward. API billing cost was not measured.

## Service and interface checks

- Applied the supplied migration to `furniture-demo`. Imported **31 image descriptions/1536-dimensional embeddings, 31 variants and 81 country offers** with zero import failures. Offers: SE 31, DE 28, GB 22. The prepared internal catalogue is IKEA only.
- Verified the pgvector RPC against a stored embedding: self-match similarity above 0.9999, and correctly filtered country offers for SE, DE and GB. Private storage rejects an unsigned public URL while its signed URL loads successfully.
- Verified real upload, six example previews, loading/disabled controls, main results, visible source status, evidence expansion and cache labeling. Country changes clear previous results before searching again. The browser displayed the actual source-timeout fallback and actual invalid-image HTTP 400 error; controls permit another attempt. Unsupported country input also returns HTTP 400.
- Checked the live UK results at 390 px width: document width remains 390 px, the 680 px table scrolls internally and both result thumbnails load. Restored the browser viewport afterward. Purchase links, prices and explicit stock/country evidence were re-fetched for the returned purchasable offers.
- `npm run setup:check`, `npm run build`, `npm run typecheck`, `npm run lint` and all **12 focused tests** passed. No key-shaped credentials were found in the client static bundle. Secrets remain server-side and `.env.local` is ignored.

## Issues found and fixed

1. **Uninitialized Supabase:** keys alone did not create the tables or bucket. Applied the migration and ran the real catalogue import.
2. **False-positive setup check:** a failed HEAD count request could have no error object. The checker now verifies an actual row-query response.
3. **Missing retailer price:** Svenssons places its current price in `UnitPriceSpecification`. The parser now reads an unambiguous current price and excludes crossed-out/member prices. The actual black Cover chair schema yields SEK 5,595. A regression test covers this format. Explicit `doesNotShip` exclusions are also respected and tested.
4. **Slow web discovery:** the initial green-chair search hit the 90-second web timeout. The UI kept its catalogue result and reported the unavailable source. Discovery now requests at most two search passes, no individual page investigation, low search context and a 120-second timeout. This prompt is best effort, not a hard tool-call ceiling. The rerun completed in 27.7 seconds with both sources available.

Match-cache version was bumped so responses produced before the parser/discovery fixes are not reused. Catalogue import invalidates match caches across versions.

## Remaining limitations

- The catalogue needs better category coverage and more verified retailer offers to consistently show five useful matches. Green-chair and poster samples should not be presented as happy-path purchasable results yet.
- Many closer web products publish shipping only in prose, omit structured availability, or block server retrieval. The current parser leaves these unconfirmed or omits them. Country-domain/currency guesses are never used as delivery evidence.
- Listed stock/prices may lag checkout; postcode-specific shipping is not guaranteed. Evidence expires after 24 hours. Refresh the catalogue and rerun before a later presentation.
- No production deployment, load testing, authentication or abuse protection was attempted. Keep the demo bound to localhost.

## Evidence and recording

- `output/live/live-demo-walkthrough.mp4`: 17.5-second recording of actual live results, Sweden-to-Germany country change, cached response and evidence details. Waiting pauses are shortened; it is not a latency benchmark.
- `output/live/*-se*.json`, `*-de*.json`, `*-gb*.json`: actual browser response bodies, with private signed-image query tokens removed.
- Corresponding PNGs: actual search results, including empty and unconfirmed states.
- `output/live/evidence-details.png`, `mobile.png`, `invalid-image-ui.png`: live evidence disclosure, mobile result table and real upload failure.
- `output/live/link-checks.json`: retailer-page rechecks for purchasable results.

Earlier artifacts under `output/playwright/` include explicitly labeled UI fixtures from before credentials were configured. They are retained as historical UI checks and are not the live rehearsal evidence.
