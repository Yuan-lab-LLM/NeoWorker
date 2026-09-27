# News category rail and sidebar proportions — 2026-09-27

Final visual result: passed within the navigation scope. Automated checks: 9 passed, 2 legacy failures; renderer build passed.

## Sources and rendered evidence

- Selected category design: `/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-47187ef5-eb35-4cd6-b699-66f62ed17003.png` (first round, second option).
- WorkBuddy sidebar proportion reference: `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-83162a0c-7688-429a-a121-ffcc4e4d1181.png`.
- Implementation: `http://127.0.0.1:5194/gallery-preview.html`; real Sidebar and PaperNewsPanel components with local fixture data and simulated APIs, no native title bar or live model calls.
- Final full screenshot: `output/category-rail-qa/desktop.png`, 1600 × 900, Chinese, light theme, Open source selected, source directory closed. Source design and final full screenshot were opened in the same comparison tool input. WorkBuddy and the final full screenshot were also compared together; sidebar width is 264 CSS px versus approximately 264 CSS px in the 2x reference, but height/content/window chrome differ. This is a proportion adaptation, not a WorkBuddy clone.
- Responsive screenshots: `output/category-rail-qa/narrow-en.png`, `narrow-zh.png`, `narrow-dark.png`, 560px panel inside the existing 1280px preview harness. The browser viewport override affected the sidebar tab, so the explicit preview size control was used and DOM measurement confirmed a 560px panel. Temporary viewport override was reset.
- Early clipped captures returned incorrect device-scale crops; they are not final fidelity evidence. The final full screenshot clearly resolves labels, icons and selection states, so further crops were unnecessary.

## Findings, corrections and fidelity

- [P2 resolved] A remaining old category CSS block overrode the rail with grid cards. Removed the duplicate block and old card breakpoints. Final capture shows all seven category controls in one row, with a separate secondary directory action.
- [P2 resolved] Sidebar rows plus gaps occupied 40px and the new-task/header gaps crowded out conversation space. Rows now use 32px plus 2px gap; the session header container moved from y425 to y368 in the same preview (57px reclaimed).
- Typography: category labels 14px/500 with 18px Lucide icons; sidebar labels 13px/400, new-work and active labels 500, icons 17px/1.7 stroke. Brand 14px/600 with 24px logo and quieter unboxed version text. All labels readable and aligned.
- Spacing: category buttons 42px high, restrained icon-to-label gaps, descriptions available as hover titles, wide-screen directory at right after a divider. Narrow panels place directory beside the section label and scroll categories horizontally.
- Color: existing NeoWorker theme tokens and blue selection; category tint intentionally lighter and icons smaller than the selected design, as agreed. Sidebar keeps NeoWorker branding and active-item styling.
- Assets: existing app icon and Lucide icons; no generated raster UI assets or replacement publisher logos.
- Copy: original category names, localized descriptions and computed source count preserved. WorkBuddy task content and account controls are not copied. The fixture's empty task list is not a spacing regression.

## Interaction and verification

- Selected Open source, Business and All topics; pressed states, heading and filtered providers update.
- Opened and closed the source directory; expanded state and category content update.
- At 560px panel width, category row remains one line with 524px client width versus 882px English scroll width. Clicking the final category scrolls it into view (scrollLeft 355.5). Keyboard Tab exposes a 2px blue directory focus outline.
- Chinese, English and dark category states inspected. Sidebar refinement is scoped to the existing light/Oblivion design system; collapsed rail untouched.
- Final sidebar preview has no captured console errors.
- `npm run build:react` passed (11.09s); only existing bundle size warnings.
- Ran sidebar-proportions-design, collapsed-sidebar-rail-design, paper-news-navigation and paper-news-behavior: 9/11 assertions pass. Remaining failures assert the old Chinese Automation fallback and opening Source in the system browser. HEAD already uses the English Automation fallback and internal NeoWorker browser; these paths are unchanged by this patch. No claim of an entirely green test suite.
- `git diff --check` passed. No macOS package created for this change; installed app will not update from this source edit alone.

---

# Reading assistant implementation QA — 2026-09-26

Final result: passed

## Scope and visual references

- Selected main reference: `/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-f136fc36-a12e-473e-a5ff-95f9d0db4b55.png`.
- Supplementary selection-tools reference: `/Users/wangchao/.codex/generated_images/01a0b466-f552-7a20-aa51-ca0065dffb7f/exec-766a7f11-dfce-4b15-a78c-c60421078e3f.png`.
- Actual production BrowserWorkbenchView and BrowserReadingAssistant in an isolated Electron window: `output/reading-assistant-qa/native-reading-final.png` (1440 × 960, light theme, expanded browser, assistant open, one completed answer).
- Actual native PDF selection toolbar: `output/reading-assistant-qa/pdf-selection-final.png`.
- Responsive component evidence: `output/reading-assistant-qa/narrow-loading.png` and `narrow-error.png` (640 × 760).
- Interactive component fixture: `http://127.0.0.1:5194/reading-preview.html`. Article and model responses are explicitly simulated. Production code uses the configured model; no production credentials or user conversations were used for tests.

The selected mock and implementation were opened together in the same comparison tool result, twice (initial and corrected). Comparison focuses on the reading surface and right assistant; the mock's invented left navigation, third-party page redesign, reading-mode and bilingual-page buttons were intentionally excluded in the accepted first-release scope. Existing browser chrome is preserved. The real page remains dominant; the assistant can be collapsed. Sources and answer text differ because the test fixture is explicitly synthetic. Full-resolution images make the entire assistant legible, so a separate cropped image was not needed; header, tabs, source/scope strip, body typography, citation/save controls and pinned composer were individually inspected.

## Findings and comparison history

1. [P2, resolved] Initial assistant body text was too small and the column too narrow relative to the reference. Changed answer/question text to 14px and desktop column from 350px to 380px. Re-captured as `native-reading-final.png`, compared with reference again; body, controls and composer remain legible without clipping.
2. [P2, resolved] News fullscreen browser reserved the title-bar height twice. News container already starts below the app title bar. Scoped child browser padding to zero and height to 100%; final native screenshot shows the tab strip directly below the app bar. Standalone/task browser title-bar reservation remains unchanged.
3. [P1, resolved] Native PDF selection does not emit the same webview-tag event as HTML selection. Added trusted main-window context-menu relay; accept PDF source in either pageURL or frameURL, restricted by guest bounds. Final native screenshot and accessibility capture verify Translate / Explain / Ask / Save note. Actual selected PDF text reached the reading handler, explanation succeeded, and saving the selection produced a local note.
4. [P2, resolved] Saving a generated answer previously lacked an original-text target. Notes now retain the cited original block, allowing source location rather than searching for generated prose.

No remaining actionable P0/P1/P2 visual findings within the accepted scope.

## Five fidelity surfaces

- Typography: existing app font stack and lucide icons; 14px answer/question, restrained 15px heading, smaller source/model metadata. Chinese and English wrap without horizontal overflow. Article typography remains controlled by the original site.
- Spacing/layout: original page primary, 380px right assistant, independently scrolling answer area, pinned question field; at <=700px the assistant becomes a closable overlay. Top chrome has one title-bar reserve.
- Colors/tokens: existing white/elevated surfaces, text/border theme tokens and NeoWorker blue; blue question background, selected tab underline, no decorative cover art.
- Assets: production lucide icons; no invented publisher logos or generated page illustrations. Sample article is labeled as sample data. Original website/PDF content is preserved in the real webview.
- Copy: ask/notes tabs, actual source title, selected passage vs webpage vs specified PDF page scope, honest truncation and unavailable-text messages, cancellable loading, retry by retaining input, local-only note copy.

## Functional evidence

- Real Electron guest: visible HTML extraction, configured-provider call boundary (simulated provider in QA only), selected passage translation, PDF page text extraction and page count, native PDF selection explanation and local-note save.
- Browser component fixture: loading and stop control, error with retained question, saved-note count surviving reload, 640px overlay with visible composer and close controls.
- 25 focused tests pass across reading IPC, reading state, news navigation/cache behavior and PDF generation HTML.
- Renderer and Electron builds pass. Full-repository typecheck still reports 307 pre-existing errors; changed feature files do not appear in the error log.
- Console reviewed: no new production reading errors after fixes. Development harness showed the expected Electron dev CSP warning. A fixture-only HMR createRoot warning was corrected using disposal on hot reload; early harness updateSession typo was corrected to updateSessionStatus. These do not exist in the production integration.

## PDF typography check

- New academic paper template uses Chinese Songti/serif body, Times New Roman Latin text, app sans-serif headings, restrained black headings and no blue title rule. Known translation suffixes are ignored when removing a duplicated leading manuscript title. Existing business-report template remains separate.
- Actual generated sample: `output/reading-assistant-qa/academic-sample.pdf` (one-page typography sample, not a full paper translation).
- Final PDF raster inspected: `output/reading-assistant-qa/.neoworker/pdf-previews/academic-sample/final-page-1.png`.
- Generator reports passed CJK text integrity, embedded Unicode font resources and final-page render validation. Body and heading contrast, Latin/CJK mix, line breaks and page margins visually checked.

## Limits and follow-up

- PDF questions currently use a specified page or selected text; page selection is explicit and not a claim to have read the full PDF. Scanned/image-only pages report no extractable text.
- No paid/login access is bypassed; webpage answers use text already available in the guest. Remote configured-model answers were not live-tested with user credentials.
- Local notes are bounded to 500, with storage errors shown instead of claiming success. No cloud synchronization is added.
- No macOS installer was requested for this development turn; these changes are in the working tree.
