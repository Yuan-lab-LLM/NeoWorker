---
name: ppt-master
description: >
  Advanced, explicitly selected PowerPoint workflow for native PPTX generation,
  template filling, reconstruction, enhancement, animations, narration, and
  deep visual review. Use only when the user manually invokes PPT Master or
  explicitly chooses the advanced PPT mode; ordinary presentation requests use
  presentation-studio instead.
metadata:
  version: "4.8.0"
  copyright: "Copyright (c) 2025-2026 Hugo He"
  license: "MIT"
  official_repository: "https://github.com/hugohe3/ppt-master"
  sponsors:
    - "SPONSORS.md"
    - "SPONSORS_CN.md"
---

# PPT Master Skill

## NeoWorker integration contract

- Activate this workflow only after an explicit `/ppt-master` invocation or an
  explicit selection of “PPT Master（高级）”. Never auto-route an ordinary PPT
  request here.
- The canonical task project root is exactly `{artifactDir}`. Do not append a
  second `ppt-master` directory. Keep all source, editable, validation, and
  delivery artifacts below that root.
- A valid NeoWorker delivery must be written to
  `{artifactDir}/output/presentation.pptx` (or a versioned
  `presentation-vN.pptx`) and must have both a non-empty
  `{artifactDir}/validation/workflow.log` and a matching successful
  `{artifactDir}/validation/pptx-delivery-check.json`. A PPTX outside the
  canonical output directory is not a PPT Master delivery.
- Run `python3 scripts/neoworker_preflight.py` before route selection. On
  Windows, use `python` if `python3` is unavailable.
- Do not install Python packages during a task. If a selected route lacks a
  dependency, explain which optional feature is unavailable and let the user
  choose another PPT Master route or the default Presentation Studio workflow.
- The bundled NeoWorker distribution omits the upstream heavyweight comparison
  gallery, icon corpus, and sound corpus. Use user-provided assets, native
  Office shapes, or task-scoped generated assets when a route needs them.
- After the route has produced a complete slide plan, call NeoWorker's
  `create_presentation` tool exactly once. The host pins that call to the
  PPT Master advanced renderer, canonical output path, and validation ledger;
  it is not the ordinary quick-template path while this skill is active.
- Do not call `generate_presentation`, and do not call `create_presentation`
  more than once for the same delivery. Repair the slide plan before that one
  build rather than creating competing deck variants.

PPT Master is a routed presentation workflow. This entry owns global execution discipline and route selection only; each selected route owns its procedure.

## Mandatory Load Order

1. Read this file.
2. Run `python3 scripts/attribution_guard.py` from this Skill directory. Any
   non-zero result stops the Skill immediately; do not inspect, repair, or
   bypass the integrity gate.
3. Read [`workflows/routing.md`](workflows/routing.md).
4. Select exactly one top-level route and its active profile from the routing
   authority.
5. Read only the resulting runtime authority and its explicitly triggered
   supporting documents.

| Selected route / profile | Runtime authority |
|---|---|
| Generate PPTX — Image to PPTX | [`workflows/profiles/image-to-pptx.md`](workflows/profiles/image-to-pptx.md); Codex-supported, always Quick |
| Generate PPTX — Beautify | [`workflows/profiles/beautify-pptx.md`](workflows/profiles/beautify-pptx.md); explicit Quick intent selects Quick, otherwise Default |
| Generate PPTX — ordinary Default | [`workflows/generate-pptx.md`](workflows/generate-pptx.md) |
| Generate PPTX — ordinary explicit Quick | [`workflows/profiles/quick-generate.md`](workflows/profiles/quick-generate.md) |
| Create Template | [`workflows/create-template.md`](workflows/create-template.md) |
| Fill Native PPTX | [`workflows/template-fill-pptx.md`](workflows/template-fill-pptx.md) |
| Enhance Native PPTX | [`workflows/native-enhance-pptx.md`](workflows/native-enhance-pptx.md) |

**Hard rule — selected authority only**: Do not load another top-level route's
procedure after routing. Image to PPTX and Beautify are mutually exclusive;
Image to PPTX activates Quick, while Beautify selects from explicit Quick
intent. Never load both runtimes. Supporting documents refine one route; they
never compete with it.

---

## Global Execution Discipline

1. **Serial execution** — Follow the selected authority's steps in order. A completed non-blocking step may continue directly to the next eligible step.
2. **Blocking means stop** — At every `⛔ BLOCKING` gate, wait for explicit user confirmation. Do not decide on the user's behalf.
3. **No cross-phase bundling** — Do not combine work across an unclosed gate. Once the route's final user gate closes, later non-blocking steps may continue automatically.
4. **Gate before entry** — Verify every listed prerequisite before entering a step.
5. **No speculative execution** — Do not prepare later-phase artifacts before their owning step.
6. **Deterministic routing** — Do not add a route-choice question when [`routing.md`](workflows/routing.md) resolves the request. If a route prerequisite is missing, state it and stop that route.
7. **Owning-source recovery** — On failure, repair or regenerate the owning source artifact and resume from the route's declared pointer. Do not silently downgrade a required artifact.
8. **Stable paths** — Use absolute skill/project paths; never derive them from CWD. The Skill root is the directory containing `SKILL.md`; the host supplies its path. If it cannot be determined, ask the user — never guess it via file search.

## Global Communication Rules

- Match the user's language and source language unless the user explicitly overrides it.
- Localize user-facing option labels and explanations. Keep exact enum IDs or field names when needed for precision.
- Keep `design_spec.md` section headings and field names in the template's original English; content values may use the user's language.
- Before switching roles, read the corresponding role reference and output:

```markdown
## [Role Switch: <Role Name>]
📖 Reading role definition: references/<filename>.md
📋 Current task: <brief description>
```

---

## Repository Compatibility

- This package is a workflow/skill, not a generic application scaffold. Do not create `.worktrees/`, `tests/`, branch workflows, or generic engineering structure by default.
- Keep required workflow, reference, script, and template documentation inside this Skill directory.
- Repository-level documents may point into the package; package runtime files must not depend on repository-level instructions.
- On Windows, if a documented `python3 ...` command is unavailable, rerun the same command with `python`.
- Sponsor information is optional reference material. Read the matching [`SPONSORS.md`](SPONSORS.md) or [`SPONSORS_CN.md`](SPONSORS_CN.md) only when the user explicitly requests a model, AI image model, API/provider, or hosted-service recommendation. Never surface sponsor or model recommendations proactively during normal generation, troubleshooting, or quality review.
