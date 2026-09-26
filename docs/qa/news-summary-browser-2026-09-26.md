# News browser routing and public summaries — 2026-09-26

## Behavior

Titles now open the existing NeoWorker BrowserView in a full-window overlay. The feed stays mounted and inert; returning restores title focus, category, filters and scroll. Source links keep the system-browser IPC. This does not attach news to a previously selected task.

Publisher cards without summaries expose Fetch summary. Anonymous public HTML is inspected for page descriptions or article paragraphs (labeled excerpt), without model calls. Trusted IPC accepts only a cached item ID. Redirect allowlists, two-request concurrency, same-URL deduplication, host backoff/Retry-After, timeout and accepted-body-size checks protect the request. Descriptions are persisted to discovery/bookmarks and reused after restart and refresh when the article title/URL are unchanged. Access-denied, unavailable and network states remain compact and offer retry.

## Verification

- 90 tests in 11 files passed, including summary extraction/fallback, paid-body rejection, malformed/non-HTML/oversize responses, redirect rejection, timeout, deduplication, Retry-After, persistence/bookmarks/refresh preservation, IPC trust, existing sources, translations and navigation.
- Electron build, Vite build and targeted oxlint passed. Existing Vite large-chunk warnings remain. Full renderer type-check has unrelated baseline errors; no diagnostics match the modified news files.
- Live anonymous fetch through NewsSummaries for `https://wallstreetcn.com/articles/3782557` returned a 186-character page description, using the same extractor as production. This confirms one public article, not universal source availability.
- Browser fixture with the real component verified summary fetching/success, a simulated access restriction, title -> BrowserView URL, no external-open call on the corrected title path, external-open call on Source, and return to the same category with the fetched summary retained.
- Browser fixture uses a standard web page: Electron guest-page rendering itself was not exercised, and the system-browser IPC was mocked. No installed user application was changed.
- UI proof: `output/news-summary-2026-09-26/summary-states.png` (ignored local artifact).

No installer or remote release was produced.
