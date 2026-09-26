# Reading controls, PDF context and fonts — 2026-09-26

## Changes

- Browser and assistant dividers reuse the conversation's six-dot pill handle; normal boundaries remain visible.
- Assistant toggle lives beside the browser's fullscreen and close controls in the tabs row.
- The assistant's duplicate fullscreen control is removed. Width adjustment and close remain.
- Send control has zero padding and a non-shrinking white arrow/stop glyph, avoiding a collapsed icon inside the blue circle.
- PDF selection polling captures mouse-up in the owned PDF content frames, converts screen coordinates through the host window and zoom, then clamps/flips the toolbar near the selection. The former hardcoded top-left anchor is removed. Dragging/scrolling clears the pointer anchor.
- PDF questions default to all extracted pages, retain page IDs for citations and no longer expose a single-page input. Selected text remains a separate scope.
- Extraction is bounded to 30 MB downloads and 200,000 text characters. Empty/scanned pages and truncation are reported as incomplete coverage; entirely unreadable PDFs fail explicitly. No OCR or figure understanding is claimed.
- Generated PDF prose uses Times New Roman for Latin and FangSong for Chinese, including headings and metadata. Code/math keep their specialist fonts. Missing required fonts fail explicitly instead of silently substituting another face. The local macOS FangSong face is STFangsong (华文仿宋); proprietary font files are not bundled.

## Validation

- 41 relevant tests passed: IPC ownership/navigation and pointer coordinate conversion, full-document extraction/coverage/cancellation, toolbar edge placement, reading state/notes/drafts, conversation design, PDF generation HTML and integrity checks.
- `npm run build:electron` and `npm run build:react` passed. Existing bundle-size warnings remain.
- Native Electron 40 harness uses the actual PaperNewsPanel, webview and reading IPC, with a simulated model and isolated profile. No production conversations or model calls were used.
- Actual PDF drag selection displayed the toolbar adjacent to the drag end (screen pointer 1310,608; host point 1310,580). Clicking 提问 populated the assistant with that exact quote.
- Assistant resize changed the stored width from 51% to 43% without losing the draft. The send arrow is visible, and the assistant header only has close. Browser fullscreen remains.
- Actual three-page PDF request delivered three page blocks with `scope: pdf-document`, `totalPages: 3`, `truncated: false`; UI displayed `PDF 全文 · 共 3 页`.
- A fresh PDF was generated with the production generator, rendered and visually reviewed. Poppler `pdffonts` confirms embedded STFangsong and TimesNewRomanPSMT; Unicode text integrity passed.

## Local evidence

- `output/reading-assistant-qa/pdf-selection-position-fixed.png`
- `output/reading-assistant-qa/reading-controls-fixed.png`
- `output/reading-assistant-qa/fangsong-times-sample.pdf`
- `output/reading-assistant-qa/.neoworker/pdf-previews/fangsong-times-sample/final-page-1.png`

No installer was built in this change. Existing generated PDFs and installed apps are unchanged. The subsequent question about translating already-Chinese news was answered as a product recommendation (choose a target language); a translation language picker is not part of this implementation.
