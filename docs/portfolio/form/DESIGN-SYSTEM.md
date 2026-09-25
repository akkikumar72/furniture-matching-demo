# Form portfolio presentation

Scope confirmed by the user: **portfolio image pack and preview only**. The Form product interface stays unchanged. This direction supersedes the earlier forest-green/serif presentation boards.

## Reference

Use the visual rhythm of [Sunbeam](https://sunbeam.framer.media/) and the user's `download.jpeg`: a light page floating inside a bright lime surround, generous hero spacing, a centered headline, rounded pale controls and product imagery inside a lime frame. Keep Form's own content and identity. No borrowed reviews, customer metrics or mascot artwork.

## Tokens

| Role | Value | Use |
| --- | --- | --- |
| Ink | `#1A1A1A` | Headlines, body emphasis, primary buttons |
| Paper | `#FAFAF8` | Main rounded page shell |
| Lime | `#DDFF7F` | Product frames and accent fields |
| Cloud | `#EEECE8` | Secondary buttons and selected pills |
| Muted | `#66685E` | Supporting copy |
| Lilac | `#CC81EF` | Small decorative arch, paired with pink `#F6B8ED` |

The outer surround uses a pale yellow-lime to fresh green gradient, with a subtle SVG grain overlay. It is intentionally tied to the supplied reference. Avoid adding a gradient to every component.

## Typography

[Urbanist](https://fonts.google.com/specimen/Urbanist), self-hosted in `source/urbanist-latin.woff2`. Use weight 500 for display text, 400–500 for copy, and 600 for controls. Heading letter spacing is about `-0.035em`, with line height `1.04–1.1`. The reference's desktop heading was observed at 64px / 76.8px, weight 500. This preview uses a responsive 40–70px hero. No serif headline remains in the active presentation.

## Layout and interaction

1. A rounded white shell contains a quiet nav, centered headline, concise description and two actions. Lime stays around the shell and product image.
2. A three-button capture switcher presents Original, Design and Rendered. These are real existing images; the preview does not run the Form editor or generate new renders.
3. The library filters Core, Supporting and All images. Each item has a useful caption and direct download.
4. The content follows Akkivo's three sections using the existing portfolio data contract. Keep real UI screenshots legible and unaltered inside their presentation frames.
5. Use 24–32px shell/frame radii, pill controls, visible keyboard focus and reduced-motion support. The preview collapses to one column on small screens.

The two decorative shapes are original CSS forms. Keep them out of the actual room photograph and app screenshots. Never use decorations to imply new product features.
