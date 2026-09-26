# Compact news cards and automatic summaries — 2026-09-26

## Behavior

- Publisher images appear as 112 × 84 px thumbnails beside the excerpt, below the full-width title and author. Missing images leave the excerpt at full width with no placeholder.
- Titles are capped at two lines, excerpts at four. Details stay collapsed initially and their expanded text scrolls within a 180 px maximum height.
- Existing three/two/one-column breakpoints, image-source policy, aggregate text view, and per-row action alignment remain in use.
- Cards from news publishers without a summary automatically fetch a public page description or excerpt when visible. This does not invoke a model.
- The renderer requests at most two different hosts concurrently, serializes each host, and waits at least 1.7 seconds after a successful response before the next request to that host.
- Busy responses receive at most two automatic retries; other failures do not loop. Failed/restricted items have a retry control; unavailable public summaries direct readers to the source.
- Completed summaries use the existing main-process persistence for both feed items and bookmarks. Queued cards that leave view are skipped; unmount prevents result delivery and further scheduling.

## Validation

- 12 tests passed: six new hook behavior tests plus six existing extraction/cooldown/persistence tests.
- `npm run build:react` passed (existing bundle-size warning).
- `git diff --check` passed.
- Full `npx tsc --noEmit` remains blocked by errors outside the changed files, including App unused symbols, browser-electron-api connector allowlist types, and ui-density missing exports. The final typecheck reports no errors in the changed component, hook, or test.
- Browser QA used the production PaperNewsPanel with cached real GitHub Blog images and stubbed IPC responses for deterministic success/unavailable/failure cases. This is a local preview, not a test of the installed application or every publisher's live network access.
- At 1536 px viewport width, mixed image/text cards were 408.17 px high; title tops and action rows matched exactly across three columns. Thumbnail measured 112 × 84 px.
- At 1280 px viewport width, two-column cards had no horizontal overflow. At 960 px, single-column cards also had no horizontal overflow.
- Visible EETimes fixtures requested summaries automatically in sequence, displaying summary text, unavailable state, and failure with retry without clicking a fetch button.

## Evidence

- `output/compact-news-qa/mixed-desktop.png`
- `output/compact-news-qa/automatic-summaries.png`
- `output/compact-news-qa/single-column.png`
- Fixture: `output/ui-preview/news-categories/compact-preview.html`

No installer rebuilt in this change. Existing installed applications do not automatically pick up these source edits.
