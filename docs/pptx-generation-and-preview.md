# Presentation Artifacts and PPTX Preview

NeoWorker treats generated PowerPoint decks as first-class presentation artifacts. The current model is review-first: users can inspect slides in the task feed, a resizable right sidebar, or fullscreen mode, then request changes through the same follow-up composer used for spreadsheet and document artifacts. Direct slide editing controls are not part of v1.

Presentation artifacts are one surface of the broader [Everything Workbench](everything-workbench.md): generated knowledge-work files open in-place, can be reviewed in context, and keep the follow-up composer beside the artifact.

## Supported Formats

In-app preview:

- `.pptx`

Recognized PowerPoint-style artifacts with external-app and folder actions:

- `.ppt`
- `.pptm`
- `.potx`
- `.potm`
- `.ppsx`
- `.ppsm`

The shared detection and labels live in `src/shared/presentation-formats.ts`. Cards are labeled as `Presentation · PPTX`, `Presentation · PPT`, and so on.

## Artifact Surfaces

Generated presentations can appear from `file_created`, `file_modified`, `artifact_created`, task primary-output metadata, and assistant text that mentions a local presentation path such as `artifacts/output.pptx`.

The task feed renders a compact presentation card:

- orange PowerPoint-style icon
- filename
- `Presentation · <format>` metadata
- default **Open** action
- dropdown actions for external apps and **Open in folder**

For `.pptx`, default **Open** routes to the in-app right-sidebar preview. For legacy or non-previewable PowerPoint formats, default opening falls back to the external app path.

## Viewer Experience

The reusable viewer is split between:

- `src/renderer/components/PresentationArtifactViewer.tsx`
- `src/renderer/components/PresentationViewer.tsx`

Sidebar mode:

- opens in the persisted resizable artifact sidebar
- keeps the main task feed visible to the left
- includes fullscreen and close controls
- shows deck-level copy, external open, and folder actions

Fullscreen mode:

- expands the presentation viewer across the app content area
- keeps the functional follow-up composer overlay
- keeps the latest-turn or working context frame above the composer
- filters the context frame after a follow-up so only events emitted after that prompt are shown
- refreshes the active preview when a matching presentation output event is emitted

Viewer layout:

- slide thumbnails in the left rail
- previous/next navigation and a slide counter in the top toolbar
- zoom selector
- a white canvas with the active slide top-aligned and centered
- rendered slide image when available
- text fallback when rendered images are not available yet
- speaker notes below the slide

## Existing-deck visual editing

Initial skill routing runs before both the native executor and Hermes. A request
such as `优化这个 PPT` with a PPTX attachment activates Presentation Studio's
edit workflow, including when the attachment already lives in the workspace
rather than `.neoworker/uploads`. Explicit content-only requests still preserve
the original layout.

The native edit runner inventories real shape IDs, retains the source package,
applies a per-page design plan, and renders the exact candidate for comparison.
Its `requires-visual-review` status is not a completed visual acceptance check.
The model must inspect the rendered pages and repair defects before delivery.
Originals and edited candidates use the same `render_deck.mjs` font environment;
raw headless LibreOffice calls can silently omit Chinese glyphs and must not be
used as visual evidence. Render directories are fresh for each attempt.

Preflight and both builders share renderer discovery. They can use the optional
locally installed Codex document dependencies on macOS, with explicit renderer
paths taking precedence. These dependencies are not included in NeoWorker's
installer; a machine without a renderer must report an unverified draft.
The command sandbox permits read-only access to these dependency files and, in
source builds, to bundled skill scripts and app dependencies. It does not grant
write access to them or read access to the entire application checkout.

## Generation progress and timeouts

Presentation Studio publishes a viewable draft as soon as `build_and_qa.mjs`
successfully finishes. Visual review continues separately; the draft event is
not a successful final completion. On an execution timeout, the executor first
discovers the last output that matches a successful build QA hash, even when a
shell command created it outside the file tracker. The answer links that file
as an intermediate version and records `timed_out` / `budget_exhausted`, without
another model call. Failed builds and modified bytes are not promoted. A newer
unbuilt plan is not described as the recovered deck.

The build checkpoint recognizes both `run_command` and shell `execute_code`
results, including their different exit-code fields. It still requires matching
on-disk QA evidence; a zero shell exit status alone never approves a file.
Studio delivery compares canonical filesystem locations so macOS `/var` and
`/private/var` aliases do not cause false failures. Symlinks outside the artifact
root and private `.build` outputs remain ineligible for delivery.

`analyze_image` accepts either `path` or `paths` (up to five images). Batches
inspect three images concurrently, return per-image results and retain successful
cache entries if another image fails. Use `max_dimension: 960` for slide layout
review, and inspect a source crop at higher resolution for unclear labels. Only
analysis copies are scaled; the original evidence images remain unchanged.
Pixel dimensions are checked even for highly compressed images below 2 MB.
Active-model vision requests share a 60-second deadline with any output-budget
retry/fallback, propagate cancellation, and do not launch another automatic
request after exhausting that deadline. A timeout never counts as a passed
review. PDF batch failures also return completed page reviews and failed pages.

## Loading Model

Presentation preview loading is intentionally two-phase so opening a deck is fast.

Fast phase:

- parses the `.pptx` package directly
- extracts slide titles, text, and speaker notes
- reuses already-cached slide PNGs when present
- returns immediately without invoking expensive renderers

Render phase:

- renders missing slide PNGs in the background
- updates the open viewer in place when high-fidelity images are ready
- shares in-flight rendering work across sidebar/fullscreen opens
- reuses cached slide images when reopening the same deck

The preview state is exposed through `presentationPreview.renderStatus`:

- `cached`: all available slide images were loaded from cache
- `rendering`: text/notes are visible while image rendering continues
- `rendered`: the full image render finished
- `text_only`: text/notes are available but image rendering did not produce slides
- `failed`: preview extraction or rendering failed in a recoverable way

`renderMessage` can explain the current state, for example `Rendering slide previews...`.

## IPC Contract

`readFileForViewer` accepts:

```ts
{
  presentationRenderMode?: "fast" | "full";
}
```

`fast` returns text, notes, and cached images only. `full` runs the renderer pipeline and returns the enriched preview.

`FileViewerResult.data.presentationPreview` includes deck metadata, slide count, render status, and slide entries. Rendered slides prefer `imageUrl` so cached PNGs can be served as local preview media URLs instead of embedding every image as base64. `imageDataUrl` remains as a compatibility fallback.

The media URL helper is exported from `src/electron/media/index.ts`, and the CSP allows `media:` images in renderer surfaces.

## Rendering Pipeline

The preview service is `src/electron/utils/PptxPreviewService.ts`.

Render priority:

1. Local `soffice` conversion to PDF plus `pdftoppm` page rendering. The
   renderer receives a NeoWorker-managed fontconfig profile with macOS,
   Windows, and Linux CJK font aliases so Chinese text is not silently replaced
   by empty boxes.
2. Bundled OfficeCLI HTML rendered by isolated offscreen Chromium pages.
   The exporter waits for a page-specific paint marker outside the image before
   cropping the native canvas. It must not capture the scrolling viewer, which
   can return stale frames or parts of adjacent slides. Cache version 9 discards
   previews made by the old scrolling capture path.
3. Codex bundled `@oai/artifact-tool` presentation renderer when the preceding
   renderers cannot render the deck.
4. Text-only slide and speaker-note preview when image rendering is unavailable.

`PptxPreviewService` is used as a singleton from the Electron IPC layer so render cache and in-flight render dedupe are shared across preview surfaces.

The cached PNGs live under the existing PPTX preview cache. The cache manifest lets fast mode reuse already-rendered slide images without rerunning artifact-tool or LibreOffice.

## Generation Model

Presentation Studio 3.1 supports two structured authoring routes:

- `catalog-v1` creates native decks from typed content with 20 layouts and
  business, technology and research design families. Capacity checks reject
  overflow without truncating content or shrinking text.
- `template-v1` imports a supplied company PPTX with `import_template.mjs`,
  copies it into the workspace project and records its hash. Reviewed bindings
  connect content fields to native text, table and chart objects. Source pages
  can be selected explicitly or by compatible fields and capacity. Masters,
  layouts, themes and retained media are verified byte-for-byte; repeated charts
  receive independent embedded workbooks. This route requires Python 3.10+.

Existing-deck visual edits have a separate `native-visual-edit-v1` route:
`native-edit.mjs` inventories actual shape IDs and the source hash;
`compose_native_edit.mjs` compiles semantic composition choices for wide decks
of static text and unmerged tables directly from that source inventory. It
supports nine compositions, including definition/evidence splits, conclusion
grids, labelled rows, comparison columns and content-weighted native tables.
It retains all source wording, separates label/body hierarchy, balances short
column headings and computes frame dimensions before writing. Models can
override page choices and bind arbitrary source shape IDs in a brief; they do
not need to transcribe the deck or guess every text-box coordinate. Unsupported
assets, ambiguous roles and excessive density fail explicitly and require the
manual native route. Corporate templates retain their own design language.
`build_edit.mjs` applies a reviewed per-slide plan to a source copy and renders
that exact candidate. Static native text can be repositioned, restyled and
split into a clearer hierarchy while retaining every word and number. Native
tables retain all cells and can receive content-weighted widths, row heights,
explicit colors and typography. Other package parts remain untouched. Fields,
hyperlinks, animations and merged tables require a more precise editor.

“优化PPT” includes visual improvement unless the user explicitly requests only
wording changes or preservation of the original layout. Keeping the slide
count does not freeze its geometry. Candidate-only revisions prevent stale PDF
evidence; missing rendering, missing text or out-of-bounds content block delivery.
Automated checks return `requires-visual-review`, never an aesthetic approval.
Every slide still needs visual comparison against the original. The bundled
writer implements a design plan; it is not an automatic aesthetic scoring model.

Template mode is for new content in an existing design. Translating or revising
an existing deck stays on the preservation editing route. The template reference
contract lives in `resources/skills/presentation-studio/references/template-library.md`.

Both structured routes share versioned outputs, content validation, PDF text
geometry checks and per-slide preview images. Unbound content, excess table
rows and invalid native updates fail before publication. The original template
is never overwritten. Rendering and visual review remain required; structural
checks do not prove PowerPoint or WPS compatibility. Images/SmartArt in a template
are preserved after explicit review, not automatically replaced.

Both presentation generation tool names route through the shared generator:

- `generate_presentation`
- `create_presentation`

The shared generator is `src/electron/utils/document-generators/pptx-generator.ts`.

Generation behavior:

- generic PowerPoint requests route to the bundled `presentation-studio` skill,
  which uses a source-first PptxGenJS workflow adapted from MiniMax's
  MIT-licensed presentation design and QA guidance
- native `generate_presentation` / `create_presentation` calls remain available
  as the structured low-level generator, but are blocked while Studio is active
- OfficeCLI remains the structural/content quality inspector for the final file
- the generated `.pptx` is registered as a task artifact with the correct MIME type

The bundled `kami` skill remains available for explicit editorial slide-deck workflows when the user asks for Kami by name. General deck generation uses Presentation Studio; its activation shares the artifact-output intent parser, including ordinary requests such as “基于材料内容，输出一个PPT文档”.

For DOCX/PPTX source material, bootstrap with `--source`. Original figures are
extracted without changing the source, alongside a manifest with nearby text
and hashes. `image-wide` displays a full-width evidence diagram, while native
process layouts preserve up to six steps. A plan that silently ignores every
extracted figure fails validation unless a specific visual-review rationale is
recorded. This does not replace inspecting the actual rendered slides.

Catalog images are measured from their real files. `contain` uses centered,
aspect-preserving geometry; `cover` crops from the actual source ratio. A
paragraph screenshot is not a substitute for editable text, and the source's
key mechanisms and qualified numerical claims must survive visual redesign.

Build QA publishes only error-free candidates and records the output SHA-256.
The host checks that the delivered PPTX matches a successful report; renaming or
copying a rejected `.build` candidate cannot make it a verified deliverable.
Best-effort completion reports such a result as a draft with partial success.

## Follow-Up Editing

Presentation artifacts do not expose direct slide-edit controls in v1. Edits happen through follow-up prompts:

1. The user opens the deck in fullscreen mode.
2. The user describes a change in the functional composer.
3. The agent updates or regenerates the `.pptx`.
4. The viewer waits until the follow-up work completes, then reloads `readFileForViewer` for the matching deck.
5. The preview shows fresh text immediately and refreshed slide images when rendering completes.

This keeps the deck review experience responsive without introducing a partial PowerPoint clone.

## Implementation Files

- `src/shared/presentation-formats.ts`
- `src/electron/utils/PptxPreviewService.ts`
- `src/electron/utils/document-generators/pptx-generator.ts`
- `src/electron/utils/codex-artifact-tool-runtime.ts`
- `src/electron/ipc/handlers.ts`
- `src/electron/preload.ts`
- `src/electron/media/media-protocol.ts`
- `src/renderer/components/PresentationArtifactCard.tsx`
- `src/renderer/components/PresentationArtifactViewer.tsx`
- `src/renderer/components/PresentationViewer.tsx`
- `src/renderer/components/InlinePresentationPreview.tsx`
- `src/renderer/styles/index.css`

## Verification

For a real-model edit test, use an isolated NeoWorker profile and a dedicated
workspace. When the operator has authorized handling the test approvals, start
the scoped watcher with that test's CDP port, task ID and workspace:

```bash
node scripts/qa/watch-presentation-test-approvals.mjs \
  --cdp-url http://127.0.0.1:PORT --task-id TEST_TASK_ID \
  --workspace /absolute/test/workspace --audit-log /absolute/test/approvals.jsonl \
  --stop-file /absolute/test/stop
```

It permits only pending `analyze_image` requests for existing image files whose
real paths remain inside that workspace, using the normal one-time approval
API. Other approvals are reported for the test operator to inspect. It does not
change product permission settings or handle other tasks. Stop it with the stop
file or Ctrl-C after the test, including any review follow-ups. Keep the test
window in the background so the user does not have to attend its approval UI.

Focused tests:

```bash
node --test scripts/qa/presentation-compositions.test.mjs \
  scripts/qa/presentation-native-edit.test.mjs \
  scripts/qa/presentation-edit-inspection.test.mjs \
  scripts/qa/presentation-test-approvals.test.mjs
npx vitest --config config/vitest.config.ts run \
  src/electron/utils/__tests__/PptxPreviewService.test.ts \
  src/renderer/components/__tests__/presentation-artifact-card.test.ts \
  src/renderer/components/__tests__/presentation-artifact-viewer.test.ts
```

Build checks:

```bash
npm run build:react
npm run build:electron
npm run type-check
```

Manual smoke checks:

- Generate a small `.pptx` deck.
- Confirm the compact presentation card appears without expanding a hidden output row.
- Click **Open** and verify the right-sidebar viewer opens.
- Confirm slide text or cached images appear immediately.
- Confirm rendered slide images replace text fallback after background rendering.
- Toggle fullscreen and verify the follow-up composer and latest-turn/working context frame remain functional.
- Submit a follow-up edit and confirm the preview refreshes after the deck is updated.

### Technical visual compositions

`visual-layouts.mjs` adds five editable compositions to the default catalog:
`cover-system`, `branch-flow`, `document-transform`, `mechanism-track`, and
`evidence-stage`. Auto selection follows concrete `system`, `flow`,
`transformation`, or `mechanisms` fields; it does not infer a technical diagram
from a prose title. Three sourced metrics can select `evidence-stage`, falling
back to `metrics-row` if the primary composition does not fit.

The public authoring schema and complete examples live in
`resources/skills/presentation-studio/references/layout-catalog.md`. Regions,
branch labels, arrows and mechanism symbols are native shapes/text. Diagrams do
not require image generation or remote visual assets. Original source figures remain in the delivered PPTX; native redraws are
supplemental explanations. `image-gallery` supports 2–4 complete originals with
editable captions. Source review checks every figure by hash, including partial
reuse, and rejects blanket native-redraw exclusions. Individual decorative,
duplicate, out-of-scope or user-requested exclusions require recorded reasons.
Low resolution alone is not an exclusion. Compilation still checks every
supplied label, value, caveat and branch.

For rejected designs, inspect representative actual PPTX renders before
expanding the revised direction to the full deck. Geometry, package validity and
rendering checks are technical checks; they cannot award an aesthetic pass.
A curated sample and an unattended model-authored test must be reported
separately. Existing-deck preservation and company-template routing are unchanged.

### Avoiding redundant generation work

New catalog decks use `prepare_project.mjs` to run the existing preflight and
bootstrap together and return the original-figure inspection batches. Their
single default authoring reference is `references/catalog-authoring.md`; the
longer narrative/style/API references remain available for bespoke work. Source
PPTX edits and company templates retain their separate preservation workflows.

`build_and_qa.mjs` already performs plan, schema, source-image and capacity
validation before exporting. A separate successful `validate_plan.mjs` run is
not required. Capacity failures now include frame line limits and approximate
CJK characters per line so the author can patch the affected field without
repeated schema discovery or complete-plan rewrites. These hints never truncate
text or weaken the renderer checks.

A successful build writes `visual-review-queue.json`, which binds the exported
PPTX hash to every existing rendered PNG hash and groups them into batches of
at most five for `analyze_image`. It is a pending review queue, not a passed
review. Reusing those PNGs avoids converting the rendered PDF again. Every
page still needs review; changed files invalidate the corresponding prior
review. Failed requests remain unverified. Network/model retries count toward
end-to-end latency and must not be omitted from reported generation time.
