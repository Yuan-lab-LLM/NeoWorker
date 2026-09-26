# Chinese card display and compact headlines — 2026-09-26

## Changes

- Explicit Chinese-display toggle translates visible English titles/summaries through the existing configured model, at two requests maximum concurrently. Successful exact-content translations persist in a bounded local cache. Original mode stops further queueing.
- Original identifiers, links and metadata remain intact. Missing summaries are never synthesized. Failure retains source text and offers retry; missing configuration pauses the queue.
- Cards use content height; absent authors/tags/details no longer occupy empty slots. Headline-only cards retain source and task actions in a compact layout.

## Verification

- 84 focused tests passed: 82 source/translation/IPC tests and 2 navigation tests. Includes cache restart/content invalidation, concurrent deduplication/limits, malformed/English/empty responses, model-unavailable handling, preserved repository identifiers, missing abstracts, IPC trust, provider payload/no tools, usage recording and 60-second abort.
- Electron TypeScript build and Vite production build passed. Vite reports its existing large-chunk advisory. Targeted oxlint: 0 warnings/errors.
- Repository-wide renderer type-check remains blocked by existing unrelated diagnostics; none reference the changed feed/translation components.
- Browser test uses the real feed component with an isolated mock IPC fixture. Verified translated titles/summaries, original toggle, retry after simulated error, cached toggle with no additional IPC requests, and Chinese-text search.
- Six cached Chinese headline-only cards: 271 px at the test viewport, no empty details disclosures and no translation requests. Responsive layout remains two columns at this 1280 px window; existing wide three-column CSS retained.
- Screenshots: `output/news-translation-2026-09-26/chinese-cards.png` and `compact-cards.png` (local ignored artifacts).

## Limits

The UI fixture returns controlled translations; a live external-model translation was not exercised. No automatic article-body enrichment was added. No installer, release or remote push was produced for this change.
