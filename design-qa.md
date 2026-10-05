# News category editorial index — design QA

Date: 2026-09-29

## Target and scope

- Selected visual: `/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-02663504-700f-4fb9-992c-3a85eb8248b8.png` (second displayed editorial concept, book index).
- Retained reference: `release/design-2026-09-29-editorial/reference.png`.
- Implementation: the production `NewsCategoryNavigation` and `PaperNewsPanel` components, rendered in an isolated browser harness at `http://127.0.0.1:4181/` with sample articles and mocked Electron data access.
- Main comparison viewport: 1774 × 887; Chinese, light theme, All topics selected, Cards mode, source directory closed.
- Implementation screenshot: `release/design-2026-09-29-editorial/desktop.png`.
- Full comparison: `release/design-2026-09-29-editorial/comparison-full.png`.
- Focused category comparison: `release/design-2026-09-29-editorial/comparison-navigation.png`.

The user selected the second concept following the recommendation to reduce the oversized Explore topics heading and navigation whitespace, and retain sans-serif article text and controls. Existing page header, article actions, feed metadata, three-column cards and content max-width remain product constraints. Sample article order differs from the mock; the navigation content and selected state match. This is a navigation implementation, not a recreation of the entire generated page.

## Findings

No actionable P0/P1/P2 issues remain in the changed navigation.

- Typography: native Songti SC serif for the editorial index heading and topic names; existing UI font for descriptions, All topics and controls. The 28px heading and 18px topics implement the agreed smaller type scale. Article text remains unchanged. English labels wrap within their column instead of clipping.
- Layout: left title/All topics column, fine vertical divider, and a five-column/two-row category index at desktop widths. The navigation is 196px tall at the comparison viewport. Below 1100px the heading moves above the index; smaller panels use three or two columns, with every category still directly accessible.
- Color: existing theme foreground, secondary text, borders and blue accent are reused. The selected name is blue and underlined; keyboard focus has a visible outline. Existing app canvas color is retained rather than introducing a page-specific palette.
- Assets: the navigation is typography-based and contains no decorative raster artwork. Existing library icons and supplied source logos are retained in the source directory and article cards; no generated or substitute logo assets were added.
- Copy: all ten canonical category names appear once, alongside All topics. Each category has the short subtitle from the concept in Chinese and an English equivalent; its existing full description remains available as a tooltip. Source directory count stays data-derived (41).

## Interaction and responsive verification

- Existing category/navigation and feed-behavior tests: 11 passed.
- Renderer production build: passed.
- Real browser interaction: selecting Health & living changes both selected category and feed heading; All topics restores the combined feed; source directory opens/closes; Feed/Cards switches work.
- Rendered widths: 1774, 1280, 900 and 560px. No horizontal page overflow or category text clipping in the checked states.
- English and dark theme checked at 1280 and 560px; no clipped category labels or subtitles.
- Browser console warnings/errors: none observed in the preview.
- Evidence: `1280.png`, `900.png`, `560.png`, `english-dark-1280.png`, `english-dark-560.png`, and `checks.json` in `release/design-2026-09-29-editorial/`.
- Live Electron network refresh, model execution and installer delivery are outside this UI change. The preview uses sample data, while the production component keeps its existing callbacks and persistence behavior.

## Comparison history

1. Opened the selected reference and implementation together in full-page and focused navigation comparison boards. Verified the left title block, vertical divider, two-row index, descriptions, blue selection and source-directory placement. Smaller typography, retained app canvas/card styling and responsive stacking are intentional scope decisions. No visual correction was required after this comparison.

## Implementation checklist

- [x] Implement the selected index in the production components.
- [x] Keep all categories and source-directory interactions available.
- [x] Check narrow panels, English labels and dark theme.
- [x] Pass focused regression tests and renderer build.
- [x] Compare the rendered result with the selected source, including a readable navigation crop.

## Follow-up polish

None required for this change.

final result: passed

## 2026-09-30 follow-up

- Compressed the editorial index to an 18px section title, 15px category names and 12px descriptions, with a 10px row gap. All ten categories remain visible; measured height at 1280px is 147px. The 560px layout has no horizontal page overflow.
- Replaced native source and sort selects with the shared NeoWorker menu. Source logos appear in both the selected value and menu options. Verified filtering, keyboard selection and Escape dismissal in the browser preview.
- Chinese original news no longer offers translation into Chinese. English articles still do, including an English title with a Chinese summary. Feed and cards now both label the primary action “AI 解读”.
- Fixed embedded article navigation: subframe history events no longer overwrite the top-level article URL. A real Electron run kept the Engadget travel-router article visible after its Google subscription iframe navigated; normal main-frame navigation and back still work.
- Evidence: `release/qa-2026-09-30-news-navigation/source-menu.png`, `chinese-article-actions.png`, and `engadget-fixed.png`.
- Six focused test files passed (39 tests); renderer and Electron production builds passed. The separate broad browser source-string assertion suite has three existing failures unrelated to the iframe navigation guard.
- At this earlier checkpoint the left-image/right-text arrangement was still a design reference. It is implemented and verified in the follow-up below.

## 2026-09-30 left article images, full refresh and selection-menu regression

### Scope and comparison

- Implemented the user's left-image/right-text reference in the production stream, preserving the compact category index and existing typography/actions. Cards keep images above the text and their three visible actions.
- Compared the selected reference (`/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-daa4e2ba-2775-4895-9ce7-a0c4da23e130.png`) and `release/qa-2026-09-30-news-images/stream-health.png` together at 1435 × 1096. The left media column, aligned article text, separators and reduced empty margins match the requested structure. The later compact-navigation requirements and actual English article lengths intentionally differ from the earlier mock.
- Stream images use a bounded 16:9 area and contain-fit so article diagrams are not cropped. At 560px the layout stacks the image above the article without horizontal overflow. The images are not decorative category artwork.
- No actionable P0/P1/P2 layout issues remained in the checked desktop stream, narrow stream and desktop card states.

### Image and refresh verification

- Real image resolution succeeded for six actual articles: two different ScienceDaily health stories, Engadget, Zapier, Learning Scientists and Coursera. ScienceDaily's spinal-stenosis article now shows its spine image; its tick-illness article shows its tick image. Original article/image URLs and downloaded byte counts are retained in `release/qa-2026-09-30-news-images/live-image-results.json`.
- Verification used the production resolver and Electron image decoder in an isolated QA profile, routed through the already configured shell proxy. It did not change the user's OS proxy or disable TLS verification. The UI harness uses those actual article records and resolved image bytes through a mocked Electron API; it does not claim live network delivery from the browser harness itself.
- Removed preset category-art fallbacks. If no usable original image can be obtained, the UI explicitly reports that the original image is unavailable rather than depicting an unrelated picture. This limitation applies to articles without images and inaccessible publisher pages.
- In the UI, selected Health & living and then the ScienceDaily source, clicked “刷新全部来源”, and verified that the callback received no source restriction while the selected filter remained intact. Service tests cover all enabled sources being attempted even when early sources time out.
- Tested the stream/cards switch and actual-image enlargement dialog. Evidence: `stream-health.png`, `stream-narrow.png`, and `cards-health.png` in `release/qa-2026-09-30-news-images/`.

### Actual Engadget selection-menu verification

- Used the production BrowserWorkbench/BrowserReadingAssistant inside an isolated Electron webview, loading the same Engadget old-router article shown by the user. Drag-selected the same three paragraphs, including the linked WAN-port text. “翻译 / 解释 / 提问 / 记笔记” appeared below the visible selection.
- Clicked “提问” and verified that the reading assistant opened with the selected three paragraphs attached. No model call or external message was submitted during this interaction check.
- Evidence: `release/qa-2026-09-30-news-images/engadget-selection-menu.png`. Geometry and lifecycle regression tests also cover an offscreen range bounding box, a partially visible last selected line, navigation while a previous probe is pending, and preservation of selection on toolbar mouse-down.

### Release verification

- 18 focused test files passed, 175 tests total. Renderer, Electron, daemon and CLI production builds passed.
- The macOS arm64 DMG passed image mounting/integrity, ad-hoc signature and packaged renderer startup smoke checks. Package code comparison matched 2,503 compiled files with no mismatches.
- Release artifacts and validation logs: `release/macos-2026-09-30-news-fixes/`. The package is a local ad-hoc-signed test build, not notarized or published.

## 2026-09-30 installed-app layout and scheduled conversation verification

- The user's installed `/Applications/NeoWorker.app` still contained the older centered 780px feed with images below the text. The current production CSS has a left image column; acceptance must inspect the packaged application rather than a separate design preview.
- Launched the newly packaged app from `release/macos-2026-09-30-session-fix/` in an isolated profile. arXiv's Imagine3D-LLM and Multi-Agent Flow Matching articles display their real cached figures in the left column. Engadget's old-router article was checked with its previously fetched article cover. Images that cannot be retrieved remain explicitly unavailable. No category artwork is substituted.
- The feed/cards switch works in the packaged app. Image and text rectangles were measured: all three checked desktop rows have the image wholly to the left and aligned at the top of the text. Evidence: `release/qa-2026-09-30-session-layout/arxiv-packaged.png`, `engadget-packaged.png`, and the accompanying layout JSON.
- The scheduler now reuses its job-owned conversation, snapshots each run's result, and scopes subsequent result reads to the current run. The actual sidebar API must retain `agentConfig.scheduledJobId`; testing only the renderer helper misses this projection contract.
- Packaged-app QA seeded 40 legacy conversations for two disabled automation fixtures, plus 46 run receipts. The ordinary sidebar displayed two entries, all 46 receipts remained accessible, and separate results for runs sharing one conversation opened correctly. User data was not changed and no message was sent. Evidence: `session-history-packaged.png` and `session-history-qa.json` in the same QA directory.
- 254 targeted tests passed. Final macOS DMG mounting, ad-hoc signature, renderer startup and packaged-secret audit passed. Full renderer typechecking and legacy source-text automation assertions retain pre-existing failures; this is not a claim that the entire repository suite is green.
- Windows packaging exposed a mismatch in the Office renderer smoke test: it invoked raw OfficeCLI for a transparent preset, bypassing the existing production render-copy normalizer, and the fixture contained two solid fills. The fixture now has one fill, uses a distinct path per case, and tests the production normalization path while preserving the original bytes. Local real-render verification passed all five fixtures, including a 45-slide/881-shape translation through the tool host. The Windows workflow runs these document checks before packaging; no application runtime code changed for this test correction.
- Windows x64 build `36683371339` completed successfully from `bddc22024e2135d3b2b763008f9c9885c865d339`, including the corrected real-render checks, layout regressions, network recovery, package secret scan, and actual installation/launch/uninstallation. Downloaded artifact provenance, byte count, SHA-256 and PE header were verified in `release/windows-2026-09-30-session-fix/verification.json`. The Windows snapshot differs from the macOS snapshot only in CI/test files; application code is identical.

## 2026-09-30 mouse-release selection regression

- Reproduced the missing menu in an actual Electron webview while an article remained in the loading state. The legacy `webContents.executeJavaScript` selection poll waited for page loading to finish even though text was already visible and selectable. A page-level Share popover was present in the fixture.
- HTML selection now reads the live main frame directly, with a bounded timeout. Native mouse release and keyboard events notify the reading UI; the existing poll remains a fallback. Notifications are scoped to the owned guest ID and URL, and stale polling responses cannot overwrite a newer selection. Navigation/destruction cancel pending work, and the native PDF path is retained.
- The controlled comparison performed exactly one mouse-down and one mouse-up in each run. Legacy mode had no menu after 604 ms; fixed mode displayed it after 27 ms while the main frame was still loading. A real SemiAnalysis article displayed it after 39 ms using the production browser components. These measurements describe these runs, not a timing guarantee.
- The “提问” action preserved the selected quotation. No model request or external message was submitted, and the user's installed application and profile were not modified.
- All 27 focused tests passed (native input timing, publisher handler settlement, keyboard selection, navigation cleanup, guest ownership, late polling results, selection geometry and frame navigation). Renderer, Electron, daemon and CLI production builds passed.
- Evidence, fixtures and interaction scripts: `release/qa-2026-09-30-selection-release/`. The separate production-component harness and full packaged-app checks are identified in their filenames/results.
- Full packaged-app acceptance passed in isolated profiles: the deliberately stalled article (523 characters) and the exact SemiAnalysis paragraph from the user report (527 characters) both showed the toolbar after exactly one mouse-down/up. Main-frame loading was still active, and “提问” retained the quote. Screenshots were visually reviewed; the actual publisher screenshot includes its Share popover alongside the NeoWorker actions. Evidence: `packaged-stalled.png/json` and `packaged-live.png/json` in the same QA directory.
- Final macOS arm64 DMG passed integrity/mounting, ad-hoc signature, packaged renderer startup and packaged-secret audit. All 2,508 packaged compiled files matched the current build. Installer and SHA-256: `release/macos-2026-09-30-selection-release-fix/`. This is a local test package, not notarized or published; Windows was not rebuilt for this follow-up.


## 2026-09-30 compact news navigation and missing WallstreetCN covers

- Compressed the news masthead, category navigation, filters and result metadata. All ten categories plus All remain visible; descriptions use hover hints and duplicated headings remain accessible without taking up visual space. Source directory now shares the header action row. Stream images stay on the left; narrow panels wrap without horizontal overflow.
- At 1440 × 900, the first article moves from y=482 to y=214 in the production-component harness, a reduction of 268 px (56%) above the article. At 1100 px width it starts at y=228; at 560 px it starts at y=339. Light/dark and Chinese/English states were inspected. The harness uses mocked API responses and separately downloaded real article covers; it does not claim to be a full application run.
- Root cause for the user's two missing-image examples: WallstreetCN original article metadata points to `wpimg-wscn.awtmt.com`, which was absent from the publisher's exact CDN allowlist. Added that host without allowing arbitrary sibling domains or cross-publisher images. Cover cache key version 6 → 7 invalidates previously cached misses on upgrade.
- Downloaded and decoded eight distinct original article images using the production resolver in isolated Electron, including the two screenshot articles (3782820 and 3782822). No preset artwork was added. When an original image is genuinely unavailable, the large blank media panel is removed and the article remains a compact text row.
- Full packaged-app acceptance used a fresh isolated profile seeded with eight public article records and no cover cache. All eight original covers loaded through actual production IPC/network, there were zero blank media frames, and image rectangles were wholly left of the text. The first article starts at y=262 including the 48 px application title bar. Stream/cards switching passed. The user's installed app and profile were not modified; no model call or external message was sent.
- Source filtering, search, refresh-all scope, image enlargement/Escape, source directory and feed/cards switching passed. The English fixture explicitly applies the locale before rendering and asserts an English refresh button before testing responsive overflow.
- All 43 focused tests passed across five files. Production renderer, Electron, daemon and CLI builds passed. All 2,508 compiled files match the packaged application with zero mismatches. DMG integrity/mounting, ad-hoc signing, packaged renderer startup and packaged-secret audit passed.
- Screenshots, geometry, real-image results and test logs: `release/qa-2026-09-30-news-density/`. Actual application screenshots are `packaged-feed.png` and `packaged-cards.png`; baseline and responsive harness evidence is separately named.
- New macOS Apple Silicon installer and SHA-256: `release/macos-2026-09-30-news-density-fix/NeoWorker-0.2.4-arm64.dmg`. This local test package also contains the earlier mouse-release selection fix. It is ad-hoc signed, not notarized or published. Windows was not rebuilt for this follow-up.


## 2026-09-30 visible execution progress during model work

- The existing runtime prompt suppresses intermediate assistant narration and the renderer hides runtime-tagged streaming messages. Added a separate visible execution-progress overview for active task conversations, independent of the execution-record toggle. It renders public execution facts; private reasoning, tool results and shell arguments are not used as summary content.
- The overview keeps the three most recent settled operations plus active operations, including document/file names, completion and failure state. While no tool is active it distinguishes waiting for a response from a received model-activity heartbeat, and reports 45+ seconds without new progress without asserting the task has hung.
- Progress is scoped to the current task and latest user message. Tool IDs pair parallel calls, ambiguous legacy results are not guessed, projected duplicates are removed, and approval grant/denial resolves only the matching request. The overview disappears when work ends and is omitted during replay and conversation-only chat.
- 148 tests passed across the live-progress, working-state and execution-disclosure suites (11 new focused cases). The renderer production build passed. Full repository typechecking still reports errors elsewhere (App unused declarations, browser API profile typing and existing test mocks); no diagnostics point to this change.
- Production-component browser QA exercised waiting/silence, document reading, completed operations retained during model activity, file writing, tool failure and follow-up reset. Desktop and 460 px screenshots were inspected with no horizontal overflow or browser errors. These are controlled event fixtures, not a live model run or a packaged application acceptance run.
- Evidence and fixture scripts: `release/qa-2026-09-30-live-progress/`. This change has not been packaged into a new installer; the previously delivered news-density DMG remains unchanged.


## 2026-09-30 compact skill cards and direct invocation

- Replaced the featured skill-card layout with equal compact cards, relevant icons, one-sentence purpose previews, subtle status/scope metadata, and separate Use skill / View details actions. Removed large ready badges, generic tags and decorative featured artwork. Full descriptions and stored skill identifiers remain intact. The EPAI knowledge skill gets a readable display name derived from its own description.
- Card and detail actions now carry parameter schemas into the existing composer parameter modal. Workspace skills resolve the report’s skills directory to the registered parent workspace instead of opening a new unrelated temporary workspace. Missing original workspaces produce a clear error. Disabled, ineligible, blocked and automatic-only skills cannot be launched manually.
- The document skill’s parameter labels now read 资料类型 / 产品品牌 / 文档语言 and preserve the supplied Chinese explanations and I/Q/A/K options. Existing defaults are unchanged.
- Browser QA used the production CapabilityCenter and SkillParameterModal with controlled catalog responses and a small draft-container fixture; it did not run the full Electron App or a model task. Card and detail launch, parameter editing, draft generation, preserved workspace, and parameterless launch passed. Desktop cards measure 579.5 × 202.5 px; at 480 px viewport they stack at 456 × 202.5 px. A narrow-window back-button overlap discovered during QA was corrected. Browser error log was empty.
- 52 focused tests and renderer production build passed. Full repository typechecking retains existing diagnostics outside the new card/selection utilities; it is not a clean full-repository typecheck. Evidence and fixtures: `release/qa-2026-09-30-skill-cards/`.
- Source changes only: no installer was rebuilt and the installed application/profile was not modified.


## 2026-09-30 exclude political content from the curated news feed

- User requirement concerns content scope, not the political screenshot’s appearance. Removed ChinaTalk from the publisher registry, fetching, source directory and image registry. A shared policy rejects retired-source IDs/hosts and political metadata in Chinese/English regardless of viewpoint. Technical terms such as Raft leader election and policy gradients retain their meaning.
- Ingestion/ranking, old cache/bookmark hydration, renderer snapshots and news AI drafts share the policy. Cache migration persists the cleaned feed; translations are sanitized on disk. Excluded records are inaccessible to cover, summary and translation IPC. Newly discovered excluded summaries/translations remove the whole item and bookmark, persist the exclusion, and update renderer counts.
- Regression fixtures cover cached schema versions 1–4, blocked refreshes, fetched metadata, tags/URLs, retired aliases, cache persistence, translated/excerpt output, IPC handling, and ordinary technical/economic content. Browser QA passed feed/cards/bookmarks/source-directory and late summary/translation exclusions using the production renderer with controlled IPC fixtures. Four old entries became two visible entries and two bookmarks; late content checks removed the affected whole card and reduced the bookmark count to one. No external model calls or real profile changes were made.
- This is deterministic metadata filtering and source retirement, not full-body/image semantic classification or a guarantee for all future political content. Evidence: `release/qa-2026-09-30-news-content-policy/`. Source changes only; no new installer in this task.

### 2026-10-01 — GitHub covers and stable missing-image layout

- Removed the missing-cover rule that collapsed a feed row to a single text column. Loading, real media and unavailable media now share the same left column and 16:9 frame; unavailable media is explicitly labeled as a text preview with its source mark and title.
- GitHub resolver now checks rendered README images between custom social covers and generated GitHub previews. It ignores encoded badges, tiny icons and animated logos, normalizes GitHub raw paths, retains the host allowlist and bounded decoder, and invalidates old GitHub cover misses.
- Real Electron transport/decoder fetched Paperclip's banner and Hyperframes' own README design-template image. No preset artwork. Evidence: `release/qa-2026-10-01-github-covers/live-results.json`.
- Production renderer with controlled IPC fixtures: two real covers plus one explicitly unavailable sample. At 1280px all three text columns start at 347.84px and media frames are 291.84px wide; 560px stacks without horizontal overflow. Cards retain aligned media areas; console errors: none. Screenshots and checks in `release/qa-2026-10-01-github-covers/`.
- 42 targeted tests and full production build passed. Real network availability may vary; the text preview remains an honest fallback rather than fabricated article photography.
- New macOS arm64 installer: `release/macos-2026-10-01-news-cover-fix/NeoWorker-0.2.4-arm64.dmg`. All 2,507 compiled files match packaged code; mounted DMG hash matches the verified archive. Signature, runtime checks, isolated renderer startup and packaged-secret audit passed. Low disk space required direct compressed DMG packaging; the installer contains the signed application and Applications shortcut. Local ad-hoc test package, not notarized or published.

### 2026-10-01 — Approved source-only missing-image treatment

- Source visual truth: `release/qa-2026-10-01-source-identity/approved-design.png`, copied from the exact single image approved by the user. Scope is the missing-image treatment in the existing feed; the established compact controls, 300px maximum media column and typography remain unchanged rather than enlarging the whole page to the image generator's scale.
- Implementation: production `PaperNewsPanel`, `NewsArticleImage` and CSS, rendered with controlled IPC records at `http://127.0.0.1:4200/`. The Archify and LobeHub covers were fetched from their real GitHub source images. The uv row deliberately returns no cover to exercise this state; this does not assert that uv has no image in production. User app/profile unchanged.
- Viewport/state: 1487 × 1058, light theme, Open source category, stream layout; three matching sample repositories. Full-view evidence: `approved-design.png` and `desktop.png`, opened together for comparison. Focused implementation evidence: `focus-identity.png`; the reference's central GitHub identity is legible at the same full-view size. Also inspected `cards.png`, `dark-loading.png` and `narrow.png` (560 × 900).
- Fonts/typography: existing system font, 18px article titles and 15px source label preserved. Source label has 600 weight and 1.4 line height; no duplicated article title or empty-image error copy.
- Spacing/layout rhythm: real and unavailable media retain identical 300 × 168.75px desktop columns. All right text columns start at x=356. The source mark is 48 × 48px with a 10px label gap; centered within the media area. No border or background panel. Narrow feed uses a 120px source identity region and has no horizontal overflow (scroll width=viewport width=560).
- Colors/tokens: source text uses existing secondary-text token and transparent page background. GitHub uses the local white asset in dark mode; the light asset is hidden. Loading uses the same quiet identity and retains aria-busy=true without a spinner/error badge.
- Image quality/assets: existing official source assets reused, with original GitHub project covers. Article image CSS now targets direct-child images, preserving cropped source-brand assets such as QbitAI. Its 48px mark was visually checked on narrow layout. No generated substitute photography or new logo artwork.
- Copy/content: source names come from the same localized catalog as row metadata. Removed “文字预览”, “暂无可用原图” and duplicated titles. Fixture copy matches the approved source as closely as the existing production data model allows.
- Primary interactions: category selection, stream/cards switching, image enlargement and Escape-close passed; no-image identity has no misleading enlargement action. Console errors: none. Existing 21 focused feed/gallery tests and renderer production build passed.
- Findings/comparison history: first post-change comparison found no actionable P0/P1/P2 issues within the approved missing-image scope. Expected differences are the preserved compact production density, source directory/additional existing controls, and real current cover pixels instead of their image-generated approximation. No follow-up code change was required after visual QA.
- Implementation checklist: source-only identity implemented; image and text alignment verified; cards/dark/loading/narrow verified; documentation updated. Packaging validation is recorded separately in the release directory.
- Final result: passed
- Installer acceptance: `release/macos-2026-10-01-source-identity/NeoWorker-0.2.4-arm64.dmg`. Full build passed, 2,507 compiled files matched with zero differences, package.json restored, signature/runtime checks and isolated renderer startup passed, packaged-secret audit passed. Local macOS arm64 ad-hoc test package, not notarized or published.

### 2026-10-01 — Category icons, skill separation and persistent skill recovery

- Approved category target: `/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-7b90322a-d6e4-4dcb-a061-ce8bb641b81f.png`. Compared with `release/qa-2026-10-01-library-fixes/navigation-wide.png` in one image inspection. The central navigation strip is the target; black framing is not product UI. Kept the existing compact production density and controls.
- Typography/icons: all 11 labels use the same `DM Sans / PingFang SC / Microsoft YaHei / Helvetica Neue / Arial / sans-serif` stack as body UI, at 14px (13px narrow). Eleven existing Lucide outline icons at 16px/1.8 stroke, 6px label gap. Selected icon, label and full-width 2px underline use the existing accent token. All categories remain visible.
- Navigation QA: 1487×1058 light stream, one 33.59px row. Selection changed to Open source correctly. At 390×844 both Chinese and English wrap without horizontal overflow or clipped categories. Existing three category tests and thirteen feed tests passed. No image assets were generated or replaced.
- Skill layout reference: user screenshot `codex-clipboard-68a2bb9a-fd0f-416f-b680-ab75625a7c06.png`, compared with `skills-spacing.png` in the same inspection. Production CapabilityCenter and SkillLibraryCard rendered with bundled skill fixtures. The research and data-analysis views now measure 24px between the final card edge and the catalog border, at both 1920×1080 and 560×900. Card borders/shadows are no longer clipped by the feature container. No horizontal overflow. Evidence: `skills-research-wide.png`, `skills-data-wide.png`, `skills-spacing.png`.
- Search QA: starting in Research and entering the exact saved writing skill name selects All, returns one usable card with the original name, and preserves source scope. Evidence: `skill-search-restored.png`. A first QA pass found unknown managed skills were being renamed to a generic localized workflow; fixed and recaptured. Console errors after asset paths were supplied: none.
- Persistence: found the user's original JSON in the registered `ui-session-hunKTE` temporary workspace. Recovered it with production code into the persistent user library and retained a `.json.migrated` backup. Prompt and all three parameters compare equal. A fresh loader reports the real recovered skill as managed, eligible and enabled. `skill-recovery.json` records paths and validation without the private prompt. Browser fixtures do not execute user skills or send model requests.
- Regression evidence: 99 targeted loader/navigation/feed/information-architecture tests plus 23 presentation/localization tests passed (122 total). New real-filesystem tests cover restart after workspace removal, legacy migration, idempotence after deletion, conflict preservation, explicit project scope, and invalid paths. Full production build and final renderer rebuild passed.
- Local production-component previews: `http://127.0.0.1:4201/` (news), `http://127.0.0.1:4201/?view=skills` (skill library). Backend recovery verified separately against the real local skill file; these previews use controlled IPC fixtures.
- Remaining P0/P1/P2 issues in scope: none. Final result: passed.
- Installer acceptance: `release/macos-2026-10-01-library-fixes/NeoWorker-0.2.4-arm64.dmg`. All 2,507 compiled files match the package. CRC/signature/runtime checks, isolated renderer mount, and packaged-secret audit passed. Ad-hoc macOS Apple Silicon test installer, not notarized or published. SHA256: `d43f9b7514ae477521ebdbf2f7ef51039bb8f799b7f4cf8003e3a01ca006211b`.
