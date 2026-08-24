# Design QA — Agent and integration mention picker

- reference image: `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-8d3d2ddb-2e7f-40c2-b71b-b29a16dd8ec9.png`
- installed implementation screenshot: `/tmp/neoworker-mention-picker-two-sections.jpg`
- full-view comparison: `/tmp/neoworker-mention-picker-comparison-full.jpg`
- focused comparison: `/tmp/neoworker-mention-picker-comparison-focus.jpg`
- reference dimensions: 1478 × 896 px
- installed implementation viewport: 1295 × 768 px
- comparison density: full captures normalized to 768 px height; focused implementation crop normalized to the 1478 px reference width
- state: `@` mention picker open in an active task, Chinese UI, light theme

## Findings

- grouping: passed — Agents and Integrations are separate bordered cards with their own tinted header band, count badge, list body, and an 8 px inter-section gap.
- hierarchy: passed — section headers read as container titles instead of loose labels, while item names remain the dominant row content.
- empty groups: passed — the empty Files section is not rendered, so the picker presents exactly the two populated parts.
- density: passed — rows remain compact and scan-friendly; the added grouping does not reintroduce the oversized vertical gaps from the reference.
- agent identity: passed — mapped agent roles use the existing portrait assets, with the generic role icon retained only as a fallback.
- localization: passed — system agent names and descriptions use the current Chinese UI language; integration product names remain unchanged.
- selection state: passed — the selected row remains visible inside the Agents card without obscuring the grouping.
- installed build: passed — the clean packaged app was installed at `/Applications/NeoWorker.app`, launched, and the picker was opened in the real application for visual verification.

## Iteration history

1. P1 finding — the previous implementation used only two gray text labels, so Agents and Integrations still read as one long list; an empty Files label created a misleading third group.
2. Fix — wrapped each populated category in its own bordered section, added header backgrounds and count badges, increased the gap between sections, and removed the empty Files section.
3. Packaging finding — the first packaged app reused stale renderer chunks and showed the old picker. A full clean build and cache refresh were required before installation.
4. Final verification — the installed app now shows two visually discrete sections (`智能体 37`, `集成 2`) and no Files section.

## Verification

- targeted Vitest: 15/15 passed
- clean production build: passed
- packaged ASAR inspection: passed
- macOS code-signature verification: passed
- installed application launch and visual QA: passed
- CSS diff validation: passed

final result: passed
