# Category-based News Feed — 2026-09-25

final result: passed

## Scope and visual truth

The production PaperNewsPanel now follows the user-approved cover-free visual direction and the six-category / 26-provider selection. This is an intentional information-architecture redesign of the existing screen, not a pixel clone. No additional source adapters or installation packages were produced.

- Source visual: `output/ui-preview/news-feed-simple/desktop.png` (1500 × 1100, Chinese/light, all sources, no bookmarks).
- Final implementation: `output/ui-preview/news-categories/desktop.png` (1500 × 1100, same public fixture items, Chinese/light, all sources, no bookmarks).
- Both images were opened in the same tool result for the final comparison. The preview includes a separate test-control strip; it is not part of the shipped component. This small frame difference is excluded from typography/layout comparisons.
- Interactive preview: `http://127.0.0.1:5194/`. Uses the real production component, bundled logos and application CSS, with isolated IPC substitutes and cached public metadata. Does not operate the installed profile or send model tasks.

## Findings and iteration

1. [P2, fixed] Initial category layout put the first card row around 640 px down the wide preview, with separate heading, bookmark, source-filter and search rows. Moved Discover/Saved beside the heading and merged publisher filters with search/sort. The final first row begins around 533 px (including preview framing). Intentional additional height relative to the old source-only page makes the six-topic navigation visible while keeping the complete first card row accessible.
2. [P2, fixed] Existing CSS contained invalid `%%` percentages in five color-mix declarations. Corrected them to `%` so the intended token-based surface and action colors apply.
3. [P2, fixed] A category with no connected adapters initially allowed the global refresh action, which could imply it was fetching that category. Disable refresh/preferences there, label all providers as planned, and provide an explicit return to available stories. Post-fix evidence: `technology.png`, five planned providers, no cards, refresh disabled.

No remaining actionable P0/P1/P2 findings in the tested UI scope.

## Required fidelity surfaces

- Typography: existing DM Sans and Chinese system fallbacks; 14 px topic titles, 20 px section heading, established 16 px card titles and 13 px summaries. Long titles retain bounded wrapping; full abstracts expand. Chinese and English controls verified.
- Spacing/layout: six topic tiles across on wide panels, three across at medium width and two across on narrow panels. Content cards remain 3 / 2 / 1 columns at 1500 / 1000 / 560-pixel viewports. No horizontal document overflow at the tested sizes. The directory adapts from three columns to one.
- Colors: shared accent and neutral surface tokens, white/light surfaces and dark equivalents. Small official source badges retain restrained publisher colors; topic icon tiles use soft blue, with blue selected state. No multicolor category backgrounds.
- Assets: existing official arXiv, Hugging Face and GitHub SVGs and dark variants retained. Topic symbols use the existing Lucide icon library. No thumbnails, invented publisher logos or new image requests.
- Copy/content: six categories and 26 distinct providers; Technology has exactly five. Hugging Face Papers is connected in Research while Models remains planned in Open source. No fake news, result counts or claims of 26 working adapters. Unavailable states do not ask for keys or accounts.
- Focused inspection: desktop card row and source controls were inspected at native browser scale during bookmark/source/search checks; narrow screenshot verifies wrapping and action placement. SVG brand marks stay within their existing slots.

## Interaction evidence

Checked in the Codex in-app browser using the real component:

- All topics: 9 fixture cards. Research: 6; arXiv filter: 3; Open source: 3 GitHub cards.
- Bookmark one paper → Saved has one card. Switch to Open source while Saved is active → no irrelevant paper shown. Return to Discover → 3 repositories. Bookmark state is preserved.
- Search `hermes` → one repository; clear search restores its category results.
- Repository Read creates a draft with the GitHub URL; paper Translate creates a PDF-specific draft. No task was submitted.
- GitHub preferences display minimum-stars control; save reports success; other source preferences remain separate.
- Directory contains 26 providers in groups of 3/5/5/3/6/4; exactly 3 marked connected.
- Technology lists the five requested providers and an honest unavailable state. Return CTA restores the available feed.
- Chinese/light and English/dark render without horizontal overflow. Browser error/warning log was empty.

## Checks and limits

- Renderer production build passed (existing large-chunk advisory).
- Focused lint passed with 0 warnings/errors.
- Existing feed service and navigation tests: 24 passed.
- Full TypeScript check is not clean: 307 diagnostics in other modules/tests, none reported against PaperNewsPanel or news-feed-catalog. This is not claimed as a project-wide typecheck pass.
- This UI validation does not retest upstream availability, real persistent IPC writes, installation, or model execution. Newly listed sources remain planned.

## Screenshots

`output/ui-preview/news-categories/`: `desktop.png`, `dark-en.png`, `medium.png`, `narrow.png`, `directory.png`, `technology.png`.
