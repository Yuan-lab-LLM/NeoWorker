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
  version: "3.2.0"
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

1. Resolve the task mode: `create`, `template`, `edit`, `read`, or `auto`.
   Use `template` when creating new content in a supplied company PPTX design.
   Read `references/template-library.md` and import it with `import_template.mjs`
   instead of the new-deck bootstrap. Existing-deck translations remain edits.
   For existing-deck edits, use `references/editing.md` instead of steps 4–8.
   Static native visual edits use `native-edit.mjs` for inventory,
   `compose_native_edit.mjs` to compile semantic layout choices directly from
   source text, then `build_edit.mjs` for applying the plan and rendered QA.
   Prefer the composition compiler over hand-writing text and coordinates.
2. Resolve the output project directory. Default to
   `{artifactDir}/presentation-studio`.
3. For new catalog decks, run `node {baseDir}/scripts/prepare_project.mjs`
   with the bootstrap arguments below. It checks runtime dependencies, scaffolds
   the project and returns source-figure batches in one call. Other modes run
   `node {baseDir}/scripts/preflight.mjs`.
   Runtime dependencies are bundled. Do not install npm packages in the output
   project or reverse-engineer the runtime scripts. If preflight fails, report
   the specific missing dependency instead of repeatedly trying the same command.
4. The combined preparation command uses these scaffold arguments (do not
   scaffold twice). Standalone bootstrap remains available:
   `node {baseDir}/scripts/bootstrap_project.mjs --project-dir "<project dir>" --language "<language>" --style "<style>" --title "<title>"`.
   When the source material is DOCX/PPTX, also pass `--source "<source file>"`.
   This extracts original figures and nearby text to `source-assets-*.json` and
   `slides/imgs/`. Inspect those figures before authoring: attachment text omits
   visual evidence. PDF sources require `read_pdf_visual` as well as text.
   For DOCX/PPTX figures use `analyze_image` with `paths: ["figure-1.png", ...]`
   in batches of up to five and one common prompt about labels, relationships,
   and evidence. It runs three inspections concurrently. Do not issue a separate
   model/tool round trip per figure or shell-resize originals for analysis.
   Use `--palette auto` by default. The catalog's `designFamily` owns the color
   system; do not copy a legacy palette into `layoutColors` unless deliberately
   following requested branding.
5. For new catalog decks, read only `references/catalog-authoring.md`: it
   consolidates the narrative, visual design, typed schema, safe drafting limits
   and repair workflow. Other design references are optional for bespoke needs,
   not prerequisites for every deck. Read source text only when it is missing
   or truncated in the attachment context.
6. Complete the source-grounded brief, evidence and all slide content together.
   Build directly with `build_and_qa.mjs`; it already runs plan, schema, source
   coverage and capacity validation before export. `validate_plan.mjs` remains
   available for diagnosis but is not a required extra round trip. Patch only
   reported fields/slides after failures; preserve the rest of the plan.
7. For new decks, fill typed slide
   content in `presentation-plan.json`. Use one design family and automatic
   layout selection, or an explicit compatible layout. The catalog rejects
   overflow and unsupported fields without discarding content or shrinking text.
   Keep images under `slides/imgs/`. Choose the visual before writing prose:
   for a technical architecture use `flow` with actual branches and convergence;
   for document parsing use `transformation` with regions and processing stages;
   for mechanisms use `mechanisms` with meaningful symbols and sequence only
   when the source establishes that sequence. Use `system` for a technical
   cover and `evidence-stage` for three qualified numeric callouts. Read their
   complete examples in `references/layout-catalog.md`. Do not turn technical
   relationships into editorial rows simply because rows are easier to fill.
   Preserve source figures in the actual PPTX, especially product screenshots,
   parsing examples, architecture details and evidence charts. A native redraw
   can explain their relationships but does not replace the original evidence.
   Keeping originals only in the project or speaker notes is not sufficient.
   Use `image-wide` for dense figures and `image-gallery` for 2–4 related source
   images with editable captions. Preserve aspect ratio and all original labels.
   Low resolution is a source limitation, not permission to omit a figure:
   retain it and add concise native explanation without inventing finer detail.
   For supplemental redraws map actual relationships into `flow`,
   `transformation`, `mechanisms`, `steps`, `layers`, `columns` or `chart`;
   `visualBrief` alone does not create a visual. Do not use metrics for prose.
   Account for every extracted figure. Individual decorative, duplicate or
   out-of-scope images may be excluded with a specific decision in
   `sourceVisualReview.exclusions` (see layout-catalog.md). Record an explicit
   user instruction when the user asks to omit evidence. A global native-redraw
   rationale or reusing just one image must not waive the remaining originals.
   Existing module projects remain supported;
   use `--layout-engine modules` for a deliberately custom design that
   the catalog cannot represent. Do not mix modules and catalog content.
8. Compile and run QA:
   `node {baseDir}/scripts/build_and_qa.mjs --project-dir "<project dir>"`.
9. Inspect every rendered page, not only extracted text. Use the PNG batches
   listed in `visual-review-queue.json` with `analyze_image`, `paths` up to five,
   `max_dimension: 960`, and one concise review prompt. The build already rendered
   these images; do not re-render the PDF with read_pdf_visual for the same check.
   For sources that only have a PDF, read_pdf_visual remains available. Inspect
   higher-resolution crops for unclear labels. Keep page identity and successful
   reviews; retry only failed images. A failed image is not verified.
   Check typography, clipping, collisions, hierarchy, contrast, chart labels,
   and whether each slide has an obvious visual job. Collect all findings from
   a pass and fix them together instead of rebuilding after each individual page.
   Ask the reviewer to identify the strongest remaining design/content problems,
   rather than only answering a leading yes/no checklist about clipping. Check
   title line breaks (do not split a Chinese term such as 精准度 across lines),
   duplicated captions, palette consistency across pages and whether explanatory
   text changes a source metric's meaning. Retrieval precision must not be
   relabelled generation accuracy. Use deliberate newlines to keep phrases intact.
   When redesigning a rejected deck, first render representative cover,
   architecture, technical explanation and evidence pages from the actual PPTX.
   Compare them with the rejected pages before extending the design to the full
   deck. Fix the hierarchy and explanatory visuals, not only clipping. A valid
   file, a different palette, more images or a successful render is not evidence
   of improved design. Do not claim a deterministic compiler sample proves that
   an unattended model run will make equally good authoring decisions.
10. Fix the issues found, then run `build_and_qa.mjs` again. Do not claim the
   deck is final until a complete verification pass reveals no new blocking
   issue. Recheck changed pages and any pages affected by shared layout/theme
   changes; retain the prior inspection only for unchanged pages. Never count a
   failed vision request as a passed check.
11. Deliver the newly generated PPTX path reported by the build, the source
    directory, and `<project dir>/qa-report.json`. Never overwrite an earlier
    deck; subsequent builds use `presentation-v2.pptx`, `presentation-v3.pptx`,
    and so on.

## Design rules

- Template fonts, colors, dimensions, artwork and native object structure take
  priority over the defaults below. Never apply catalog styling to a template.
- Otherwise use 16:9 (`LAYOUT_WIDE`).
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
│   └── imgs/
├── output/
│   └── presentation.pptx
├── preview/
│   ├── slide-1.png
│   └── index.html
└── qa-report.json
```

New projects use `layoutEngine: "catalog-v1"` with slide content in the plan,
not slide modules. See `references/catalog-authoring.md` for all 20 layouts and
the three design families. The capacity estimate is not rendered visual QA.
Existing module projects remain compatible.
Only module projects add `slides/slide-01.mjs`, `slides/slide-02.mjs`, etc.

In a module project, every slide module must export both a `slideConfig` object and a synchronous
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

“优化PPT” and “improve this deck” include visual improvement. Preserve slide
count/order and source evidence without freezing positions, font sizes, spacing
or hierarchy. Only explicit content-only or original-format requests freeze
those visual properties. Do not mistake fewer words or valid XML for an
improved design. Render before and after, run `scripts/inspect_edit.mjs` with
the candidate's actual PDF, and inspect every page. When rendering fails,
deliver an unverified draft instead of claiming visual optimization is complete.

### Translating existing decks

Translation, localization, and language conversion of an attached/source PPTX
are always editing operations unless the user explicitly asks to redesign,
rebuild, or replace the template. Copy each source deck and replace its text in
the native PPTX package. Preserve slide masters, layouts, theme, fonts, canvas,
slide count and order, images, charts, tables, notes, transitions, and reusable
assets. Adjust text fit only as much as the target language requires.

In NeoWorker, use `office_translation` with `action: inspect` to obtain the
source-bound text manifest, then `action: apply` with the translated manifest.
This preserves the native package and verifies non-text parts before publishing.
Do not install Python packages or fall back to a new-deck generator. Package
fidelity is not visual QA: inspect the rendered output for text fit separately.

For multiple source decks, produce one translated output per input and keep the
decks independent. Never merge them or bootstrap a blank project. If native
preservation is blocked, report the blocker instead of silently creating a new
generic deck.

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
