# Kami Skill

`kami` is a bundled NeoWorker skill for typesetting polished editorial documents with the Kami design system.

It is designed for:

- resumes and CVs
- one-pagers and white papers
- formal letters
- portfolios
- designed reports and editorial PDFs
- diagram pages
- slide decks with editable source output

It is not the right tool for:

- web app UI or landing pages
- spreadsheet generation
- plain text drafting with no designed artifact
- heavily branded layouts that intentionally break the Kami visual system

## What The Skill Does

Compared with importing the upstream `SKILL.md` directly, NeoWorker's bundled `kami` integration adds a stronger local workflow:

- dependency preflight through `resources/skills/kami/scripts/setup.sh`
- deterministic project scaffolding through `resources/skills/kami/scripts/bootstrap_project.py`
- workspace-local source files instead of editing bundled templates
- HTML-to-PDF rendering through `resources/skills/kami/scripts/render_html.py`
- Node-native slide rendering through `resources/skills/kami/scripts/render_slides.mjs`
- browser-based slide PDF rendering when a local Chromium-family browser is available
- explicit artifact reporting for assumptions, blockers, and output paths

The bundle keeps Kami's editorial design language while adapting it to NeoWorker's local-file runtime.

## How To Use It

`kami` is a built-in bundled skill. There is nothing to install from the Skill Store.

The easiest way to use it is to ask directly in natural language, for example:

```text
Use the kami skill to turn notes/founder-story.md into a polished English one-pager and render a PDF.
```

```text
Build me a designed resume PDF from my existing resume notes and keep the editable source files in this workspace.
```

```text
Create a slide deck with the kami skill for our seed pitch narrative. Keep the layout restrained and export PPTX first.
```

Good requests usually include:

- the target document type
- the audience or reader
- the source material path or pasted notes
- whether editable source files are required
- whether rendering should stop at source files, produce PDF, or produce PPTX

## Invocation Model

`kami` follows NeoWorker's additive skill runtime.

- The original task stays canonical.
- The skill adds scoped execution context and file expectations.
- It does not replace the user's task with a synthetic prompt.

See [Skills Runtime Model](../skills-runtime-model.md).

## Parameters

The bundled manifest supports these inputs:

- `document_type`: `auto`, `one-pager`, `long-doc`, `letter`, `portfolio`, `resume`, `slides`, `diagram-architecture`, `diagram-flowchart`, or `diagram-quadrant`
- `language`: `auto`, `english`, or `chinese`
- `source_material_path`: optional local file path with raw source content
- `output_dir`: workspace-relative or absolute project directory
- `render_output`: `auto`, `source-only`, `pdf`, `pptx`, or `both`

If `output_dir` is omitted, the skill defaults to `{artifactDir}/kami-project` for the current run.

## Project Workflow

The expected flow is:

1. Resolve document type and language.
2. Run the preflight script.
3. Scaffold a workspace-local project.
4. Read the lightest relevant bundled references.
5. Distill raw notes into the right section structure before styling.
6. Edit only scaffolded project files, not bundled skill files.
7. Render PDF or PPTX when the requested dependencies are available.
8. Record assumptions, blockers, and exact outputs in a short manifest.

The scaffolded project typically contains:

- `templates/` for HTML or slide source files
- `diagrams/` for standalone diagram HTML
- `fonts/` for bundled open fonts and optional user-supplied licensed fonts
- `outputs/` for rendered PDF or PPTX files
- `manifest.json`
- `README.md`

The runtime prompt also asks the agent to write a short `manifest.md` in the task artifact directory or project directory summarizing what was produced.

## Dependencies

The skill checks for:

- `python3`
- `weasyprint` for HTML-to-PDF rendering
- `pypdf` for PDF inspection
- `node`
- bundled `pptxgenjs` for slide generation
- bundled `playwright` plus a local Chromium-family browser for slide PDF export
- `pdffonts` when available for PDF font inspection

Rendered PPTX previews in the NeoWorker file viewer are separate from Kami's export pipeline. Opening `output.pptx` in NeoWorker always shows extracted slide text and speaker notes immediately; visual slide thumbnails load from cache or render in the background through the Codex presentation runtime, with local `soffice` and `pdftoppm` as fallback converters.

You can run the same preflight manually:

```bash
bash resources/skills/kami/scripts/setup.sh
node resources/skills/kami/scripts/render_slides.mjs --check
```

If rendering dependencies are missing, the skill can still scaffold and edit the source project. In that case it should stop short of the unavailable render step and report the missing tools clearly.

## Design Constraints

Kami is intentionally opinionated. Strong outputs preserve:

- parchment background instead of pure white
- one ink-blue accent
- warm neutral palette
- serif-led hierarchy
- tight editorial spacing
- restrained print-first styling

The bundled skill is for making polished artifacts inside that system, not for inventing a new visual language on every run.

## Licensing Note

- Upstream Kami is MIT licensed.
- This bundled port ships the open English font assets used by the upstream project.
- This bundled port does **not** ship the proprietary Chinese serif font `TsangerJinKai02-W04.ttf`.
- Chinese HTML templates are patched to use system serif fallbacks by default.
- If a user has a licensed copy of that font, they can place it into the scaffolded project's `fonts/` directory and update the source template intentionally.

## Recommended Prompt Patterns

Strong fits:

- "Turn these notes into a one-pager that looks designed."
- "Create a polished resume PDF and keep the source files editable."
- "Build a restrained white paper with good typography and export-ready output."
- "Create a formal letter in the Kami style and render a PDF."
- "Make a slide deck that feels editorial instead of generic slideware."

Weak fits:

- "Design a SaaS dashboard."
- "Write rough bullets only."
- "Build me a spreadsheet workbook."
- "Make this neon and cyberpunk."

## Related Features And Docs

- [Features](../features.md): product-wide runtime and skill overview
- [Use Cases](../use-cases.md): copy-paste prompts that include `kami`
- [Use Case Showcase](../showcase.md): example editorial-document workflows
- [Skill Store & External Skills](../skill-store-and-external-skills.md): bundled vs imported skill guidance
- [Development Guide](../development.md): local validation commands for the helper scripts

## Where The Source Lives

Bundled skill files:

- `resources/skills/kami.json`
- `resources/skills/kami/SKILL.md`
- `resources/skills/kami/CHEATSHEET.md`
- `resources/skills/kami/CHEATSHEET.en.md`
- `resources/skills/kami/references/`
- `resources/skills/kami/assets/`
- `resources/skills/kami/scripts/setup.sh`
- `resources/skills/kami/scripts/bootstrap_project.py`
- `resources/skills/kami/scripts/render_html.py`
- `resources/skills/kami/scripts/render_slides.mjs`

## Development Notes

When editing the bundled skill itself, run:

```bash
python3 -m py_compile \
  resources/skills/kami/scripts/bootstrap_project.py \
  resources/skills/kami/scripts/render_html.py
bash resources/skills/kami/scripts/setup.sh
node resources/skills/kami/scripts/render_slides.mjs --check
npm run skills:check
```
