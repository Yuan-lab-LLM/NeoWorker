## 2026-09-25 — Four live news categories

18 public publisher adapters now feed all four previously empty categories. Production fetching returned 437 items and cache reload retained them. Browser checks used this real snapshot with mocked IPC: 98 technology, 99 markets, 179 policy and 61 business cards; source filtering, optional per-source settings and article task drafts verified. Three columns at 1500px and one at 560px, without horizontal overflow. See `docs/qa/news-publisher-integration-2026-09-25.md`.

# Source directory refinement — 2026-09-25

final result: passed

## Target and evidence

Scoped redesign of the source directory in response to the supplied screenshot. Preserve the existing light-blue theme, official publisher logos, source availability and feed layout.

- User reference: `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-fd510de4-7854-4725-a1f7-a383155b3314.png`.
- Current-run before / after: `output/ui-preview/news-directory/before.png` and `after.png`, same default browser viewport, Chinese/light, Technology selected, directory expanded. Both displayed together for comparison. Intentional layout changes, not a pixel clone.
- Additional captures: `desktop.png` (1500 × 1100), `narrow.png` (560 px panel), `dark-en.png`. Preview uses the real production component with isolated IPC fixtures.
- The experimental clipped capture `directory-focus.png` was rejected because the browser clip output included excess canvas. Full captures above were inspected and accepted; their directory controls are legible at native scale.

## Findings and changes

1. [P2, fixed] All 26 sources competed in a long, sparse grid. Replace with category navigation and one focused source panel. The full Technology directory and return action now fit in the reference-size viewport.
2. [P2, fixed] Repeated availability labels dominated the list. Group sources under Connected / Planned headings with counts; preserve accurate availability.
3. [P2, fixed] Unavailable topics stacked the source list and a large empty-state box. Consolidate explanation and return action in a compact footer.
4. [P2, fixed] Old no-sources CSS hid the directory heading. Remove that override; the directory always retains its own identity.

## Fidelity and interaction checks

- Typography: existing DM Sans / Chinese system fallback; 15 px directory titles, 13 px source names, restrained secondary copy. English policy names wrap without overflow.
- Spacing: 200 px left navigation; two source columns on desktop; horizontal category navigation and single source column in narrow panels. Compact unavailable-topic mode uses three columns at desktop size.
- Color: existing primary/secondary surfaces and accent tokens; soft blue selection; dark theme inspected.
- Assets: existing official arXiv, GitHub and Hugging Face SVGs retained. Hugging Face Models reuses its real logo without implying a connected adapter. Topic symbols use Lucide. No new cover images or invented brand marks.
- Content: all 26 sources retained, with three connected adapters. Planned sources remain noninteractive and explicitly grouped.
- Interaction: directory category switching, GitHub jump (3 fixture cards), close/reopen, compact unavailable topic and return to all stories (9 fixture cards), Chinese/English, dark/light, 560 px panel and 1500 px viewport. No document or directory horizontal overflow; category rail scroll is intentional. Console warnings/errors empty.
- Production renderer build, focused lint and two navigation tests passed. Existing large-bundle advisory remains. No new package was created in this refinement; the previously delivered DMG still has the earlier directory.

---

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


---

## Historical QA (superseded visual direction)

# News Feed editorial cards and dynamic covers — 2026-09-25

final result: passed

## Visual comparison

The selected first design (`exec-de16f548-6372-4490-b6da-1ab94f8a2fd1.png`) and the implementation were opened together in the same comparison input at 1487 × 1058. The latest user requirement replaces the mock's repeated illustrative artwork with source-specific images and per-item text covers. This is a production-component integration, not a pixel-identical reproduction of the sample feed.

The browser harness imports the real PaperNewsPanel, PaperNewsCover and application styles. Its feed metadata and interaction transport are isolated fixtures. The first three cover payloads came from separate live Electron requests to arXiv, Hugging Face and GitHub, including actual normalization and cache writes. Historical GPT-4 content intentionally exercises arXiv HTML image extraction; it does not represent today's search results. Production full feed refresh and task execution are not simulated as passing end-to-end here.

- Typography: existing DM Sans and Chinese system fallback retained; 18 px card titles, 14 px summaries. The app header is intentionally more compact than the mock, consistent with the other application pages. Source text remains untranslated, controls follow locale.
- Layout: three equal 455 px tracks at 1487 px, landscape covers, unboxed editorial cards, aligned bottom actions and dividers. Authors, source/PDF links and ranking details remain available, making rows taller than the simplified mock. Two columns confirmed at 1000 px and one at 480/360 px; no horizontal overflow.
- Color: shared white/soft-blue surfaces and blue primary action; dark theme follows existing tokens. No per-source colored card backgrounds.
- Imagery: official bundled source logos; publisher images retain their complete aspect ratio. Portrait images have white margins rather than cropped diagrams. A source image is not necessarily a representative summary figure; captions accurately identify its origin. Missing images use the current title, not an unrelated illustration.
- Copy and interactions: News Feed naming, independent source settings, bookmarks, empty search, successful search, source opening and creation of a reading draft verified. This test did not send any task to a model.

## Iteration

A small-card inspection identified that the full three-line text-cover treatment could become too crowded at narrow widths. Added a cover-specific container rule below 340 px: two title lines, tighter padding, and no secondary author line. The 360 px post-fix screenshot confirms no collision with the cover caption. Recompared the final desktop screenshot with the selected design; no remaining actionable P0/P1/P2 visual issues were found within this scope. Full screenshots provide readable typography and controls; the narrow-cover capture is the focused evidence for the fix.

## Evidence

- [Desktop, Chinese/light](docs/qa/news-covers-2026-09-25/desktop.png)
- [Desktop, English/dark](docs/qa/news-covers-2026-09-25/dark-en.png)
- [Narrow layout](docs/qa/news-covers-2026-09-25/mobile.png)
- [Narrow text-cover detail after fix](docs/qa/news-covers-2026-09-25/text-narrow.png)

## Engineering validation

- 35 focused tests passed across cover caching, metadata parsing, source state, IPC validation and navigation. Cover tests include request deduplication, restart cache reuse, negative cache expiry, host cooldowns, concurrency limits, malformed caches, unsupported content and PDF fallback.
- Electron TypeScript build passed; production Vite renderer build passed (existing large-chunk warning remains).
- Differential renderer type check: zero new diagnostic identities against 163 existing baseline diagnostics. This is not a clean whole-project type-check claim.
- Live publisher checks: GitHub repository social preview, Hugging Face paper thumbnail and arXiv original HTML image retrieved and converted to bounded JPEGs.
- Actual bundled PDF first-page renderer exercised inside Electron with a generated fixture PDF; output successfully normalized.
- Browser console: no errors observed in tested states.

No installer, release, application-profile migration or installed-app replacement was performed. Network restrictions, publisher availability and limits can still produce a text cover. Windows packaging and live model translation/research are outside this change's validation.
