# Browser navigation and divider follow-up — 2026-09-26

## Changes

- Install a main-process window-open handler on every embedded webview before its first load.
  HTTP(S) popup targets navigate in the originating pane, while native popup creation is denied.
  Invalid/non-web schemes do not launch another application. Normal page navigation is unchanged.
- News card Source/Repository/Model card links now use the same embedded browser as titles/PDF links.
- Replace the tab-strip's hard-coded Summary label with localized Browser text.
- Give the shared six-dot divider grip a non-shrinking 12 px width and non-shrinking icon.
  Browser and reading assistant already use this same component as the conversation workspace.

## Validation

- Ten popup/URL-policy tests passed (six popup cases and four existing URL-policy cases).
- Electron TypeScript and renderer Vite builds passed; Vite reports existing bundle-size warnings.
- The separate renderer source-inspection navigation suite has five passes and three pre-existing
  failures: removed unsupported-URL wording and two exact formatting assumptions. The changed
  BrowserWorkbenchView differs from HEAD only in its Browser label, so those assertions are
  unaffected by this patch. They are not counted as passed.
- A standalone Electron QA window used the actual PaperNewsPanel, BrowserWorkbenchView,
  BrowserReadingAssistant, webview and production popup handler, with local fixture news/IPC.
  The user's installed NeoWorker application was not replaced or restarted.
- Clicked Source, a target=_blank PDF link, and a window.open project link. Navigation stayed
  in the originating webview; native-window logs showed only the original QA window.
- Both six-dot grips were visible. Pointer dragging changed browser width 64 → 68 percent
  and reading assistant width 38 → 47 percent.
- Screenshot: `output/reading-assistant-qa/browser-divider-fixed.png`.

The first hardware-accelerated QA window stopped repainting after returning from a PDF while
accessibility/navigation events continued updating. The final HTML and divider interaction
checks used a restarted software-rendered QA window. This is a remaining validation limitation;
production rendering settings were not changed. No installer was built in this turn.
