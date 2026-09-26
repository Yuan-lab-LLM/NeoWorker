# Public news source expansion — 2026-09-26

The directory now has 34 entries: 33 connected adapters and OpenAlex still planned. Technology retains the five previously selected publishers. All new feeds use public endpoints without credentials or user setup.

## Live application transport verification

An isolated Electron process used the production `fetchWithSystemProxy` and `PaperNewsService`, with a separate user-data directory and cache. All ten endpoints returned HTTP 200. Default date filtering left 215 items:

| Category | Source | Endpoint | Visible items |
| --- | --- | --- | ---: |
| Research | Nature machine learning | https://www.nature.com/subjects/machine-learning.rss | 30 |
| Research | MIT AI | https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml | 10 |
| Development | Hacker News | https://news.ycombinator.com/rss | 30 |
| Development | Cnblogs | https://feed.cnblogs.com/blog/sitehome/rss | 20 |
| Development | Cloudflare Blog | https://blog.cloudflare.com/rss/ | 9 |
| Development | GitHub Blog | https://github.blog/feed/ | 8 |
| Finance | FT Chinese | https://www.ftchinese.com/rss/feed | 20 |
| Finance | Economic Observer | https://www.eeo.com.cn/ | 33 |
| Policy | ECB | https://www.ecb.europa.eu/rss/press.html | 15 |
| Business | MIT Sloan | https://news.mit.edu/rss/school/management | 40 |

Local evidence: `output/source-expansion-2026-09-26/electron-http.json`, `electron-snapshot.json`, and `electron-live.cjs`. A preliminary Node fetch test timed out for four sources; all four succeeded using the application's actual Electron transport. This verifies availability on this machine at test time, not universal network availability.

Hacker News uses each feed item's official discussion URL, labeled “讨论”, instead of following arbitrary external article hosts. Its “Comments” HTML is not treated as an abstract. GitHub Blog embeds HTML doctypes within CDATA: these inert strings are accepted, while actual XML DTD/entity declarations remain rejected. Cnblogs Atom authors use their name without the nested profile URL. Economic Observer headings and nested introductions are separated and publication dates come from the article path.

Machine Intelligence (机器之心) returned a data-service page and 36Kr did not expose parseable feed articles in these checks, so neither is claimed as connected. Paid Nature/FT articles remain limited to public metadata/excerpts.

## Validation

- 103 tests across 10 files passed, covering publisher parsing, request isolation, disabled sources, configuration inheritance, summary/translation behavior, and restoring caches with more than 1,200 items.
- Electron TypeScript build and Vite production build passed.
- Whole-repository type-check remains blocked by 307 unrelated renderer errors; the new JPG asset declaration resolves the only error from this change. Full output is retained in `output/source-expansion-2026-09-26/typecheck.log`.
- Targeted oxlint: zero errors/warnings; `git diff --check` passed.
- Isolated UI preview used production components with captured live data and mocked IPC. Verified 33 source filters, directory categories, seven development sources, inherited category settings, and all visible local logos loaded without horizontal overflow. Screenshot: `output/source-expansion-2026-09-26/expanded-sources.png`.
- Five official icon files added, with provenance in the asset manifest; existing official GitHub, Hacker News, Cnblogs and Cloudflare marks reused.

No installer or release was produced in this turn; the installed NeoWorker app and its personal data were not changed.
