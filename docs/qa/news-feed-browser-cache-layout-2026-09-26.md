# News Feed browser, cache and equal-height cards — 2026-09-26

## Changes

- Titles and PDFs open the existing BrowserWorkbenchView beside the feed, using a dedicated news browser session. Tabs, navigation, fullscreen and close controls reuse the task browser implementation. Source buttons retain the system-default-browser route. Draft/message source-preview links use the containing task's browser, with the same workbench for standalone previews.
- Entry reads cached metadata only. Stale data, failed sources and elapsed retry deadlines no longer initiate page-driven refreshes. Explicit Refresh and changed-source preference saves still fetch. Re-entry joins an existing refresh and clears its busy state when that refresh completes.
- Grid rows stretch to equal heights. A bottom-aligned footer keeps tags, source links and actions together. Expanded abstracts scroll within 220 pixels instead of stretching every card without limit.

## Verification

- 11 tests passed across the new renderer behavior suite, structured task draft suite and network request suite. Covered stale/failed cache entry and remount, elapsed retry timers, explicit refresh, observing an existing refresh, title/PDF routing and external Source routing.
- Frontend production build passed. Targeted lint: no errors; four pre-existing App.tsx warnings. Full type-check remains at 307 existing diagnostics, with no diagnostics in the changed news components or tests.
- Real PaperNewsPanel browser fixture: at 1800 × 1100, all six news cards measured 270.5 pixels high, with identical footer bottoms per row. Mixed-summary cards at the default two-column width also measured identical heights (361.984375 pixels).
- Verified title opens the actual BrowserWorkbenchView UI with the correct URL, switches to fullscreen and back, and closes while retaining the current category. Browser fixture does not render Electron webview guest content; remote page/PDF loading and system browser launch were not re-tested end to end. Renderer tests mock IPC.
- Local screenshot evidence: `output/news-feed-fixes-2026-09-26/equal-cards.png` and `browser-sidebar.png`.

No installer or remote release was produced for these changes.
