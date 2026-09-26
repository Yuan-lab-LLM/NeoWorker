# News images and sidebar spacing — 2026-09-26

## Scope

The agreed first pilot remains MIT AI, Qbit, EETimes, GitHub Blog and Huxiu.
The aggregate feed remains text-only. Technology/business categories and supported
individual sources can show publisher images. Other tiers in the earlier proposal
have not been enabled by this change.

## Changes

- Add a visible Technology images entry from the aggregate feed.
- Default eligible image views on when no preference exists; preserve an explicit off preference.
- Size cards per row instead of stretching every row to the tallest card in the entire feed.
- Increase the light-theme navigation row height from 32 to 36 px, add 4 px between rows,
  and increase spacing around New task and the session section without resizing icons/text.
- Include only the validated public article origin as the Referer for image requests.
  Qbit's CDN rejected these requests with HTTP 403 before this change and returned HTTP 200
  after it. Advance the cover cache version so cached misses do not mask the fix.

## Verification

- 14 tests passed across `news-images.test.ts` and `covers.test.ts`, including a regression
  for origin-only Referer handling and the aggregate-feed text-only policy.
- `npm run build:react` and `npm run build:electron` passed.
- Actual Electron cover service fetched and decoded all three sampled Qbit article images
  (articles 497177, 497278 and 497108); no simulated images were substituted.
- Local browser fixture used production Sidebar/PaperNewsPanel and those fetched cover results.
  At 1536 px viewport width all three image boxes were 386.66 × 217.49 px and the three
  action rows had the same vertical position. Turning off image view removed images;
  reloading and selecting Technology preserved the off preference.
- Preview screenshot: `output/news-images-qa/fixed-qbit-and-spacing.png`.
  Browser preview used cached public article data and stubbed IPC; live fetch was tested
  separately through the Electron cover service. It is not an installed-app screenshot.

No installer was rebuilt for this change.
