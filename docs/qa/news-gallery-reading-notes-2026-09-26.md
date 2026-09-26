# News gallery and reading notes — 2026-09-26

## Behavior

- All articles defaults to compact text cards. Image browsing is explicit and admits only verified publisher images; missing/failed images never produce blank gallery cards. Counts and a return-to-all action explain the subset.
- Gallery covers occupy the full card width at 16:9 without cropping. Clicking opens a near-window-size preview with zoom, fit, close and Escape. Image processing retains up to 1600 pixels and invalidates old cover caches.
- Cover discovery checks 12 eligible articles per batch, at most two concurrent requests, and stops scheduling when image mode closes. Existing pilot-source eligibility remains unchanged.
- Reading notes uses the window minus 24 pixels on each edge, with a searchable note index and a separate reader. Only the selected note is displayed. Quotes default collapsed; expanding them uses the full reader rather than a nested small scroll box. Source navigation and persisted notes are retained.
- At widths below 760 pixels the note index stacks above the reader; the workspace uses 8-pixel outer margins.
- Translation visibility tracking also registers gallery cards added after image discovery.

## Verification

- 27 tests pass across `news-gallery-notes`, `news-auto-summaries`, `covers`, and `cover-renderer`: image admission/order/batching/concurrency/failure, late card translation, note search/selection/source/deletion fallback, summary regression and image resizing.
- React production build and Electron TypeScript build pass. React reports existing bundle-size warnings.
- Whole-project TypeScript checking reports unrelated existing errors (App, connector typings, routine workflows, usage insights, UI density and other modules); no errors were reported for files changed here in the initial check.
- Local browser fixture uses production components, cached publisher images, stubbed APIs and four synthetic notes. Verified 1536×960 gallery, image preview/zoom/Escape focus return, note search/selection and long content, plus a 700×850 notes layout. This is not an installed-app or live-source end-to-end test.
- Screenshots: `output/gallery-notes-qa/gallery.png`, `image-preview.png`, `reading-notes.png`, `reading-notes-narrow.png` (local ignored artifacts).

## Delivery boundary

This change has not been packaged into a new DMG. The prior `900273b` installer does not contain this redesign.
