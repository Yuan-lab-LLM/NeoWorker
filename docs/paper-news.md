# News Feed

News Feed is available in the current source tree. Previously published v0.2.3 release installers do not include it; local test builds can differ.

## Topic navigation and source directory

The six top-level categories are Research (3 planned/connected providers), Open source (6), Technology (5), Markets (3), Policy & economy (6), and Business (4). Their 27 entries are a curated directory, not 27 active integrations.

Only arXiv and Hugging Face Papers are currently connected in Research, and GitHub, Hugging Face Models and Hugging Face Datasets in Open source. Each Hugging Face feed has its own official API, cache and preferences; neither Hub feed reuses paper results. The Technology selection is QbitAI, SemiAnalysis, TrendForce, EE Times China, and ChinaTalk. All 18 Technology, Markets, Policy & economy and Business sources are connected through public RSS or HTML listings. There are 23 connected sources total; the remaining four entries are planned.

Select a category, then a connected source. Search, sorting and bookmarks continue to apply within the selected category/source. Switching category resets the publisher filter but preserves search and bookmark mode. **All topics** returns to the combined feed. The source directory labels unavailable providers as **Planned**; categories without an adapter explain that no feed is connected and offer a return to existing content. Refresh/preferences are disabled in those categories rather than pretending to fetch them.

The initial experience uses built-in source defaults; preferences are optional. Source health, retry information, and independent settings remain available under **Fetch status and source settings** below the results.

## Discover and save

Open **Preferences** in the page header to manage general defaults and six category profiles. Each category also has a **Category preferences** button. Source-specific options are under **Advanced** inside its category (or the selected-source settings icon).

| Scope | Settings | Precedence |
| --- | --- | --- |
| General defaults | Time window, default sorting | Used by inheriting categories |
| Category | Up to five interests, optional time/sort overrides, enabled sources | Overrides general defaults |
| Source advanced | Optional interest/time overrides; arXiv subject, GitHub language/minimum stars, HF matching-only and Hub fetch order | Overrides category fields individually |

Interest terms are managed per category, not globally: technology interests do not leak into market news. Time windows support 7, 14, 30, 90 and 365 days. arXiv uses publication dates, GitHub code push dates, Hugging Face paper selection dates, model/dataset last-modified dates and publishers available publication dates. Unknown dates remain visible. Empty interests mean no topic restriction. Interest terms drive arXiv/GitHub queries and local ranking for the other sources.

Inherited controls display their effective values. Restore source inheritance without resetting source-specific options such as GitHub language. A single **Save preferences** applies all edits across scopes; navigation retains drafts, and closing with unsaved edits asks before discarding. Saving re-ranks cached items immediately and refreshes changed enabled sources subject to cooldowns. Sorting-only changes do not trigger fetching. Page-level sort changes are temporary and reset when switching category or saving preferences.

Disabling a source stops refreshes and hides it from discovery, while bookmarks and cached data remain available. An all-disabled category explains the state and keeps its preferences entry accessible. Re-enabling restores cached content. Existing custom source interests/time windows migrate into explicit source overrides; untouched defaults inherit. Existing arXiv/HF/GitHub advanced options are preserved.

Hugging Face matching-only filters the fetched daily selection locally, and is inactive without interests; it is not upstream full-text search. GitHub query terms use at most 25 characters each and may be shortened further to fit the query limit.

| Source | Content and date | Fetch limit |
| --- | --- | --- |
| arXiv | Title/abstract topic search; original publication date | 60 recent matches |
| Hugging Face Papers | Daily paper selection; selection date | Up to 100 selected papers, filtered by the time window |
| Hugging Face Models / Datasets | Public model/dataset metadata; last modified date | 60 entries per source, ordered by community trend, latest update or downloads, then filtered locally |
| GitHub | Repository keyword search; last code push date | 60 recently active repositories, fetched by star count |

These are bounded feeds, not exhaustive literature searches. A paper can appear under both arXiv and Hugging Face. Daily selections include non-matching items unless matching-only is enabled. GitHub search semantics differ from exact local keyword matching.

With interests, the recommendation score uses literal, case-insensitive topic matches (70%) and recency within the selected window (30%). Without interests it uses recency alone. It does not measure scientific rigor, correctness, or reproducibility. Stars and upvotes are shown separately as source-provided popularity counts.

Search filters the results already fetched. Bookmark up to 200 items to retain them independently of subsequent refreshes or topic changes. Source titles and abstracts remain in their original language; controls follow the application's Chinese/English setting.

The feed uses three cards per row on wide panels, two on medium panels, and one on narrow panels. Each source uses its official brand mark in the compact source panel and paper cards. Official SVGs and website icons are bundled locally, with suitable light/dark presentation. Source panels use the same soft blue accent treatment as the Automation page and shared page header. Paper cards and topic chips stay neutral; blue highlights primary actions and selection. See [brand asset provenance](../src/renderer/assets/paper-news/README.md). Ranking details are available under **About ranking and sources**.

## Consistent content cards

Cards use a cover-free layout for every source: official brand mark and date, title, authors, summary, topic/popularity details, source links, and aligned Read / Translate / Research actions. Titles and summaries have bounded previews; the full title is available on hover and the abstract expands in place. Source labels use restrained publisher-specific color, while panels and selected actions share NeoWorker's soft blue. Light and dark themes retain the original official logo variants.

The feed does not request cover images or download PDFs while displaying cards. Items with or without publisher image metadata use the same layout. Previously cached thumbnails are not used by the feed. Reading and translation continue to use the original source and PDF links when a task is started.

## Read, translate, research

Card actions create a fresh task draft containing the original source links. Review and send it to run with the model and permissions configured in NeoWorker:

- **Read:** retrieve the full paper or repository documentation and produce a cited explanation.
- **Translate:** translate the full paper into the interface language, preserving figures, tables, equations, and numbering in a final PDF. Repository cards request a translated Markdown README instead; model and dataset cards request a translated Markdown model/dataset card, preserving license and access conditions.
- **Research:** compare the source with related work and implementations and produce a cited research report.

Models and datasets show task type, license (when provided), likes, last-30-day downloads and gated-access status. Public metadata does not imply an open-source license; follow each source card’s license. Feed refresh and task drafts do not automatically download weights or datasets.

No model request runs merely from fetching a feed or opening a draft. Drafts treat source metadata as reference data rather than instructions. Full-text retrieval, translation, and research still depend on source accessibility, the selected model, and the existing document tools; feed success does not prove task completion.

## Refresh and storage

Opening the page refreshes sources whose successful results are older than 30 minutes, or whose failed attempt is eligible for retry. **Refresh** requests new data manually, with a persisted per-source cooldown. Temporary connection failures receive at most one retry after three seconds; rate limits and access denials are not immediately retried. Server Retry-After and GitHub quota reset deadlines are respected across restarts and topic changes. While the page is visible, eligible transient failures are retried automatically. Leaving the page does not restart an in-flight fetch. A source failure retains its prior results and last successful fetch time; the other sources can still update. An unavailable source with no cache displays a dash, not a misleading zero-result count.

Legacy shared settings are migrated into independent source settings, preserving cached items, bookmarks, and retry deadlines. Cache schema version 4 is written on save or refresh, with versions 1–3 still readable. Hierarchical preferences retain cached results during refresh/cooldowns and re-rank them using effective settings; bookmarks remain available even if they no longer match the new filters.

Configuration, fetched metadata, and bookmarks are stored in `paper-news.json` under the application's user-data directory. Papers and repository code are not downloaded during feed refresh. Fetches use the application's existing system-proxy-aware network transport and require no API token. GitHub public search quotas and regional network restrictions can limit availability.

## Implementation

The implementation is independent TypeScript code integrated with NeoWorker's desktop IPC and design system. It uses official source APIs; no reference-project source code or third-party feed mirrors are embedded.

## Layout regression check

The feed owns its scrollport and positioned accessibility labels. Opening preferences scrolls that panel only. Long result lists must not increase the outer document height or move the sidebar; test both scrolling to the bottom and opening/closing preferences.
