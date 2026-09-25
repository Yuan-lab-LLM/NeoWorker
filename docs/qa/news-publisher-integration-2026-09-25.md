# News publisher integration verification — 2026-09-25

## Scope

Replaces the four empty category placeholders with 18 anonymous RSS/HTML adapters. Existing arXiv, Hugging Face Papers and GitHub remain available (21 connected sources total). No account, API key or custom endpoint is required.

## Live check

Production `PaperNewsService` with Electron `fetchWithSystemProxy`, isolated temporary profile, credentials omitted. Tested on this Mac with its current network/system proxy; this is not a guarantee for every network or future publisher markup. All 18 sources returned HTTP 200 and parsed items. Cache reload retained all 437 items.

| Source | Category | Items |
|---|---|---:|
| qbitai | technology | 10 |
| semianalysis | technology | 20 |
| trendforce | technology | 8 |
| eetimes | technology | 40 |
| chinatalk | technology | 20 |
| yicai | finance | 40 |
| cls | finance | 40 |
| wallstreetcn | finance | 19 |
| pboc | policy | 40 |
| nbs | policy | 12 |
| ndrc | policy | 32 |
| miit | policy | 40 |
| csrc | policy | 40 |
| fed | policy | 15 |
| huxiu | business | 40 |
| stratechery | business | 10 |
| benevans | business | 5 |
| bcg | business | 6 |

## Regression and UI checks

- 61 targeted tests passed: original adapters, source recovery/cooldown, migration, bounded concurrency, partial failure retention, publisher parsers, owned redirects, response limits and navigation.
- Full production build passed (renderer, Electron, daemon and CLI).
- Renderer-wide type check has pre-existing unrelated diagnostics; no diagnostics in changed news files.
- Production panel rendered using the real 437-item snapshot; preview IPC is mocked. Category counts: 98 / 99 / 179 / 61.
- Source filtering, per-source settings and article translation draft checked through browser UI.
- At 1500px: three content columns, no horizontal overflow. At 560px: one column, no horizontal overflow.
- Live reports and screenshots: `output/news-integration-2026-09-25/`.

## Limits

Only publicly supplied headlines, links and excerpts are aggregated. Missing publication dates remain unknown, and paid content is not unlocked. HTML sources can change markup; invalid/blocked responses surface source errors and retain the previous cache. OpenAlex, HF Models, Hacker News, Cnblogs and Cloudflare remain planned outside these four categories.
