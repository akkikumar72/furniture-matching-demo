# Paste this into the portfolio project

Add **Form** as one new portfolio grid tile and a case study, immediately after Akkivo. Implement the change in `your local akash-portfolio checkout`.

Use this prepared handoff pack:
`docs/portfolio/form in a local checkout of furniture-matching-demo`

## 1. Inspect before editing

Read the portfolio's `AGENTS.md`, `CONTEXT.md` and `docs/EDITING.md`, then inspect `git status --porcelain`. Preserve all existing changes, staged deletions and project order apart from inserting one Form tile. Read `content/akkivo.ts`, `content/case-studies.ts`, `content/gallery.ts` and the existing case-study component and styles. Check the installed Next.js documentation for any Next-specific changes.

## 2. Reuse the existing portfolio structure

Copy the supplied `content/form.ts` into the portfolio's `content/form.ts`. Copy all 13 images from the handoff's `assets/` directory to `public/assets/`, keeping filenames unchanged. Use only the six core images in the default case-study layout; the other seven are supporting assets.

Import `form` into `content/case-studies.ts` and add it to the `caseStudies` registry. Keep the existing `CaseStudyData` contract and inferred `CaseStudyKind` type. Import `formGridTile` into `content/gallery.ts` and insert it directly after `akkivoGridTile`. Do not replace Akkivo or create extra Form tiles.

Reuse the existing native case-study modal, backdrop, animation, close behaviour and CSS Modules. Do not introduce a new route, modal system, UI kit or dependency. Keep the same title, summary and three-section structure as Akkivo: **The idea**, **The workspace**, **How it’s built**. The supplied copy is ready to use; preserve its factual boundaries.

## 3. Use the supplied images intentionally

The user has chosen **Sunbeam-inspired styling for the image pack and preview only**. Read `DESIGN-SYSTEM.md`. The supplied imagery already uses Urbanist, bright lime framing, warm white rounded panels and soft shapes. Preserve that visual treatment. Keep the live Form app and the portfolio’s global typography unchanged. The standalone `index.html` is an image-library preview, not a replacement for the portfolio homepage. Do not copy its mock navigation into the Form product or import Sunbeam testimonials and metrics.

Use `form-thumbnail.webp` for the grid, `form-hero.webp` for the hero, and `form-workspace.webp` as the lead image. Place `form-before-after.webp` under The idea, `form-focus.webp` under The workspace, and `form-export.webp` under How it’s built. The manifest contains alt text, captions, dimensions and provenance.

Preserve full image proportions for the stacked section images. Check the hero crop at desktop and narrow widths because the existing hero uses a fixed height and object-fit: cover. If the typography is cut off on mobile, prefer a Form-specific hero treatment using the existing image/container options or a narrowly scoped modifier. Do not change the crop of unrelated case studies. Keep meaningful captions visible if adapting the layout, especially the AI-generated output label. Use the seven optional assets only if they improve the final presentation. They are not additional grid tiles.

## 4. Keep the claims accurate

Form is a working prototype with the flow **upload → furnish → Render**. Users place editable furniture over the original room photo; Three.js handles perspective behind the scenes. AI analysis and generation use a server connection. Only browser draft storage and export are local. A rendered image is a still, not an editable reconstructed room. Scale is estimated unless measurements are confirmed, and generic product substitutes must remain labelled.

JPEG, PNG, WebP and PDF export are implemented. Native, 2K and 4K presets exist; 2K/4K upscale the completed image and do not generate new detail. The image pack includes a real successful output from the app, not a fictional marketing mockup. Do not invent usage metrics, commercial results, testimonials, clients, exact-product model coverage, walkthroughs, cloud accounts or checkout. Keep review and reviewer empty. Cloud projects and purchasing are future work.

No public live demo URL has been verified. Do not publish a localhost CTA. The public repository is `https://github.com/akkikumar72/furniture-matching-demo`. This documentation update publishes the preview and portfolio handoff only; the room-studio implementation captured in these images is separate local work. Link to the repository as a project reference, and do not imply that this documentation branch ships the full pictured room editor.

## 5. Verify the integration and hand off

Run `npm run audit:content`, `npm run typecheck` and the repository's integrity tests. Run `npm run build:preview` for the local build; normal production builds require a valid public `NEXT_PUBLIC_SITE_URL`. Run the repository's browser checks once, or its aggregate `npm run verify` without unnecessarily repeating already-passed checks.

Inspect the actual homepage and Form modal at desktop and mobile widths. Verify there is one new Form tile, no missing images or horizontal overflow, readable hero text, complete section images, Escape/close behaviour, focus restoration to the tile and reduced-motion behaviour. Confirm Akkivo still opens normally and existing content is unchanged. Capture the finished tile and open case study.

Return a concise list of changed files, checks performed and any unresolved issue. Do not commit, push or deploy unless separately requested.

The grid cover `form-thumbnail.webp` is **1200 × 1200 px (1:1)**, matching the Akkivo banner. Use a square grid image container without stretching. A same-size PNG alternative is included as `form-thumbnail.png`; keep the wide `form-hero.webp` for the case-study hero.
