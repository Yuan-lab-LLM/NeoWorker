---
name: presentation-studio
description: >
  Default PowerPoint workflow for creating, editing, inspecting, or repairing
  native editable PPTX decks with integrated narrative planning, style routing,
  evidence checks, rendering, and visual QA. Use for ordinary PPT, PPTX, slide,
  deck, and presentation requests unless the user explicitly selects another
  presentation workflow.
license: MIT
metadata:
  version: "2.0.0"
  upstream:
    - "https://github.com/siril9/presentation-skill"
    - "https://github.com/gnipbao/knowledge-cat-ppt-skill"
---

# Presentation Studio

## Purpose

Create, edit, inspect, and repair native PowerPoint files with a design-first,
source-first workflow. This is NeoWorker's default skill for `.pptx`, PPT,
PowerPoint, slide-deck, and presentation requests. Word and Excel work should
continue to use the native Office tools.

When this skill is active, do not call `create_presentation` or
`generate_presentation`. Those are the legacy quick-template path and do not
run this source-first workflow. Build through the project scripts with
`run_command`; otherwise the output must not be represented as a Presentation
Studio result.

The design and QA rules are adapted from MiniMax AI's MIT-licensed
`pptx-generator` skill. Narrative planning and quality rules are consolidated
from Knowledge Cat PPT Skill, while layout routing and deterministic PPTX QA
are consolidated from presentation-skill. NeoWorker keeps one coherent default
workflow instead of exposing those upstream projects as competing skills.

## Non-negotiable outcome

Do not stop at a valid PPTX package. A successful delivery must be:

- native and editable in PowerPoint or Keynote
- visually varied instead of repeating title-plus-bullets
- readable with the fonts available on the current operating system
- rendered to real slide images for inspection whenever a renderer is available
- kept with its editable source files so follow-up edits do not start over

## Workflow

1. Resolve the task mode: `create`, `edit`, `read`, or `auto`.
2. Resolve the output project directory. Default to
   `{artifactDir}/presentation-studio`.
3. Run the preflight:
   `node {baseDir}/scripts/preflight.mjs`.
4. For a new deck, scaffold a workspace-local project:
   `node {baseDir}/scripts/bootstrap_project.mjs --project-dir "<project dir>" --language "<language>" --style "<style>" --title "<title>"`.
5. Read `references/narrative-and-quality.md` and
   `references/style-routing.md`, then read `references/design-system.md`,
   `references/slide-types.md`, and `references/pitfalls.md`. Read
   `references/editing.md` only when editing an existing deck. Read
   `references/pptxgenjs.md` only for API details.
6. Complete `presentation-plan.json`: define the deck brief, core message,
   narrative tension and resolution, evidence register, one visual grammar,
   and one intent/takeaway/role per slide. Validate it before layout:
   `node {baseDir}/scripts/validate_plan.mjs --project-dir "<project dir>"`.
7. Create or edit one synchronous `createSlide(pres, theme)` module per slide
   under `<project dir>/slides/`. Keep images under `slides/imgs/`.
8. Compile and run QA:
   `node {baseDir}/scripts/build_and_qa.mjs --project-dir "<project dir>"`.
9. Inspect every PNG in `<project dir>/preview/`, not only extracted text. Check
   typography, clipping, collisions, hierarchy, contrast, chart labels, and
   whether each slide has an obvious visual job.
10. Fix the issues found, then run `build_and_qa.mjs` again. Do not claim the
   deck is final until a complete verification pass reveals no new blocking
   issue.
11. Deliver the newly generated PPTX path reported by the build, the source
    directory, and `<project dir>/qa-report.json`. Never overwrite an earlier
    deck; subsequent builds use `presentation-v2.pptx`, `presentation-v3.pptx`,
    and so on.

## Design rules

- Use 16:9 (`LAYOUT_WIDE`).
- Choose one of the supplied palettes and one style recipe. Do not invent a
  rainbow of unrelated colors.
- Each slide has one job and exactly one page type.
- Avoid three adjacent slides with the same composition.
- A palette swap is not a redesign. If the previous and revised slide have the
  same silhouette, hierarchy, and information placement, the revision failed.
- Choose layouts from the content semantics: metrics need a metric composition,
  comparisons need named opposing sides, timelines need chronology, and tables
  need content-weighted columns instead of equal-width defaults.
- Do not use decorative title underlines. They are visually generic and make
  decks look machine-generated.
- Do not create generic title-plus-bullets slides. When no image is available,
  use editorial typography, data hierarchy, charts, tables, chronology, and
  spatial grouping to carry meaning; never draw a fake image placeholder.
- For investment, company, product, market, or research decks, source
  evidence-bearing visuals where relevant. A deck made only from text boxes,
  divider lines, and generic cards is incomplete even when the PPTX package is
  valid. Prefer real company/product imagery, sourced market charts, and
  data-driven comparisons over decoration.
- Do not expose speaker notes, production instructions, prompts, or layout
  commentary as audience-facing slide copy.
- Left-align body copy. Center alignment is for covers, dividers, and short
  statements only.
- Use meaningful font-size contrast. Body copy should normally remain between
  14pt and 20pt; titles should normally be 30pt or larger.
- Use normal weight for body copy. Reserve bold for hierarchy.
- Keep all colors as six-character hex values without `#` in PptxGenJS calls.
- Never encode opacity in a hex string; use the transparency or opacity option.
- Never reuse mutable PptxGenJS option objects across multiple calls.

## Narrative and style routing

- Begin with the audience decision and the core message, not a list of topics.
- Use a narrative spine with context, tension, resolution, and an explicit next
  move. A slide may be visually attractive and still fail if its role in that
  spine is unclear.
- Give every slide one job, one takeaway, and one evidence obligation.
- Select one primary visual grammar for the deck. Route among answer pyramid,
  evidence plate, journey map, editorial spread, thesis stage, operating grid,
  public docket, and telemetry canvas according to the task; do not mix styles
  merely for novelty.
- Maintain an evidence register and connect factual slides to evidence IDs.
- Treat package validity, content integrity, visual inspection, and narrative
  continuity as four separate QA passes.

## Font rules

Use the generated theme contract instead of hard-coding font names:

- `theme.fonts.heading`
- `theme.fonts.body`
- `theme.fonts.mono`

The bootstrap selects fonts that render correctly on the current platform:

- macOS Chinese: PingFang SC
- Windows Chinese: Microsoft YaHei
- Linux Chinese: Noto Sans CJK SC
- Latin: Aptos/Arial-compatible system fallbacks

For mixed Chinese and English slides, use the platform Chinese body font for
the entire text box unless a verified Latin-only display face is intentional.

## Project contract

```text
presentation-studio/
├── presentation-plan.json
├── theme.json
├── slides/
│   ├── slide-01.mjs
│   ├── slide-02.mjs
│   └── imgs/
├── output/
│   └── presentation.pptx
├── preview/
│   ├── slide-1.png
│   └── index.html
└── qa-report.json
```

Every slide module must export both a `slideConfig` object and a synchronous
`createSlide` function:

```javascript
export const slideConfig = {
  index: 1,
  type: "cover",
  title: "Presentation title",
};

export function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.colors.bg };
  // Add content with theme.colors and theme.fonts.
  return slide;
}
```

## Editing existing decks

Never overwrite the user's original file. Copy it into the project first,
preserve a source backup, and follow `references/editing.md`. If the existing
deck has a coherent template, preserve its master/layout language rather than
rebuilding it with unrelated styling. Render the edited output before delivery.

## Failure handling

- If rendering tools are unavailable, still compile and validate the package,
  but report that visual QA is incomplete. Do not describe it as fully verified.
- If a font is missing, switch to the generated platform-safe font rather than
  relying on silent substitution.
- If preview images are incomplete, treat that as a QA failure and retry with
  the alternate renderer or reduce the problematic slide to supported native
  shapes.
- If content is too dense, split the slide. Do not shrink body text below a
  readable size merely to make it fit.

## Attribution

The bundled workflow is adapted from the MIT-licensed projects listed in
`THIRD_PARTY_NOTICES.md`, including MiniMax AI's `pptx-generator`,
`siril9/presentation-skill`, and `gnipbao/knowledge-cat-ppt-skill`.
