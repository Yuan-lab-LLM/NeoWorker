---
name: visual-presentation
description: Create image-led, visually distinctive PowerPoint decks with editable native text. Use for new PPT/PPTX requests that explicitly ask for a beautiful, premium, keynote, launch, pitch, marketing, roadshow, cinematic, editorial, or highly visual result.
---

# Visual Presentation

Create visually strong 16:9 PowerPoint decks without asking an image model to
render important text. This workflow adapts the MIT-licensed visual language and
style references from Jim Liu's `baoyu-slide-deck`, then adds a NeoWorker hybrid
exporter: generated raster artwork stays visual, while titles, body copy,
metrics, and citations remain native editable PowerPoint text.

## Boundary

Use this workflow only when the user is creating a new deck and explicitly
values visual impact: product launch, keynote, pitch, roadshow, marketing,
campaign, showcase, premium/editorial/cinematic styling, or a request such as
“做得好看一些”.

Do not use it for:

- editing an existing PPTX
- a data-heavy deck where exact native charts and tables matter more than art
- a request that prioritizes fully editable geometry on every visual
- Word, Excel, PDF, or a web-only presentation

Those tasks belong to Presentation Studio or the relevant Office workflow.

## Non-negotiable output

- Create exactly one new final PPTX per run. The first uses
  `{artifactDir}/visual-presentation/output/presentation.pptx`; later runs
  preserve it and use `presentation-v2.pptx`, `presentation-v3.pptx`, and so on.
- Keep editable source content in
  `{artifactDir}/visual-presentation/deck.json`.
- Keep every generation prompt in `prompts/` and every generated visual in
  `images/`.
- Never call `create_presentation` or `generate_presentation` while this skill
  is active.
- Never create a second “backup”, “draft”, “minimax”, or legacy PPTX beside the
  final artifact.

## Core idea: artwork without baked-in copy

Generated slide artwork must contain **no words, letters, numbers, labels,
logos, watermarks, signatures, UI text, charts with labels, or fake glyphs**.
The prompt must reserve a quiet text-safe region. All meaningful copy is placed
later by `merge_to_pptx.mjs` as native text.

This avoids the common failure where Chinese disappears or becomes nonsense in
rendered slide images. It also makes corrections cheap: edit `deck.json` and
re-run the merge command without regenerating the artwork.

## Workflow

1. Resolve the project directory as `{artifactDir}/visual-presentation` unless
   the user explicitly chooses another workspace-local directory.
2. Run:
   `node {baseDir}/scripts/preflight.mjs`.
3. Read these references before outlining:
   - `references/analysis-framework.md`
   - `references/content-rules.md`
   - `references/design-guidelines.md`
   - `references/layouts.md`
4. Select one style. Read exactly one relevant file under `references/styles/`
   and, only when needed, the matching dimension references.
5. Scaffold the project:
   `node {baseDir}/scripts/bootstrap_project.mjs --project-dir "<project dir>" --title "<title>" --language "<language>" --style "<style>"`.
6. Build the narrative first. Use 6–12 slides by default. Every slide must have
   one job and one primary composition. Avoid three adjacent slides with the
   same text placement or page type.
7. Replace the sample `deck.json` with final copy and layout metadata. Keep
   titles concise and body copy scannable. Use the schema already present in
   the scaffolded file; do not invent a second source format.
8. Write one complete prompt file per slide under `prompts/` before generating
   any images. Each prompt must include:
   - 16:9 widescreen composition
   - chosen style, palette, texture, lighting, subject, and visual metaphor
   - the exact quiet region required by `textPlacement`
   - “no text, letters, numbers, labels, logos, watermarks, or fake glyphs”
9. Call `generate_image` once per prompt using `aspectRatio: "16:9"`, normally
   `imageSize: "2K"`, and a workspace-relative filename that resolves into the
   project's `images/` directory. Distinct slide prompts are required.
10. Update each slide's `image` field in `deck.json` to the generated image
    filename. Do not paste important text into a bitmap to repair it.
11. Compile once:
    `node {baseDir}/scripts/merge_to_pptx.mjs --project-dir "<project dir>"`.
12. Inspect `qa-report.json` and the PPTX preview. Fix weak hierarchy, illegible
    overlay contrast, clipping, monotonous layouts, generic stock imagery, and
    repeated silhouettes. Re-run the same merge command after source fixes.
13. Deliver only the one final PPTX plus the source project and QA report.

## deck.json contract

The scaffold contains the full example. Important fields:

- `language`: `chinese`, `english`, or `mixed`
- `style`: one visual preset plus palette/font overrides
- `slides[].type`: `cover`, `section`, `statement`, `content`, `metrics`,
  `quote`, or `closing`
- `slides[].textPlacement`: `left`, `right`, `top`, `bottom`, or `center`
- `slides[].textTone`: `light` or `dark`
- `slides[].image`: a file under `images/`
- `slides[].title`, `subtitle`, `body`, `metrics`, `source`: native text content

## Visual quality rules

- Prefer one decisive image or visual metaphor per slide, not grids of small
  decorative cards.
- Use asymmetry, scale contrast, whitespace, and editorial cropping.
- A palette swap is not a redesign. The silhouette and information hierarchy
  must change with the content job.
- Keep numbers and claims truthful. Image generation may illustrate an idea but
  must not fabricate evidence-bearing charts or product screenshots.
- Put citations in `source`; keep them short and human-readable.
- For financial, medical, legal, or research claims, use real sourced data in
  native text and make uncertainty explicit.
- Never expose production prompts or layout instructions on the slide.

## Failure handling

- If `generate_image` is unavailable, do not silently fall back to the legacy
  template generator. Use Presentation Studio instead and state that the visual
  route was unavailable.
- If one image fails, retry only that slide once with a simplified prompt.
- If artwork contains visible fake text, regenerate it. Do not cover fake text
  with another bitmap or shape.
- If a deck fails QA, fix the same project. Do not create a second PPTX route.

## Attribution

Visual reference material under `references/` is adapted from
`https://github.com/jimliu/baoyu-skills/tree/main/skills/baoyu-slide-deck`
under the MIT License. See `LICENSE.txt`.
