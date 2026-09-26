# News task composer — 2026-09-26

## Change

Read/translate/research actions now provide a short editable request and a structured source card. The official publisher logo, action and title remain visible; execution requirements and source/PDF links are collapsed. Removing the card removes its requirements from the outgoing message. Full task instructions and source data are serialized only when sending. User-message rendering recognizes the validated envelope and restores the compact card, including persisted messages.

Draft context is scoped to the same workspace/session key as the existing text draft. New programmatic drafts replace the source context. Failed sends retain/restore it; successful sends and explicit clear commands remove it. MainContent's memo comparator now observes programmatic draft requests.

## Verification

- 30 tests passed: shared task-envelope round trips for all three actions, existing paper-news tests, and sidebar navigation tests.
- Electron TypeScript build and production renderer build passed.
- Focused lint: 0 errors, 18 existing warnings in surrounding components.
- Full-project type check remains blocked by 307 existing errors; no diagnostics in the new task-envelope/card files.
- Browser QA used the real MainContent, UserMessageText and source-card components in a local Vite harness with mocked IPC. Verified all three actions, editing the request, collapsed/expanded requirements, workspace draft isolation and restoration, simulated failed creation, successful send and message rendering, and removing the source before sending (outgoing message then contains no source envelope).
- No external model request or installed-app mutation was performed. Packaged macOS testing is not included in this change.

Preview harness: `output/ui-preview/news-categories/composer-preview.html` (local ignored QA artifact). Screenshot: `output/news-task-composer-2026-09-26/compact-draft.png`.

## Attachment-style refinement

Following the user's file-attachment reference, source cards now reuse the existing 310 × 44 px attachment chip styles and appear in the attachment row above both welcome and session composers. The chip shows a publisher logo, ellipsized title, action and publisher; clicking it reveals the full title and requirements, while its separate remove button drops the source context. Sent messages use the same chip. Narrow layouts follow existing attachment sizing.

Browser checks used the real composer and user-message components: collapsed position, expand/collapse, successful sending and compact history rendering. Shared envelope tests (6) and renderer production build passed; focused lint had no errors. No installer was produced. Screenshot: `output/news-task-composer-2026-09-26/attachment-style.png`.
