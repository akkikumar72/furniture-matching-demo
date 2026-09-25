# Evidence and boundaries

## Inspected on 25 September 2026

- First portfolio case study: Akkivo, opened from `http://localhost:3000/`. Read `content/akkivo.ts`, `content/case-studies.ts`, `content/gallery.ts`, the shared case-study styles, `AGENTS.md`, `CONTEXT.md`, `docs/EDITING.md` and package scripts in `your local akash-portfolio checkout`.
- Form: `http://localhost:3001/`, plus `README.md`, `docs/room-studio.md`, `src/lib/room/types.ts`, `src/lib/room/storage.ts`, `src/lib/room/preview.ts`, the render API and package manifest in `the furniture-matching-demo checkout`.
- Captured the existing draft, “A quiet living room”, with seven pieces. An explicit Render click succeeded, made Export available and produced the supplied 1536 × 1024 WebP. Design, Original, Rendered, focus mode and the export dialog were inspected. The draft's furniture was left unchanged.
- The image library and generated content module were checked for readable files, valid image dimensions, missing references and compatibility with the current portfolio content types. This is a handoff, not an installed portfolio change.

## Product facts safe to use

- Photo upload, editable furniture, fixed photo viewpoint, optional perspective and measurement settings, focus mode, undo/redo and browser draft persistence exist.
- The curated library contains 21 pieces across seating, tables, rugs, lighting, plants, storage, bedroom, office, art and curtains. Generic pieces support adjustable dimensions and tint.
- Product URL import and existing reference-image matching are retained. Items without an exact model use explicitly labelled generic substitutes. No bundled asset currently has a verified retailer model mapping.
- IndexedDB saves one active draft, its original photo and latest render. This is not cloud project storage. AI analysis and rendering send images to the configured service; the app is not wholly offline or client-only.
- Export provides JPEG, PNG, WebP and single-page PDF with native, 2K and 4K choices. Larger presets upscale. Export itself does not make another AI request.

## Keep out of current-feature claims

No customer adoption, revenue or measured conversion claims have been established. Do not invent testimonials or say this is production-ready, an exact room reconstruction, an editable AI-generated photograph, a walkthrough, a full-floor planner, or a checkout service. Accounts, cloud projects, verified retailer models and purchasing are roadmap work. No public deployment was verified. The git remote alone does not establish a public or up-to-date source release.

## Credits and asset handling

- Form UI and editorial artboards: captured and prepared from this working project.
- Furniture kit: Kenney, CC0, https://kenney.nl/assets/furniture-kit. The original local implementation includes a copy of the Kenney licence; the assets in this pack are UI captures rather than model files.
- Additional art, curtain and chandelier meshes: existing original Form implementation.
- Presentation typography: Urbanist, downloaded from the Google Fonts URL observed on the Sunbeam reference page. SIL Open Font License is included at `source/URBANIST-LICENSE.txt`. The actual Form UI in the screenshots still uses Geist from the project.
- Visual reference: https://sunbeam.framer.media/ and the user-provided `download.jpeg`. Live computed heading styles verified Urbanist, weight 500, 64px with 76.8px line height at the observed desktop size. Lime backgrounds, rounded shells and pill controls are adapted for this presentation. The abstract shapes are original CSS; Sunbeam mascot illustrations and customer claims were not copied.
- Room photograph: recovered from the user's existing local draft. External attribution/licence was not available in the project state.
- Furnished room still: generated through Form's configured OpenAI image-rendering flow. It is illustrative output; details and placement may vary from the editable arrangement.

Presentation frames may crop the photograph for composition. The optional native original and render are supplied without those crops. Screenshot thumbnails are browser captures, not vector UI exports.
