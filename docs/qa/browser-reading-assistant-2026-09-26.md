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
