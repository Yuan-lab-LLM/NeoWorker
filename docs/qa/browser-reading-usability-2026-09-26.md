# Browser reading usability — 2026-09-26

## Changes

- News browser defaults to 64% of the workspace, with a draggable and keyboard-adjustable divider and persisted width.
- Reserve the app title bar once in sidebar mode; full-screen and close controls are no longer obscured. Full-screen remains inset below the app title bar.
- Reading assistant has its own divider (25–70%), persisted width, full-screen/restore and close controls. Expanding preserves the current conversation/draft.
- News Feed → Reading notes is a standalone local library. It searches titles, source URLs, notes and quotations, and reopens sources in the NeoWorker browser. Existing local notes retain their storage key. The assistant also offers current-article/all-notes scopes.
- PDF selection is read from the bundled Chromium PDF viewer within the owned guest. Only the trusted main renderer may request it; navigation invalidates results. No model call occurs until an explicit action. Right-click remains a fallback.

## Validation

- 18 tests passed across browser-reading-handlers, browser-reading, paper-news-behavior and paper-news-navigation.
- Renderer and Electron builds passed; git diff --check passed.
- Repository-wide type check still reports existing errors, with none in the files changed for this feature.
- Isolated Electron profile, actual PaperNewsPanel and BrowserWorkbenchView, fixture news data and local PDF: title opens browser; browser full-screen/close work; PDF text selection automatically reveals Translate / Explain / Ask / Save note.
- Saved a native PDF selection, expanded/restored the assistant, dragged its divider from 38% to 51%, closed the browser, opened the global note library and reopened the source from the saved note.
- Screenshots: output/reading-assistant-qa/pdf-auto-toolbar.png and notes-library.png.
- Test app stopped and temporary cloned Electron bundle removed. Production NeoWorker and profile were not changed.

## Limits

Notes remain local to the application profile (no cloud sync). The selection bridge uses the bundled Chromium viewer's controller, which must be rechecked on Electron upgrades; ordinary PDF right-click remains available. Scanned PDFs without selectable text still need OCR, which is outside this change. No installer was rebuilt during this fix.
