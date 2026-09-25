# News Feed

News Feed is available in the current source tree. Previously published v0.2.3 release installers do not include it; local test builds can differ.

## Topic navigation and source directory

The six top-level categories are Research (3 planned/connected providers), Open source (5), Technology (5), Markets (3), Policy & economy (6), and Business (4). Their 26 entries are a curated directory, not 26 active integrations.

Only arXiv and Hugging Face Papers are currently connected in Research, and GitHub in Open source. Hugging Face Models is a separate planned provider; it never reuses paper results. The Technology selection is QbitAI, SemiAnalysis, TrendForce, EE Times China, and ChinaTalk. Other source integrations are outside this UI change.

Select a category, then a connected source. Search, sorting and bookmarks continue to apply within the selected category/source. Switching category resets the publisher filter but preserves search and bookmark mode. **All topics** returns to the combined feed. The source directory labels unavailable providers as **Planned**; categories without an adapter explain that no feed is connected and offer a return to existing content. Refresh/preferences are disabled in those categories rather than pretending to fetch them.

The initial experience uses built-in source defaults; preferences are optional. Source health, retry information, and independent settings remain available under **Fetch status and source settings** below the results.

## Discover and save

Open **News Feed** in the sidebar and choose **Preferences**, or use the settings icon beside the source filters. Each source has its own settings tab, up to five comma-separated topics (60 characters each), and a 7-, 14-, or 30-day window. English terms work best with these sources.

| Source | Independent settings |
| --- | --- |
| arXiv | Search topics, publication window, optional category such as `cs.AI` |
| Hugging Face | Interest topics, selection window, optional matching-only filter |
| GitHub | Search topics, code push window, optional programming language and minimum stars |

Saving applies and refreshes only the selected source, subject to its existing cooldown. Other sources' cached content and saved settings remain unchanged. Unsaved edits remain available when switching tabs until the settings panel is closed. Hugging Face matching-only filters the fetched daily selection locally; it is not an upstream full-text search. GitHub query terms use at most 25 characters each and may be shortened further to fit the search endpoint's query limit when additional filters are selected.

| Source | Content and date | Fetch limit |
| --- | --- | --- |
| arXiv | Title/abstract topic search; original publication date | 60 recent matches |
| Hugging Face | Daily paper selection; selection date | Up to 100 selected papers, filtered by the time window |
| GitHub | Repository keyword search; last code push date | 60 recently active repositories, fetched by star count |

These are bounded feeds, not exhaustive literature searches. A paper can appear under both arXiv and Hugging Face. Daily selections include non-matching items unless matching-only is enabled. GitHub search semantics differ from exact local keyword matching.

The recommendation score uses literal, case-insensitive topic matches (70%) and recency within the selected window (30%). It does not measure scientific rigor, correctness, or reproducibility. Stars and upvotes are shown separately as source-provided popularity counts.

Search filters the results already fetched. Bookmark up to 200 items to retain them independently of subsequent refreshes or topic changes. Source titles and abstracts remain in their original language; controls follow the application's Chinese/English setting.

The feed uses three cards per row on wide panels, two on medium panels, and one on narrow panels. Each source uses its official brand mark in the compact source panel and paper cards. The unmodified SVGs are bundled locally, with suitable light/dark variants. Source panels use the same soft blue accent treatment as the Automation page and shared page header. Paper cards and topic chips stay neutral; blue highlights primary actions and selection. See [brand asset provenance](../src/renderer/assets/paper-news/README.md). Ranking details are available under **About ranking and sources**.

## Consistent content cards

Cards use a cover-free layout for every source: official brand mark and date, title, authors, summary, topic/popularity details, source links, and aligned Read / Translate / Research actions. Titles and summaries have bounded previews; the full title is available on hover and the abstract expands in place. Source labels use restrained publisher-specific color, while panels and selected actions share NeoWorker's soft blue. Light and dark themes retain the original official logo variants.

The feed does not request cover images or download PDFs while displaying cards. Items with or without publisher image metadata use the same layout. Previously cached thumbnails are not used by the feed. Reading and translation continue to use the original source and PDF links when a task is started.

## Read, translate, research

Card actions create a fresh task draft containing the original source links. Review and send it to run with the model and permissions configured in NeoWorker:

- **Read:** retrieve the full paper or repository documentation and produce a cited explanation.
- **Translate:** translate the full paper into the interface language, preserving figures, tables, equations, and numbering in a final PDF. Repository cards request a translated Markdown README instead.
- **Research:** compare the source with related work and implementations and produce a cited research report.

No model request runs merely from fetching a feed or opening a draft. Drafts treat source metadata as reference data rather than instructions. Full-text retrieval, translation, and research still depend on source accessibility, the selected model, and the existing document tools; feed success does not prove task completion.

## Refresh and storage

Opening the page refreshes sources whose successful results are older than 30 minutes, or whose failed attempt is eligible for retry. **Refresh** requests new data manually, with a persisted per-source cooldown. Temporary connection failures receive at most one retry after three seconds; rate limits and access denials are not immediately retried. Server Retry-After and GitHub quota reset deadlines are respected across restarts and topic changes. While the page is visible, eligible transient failures are retried automatically. Leaving the page does not restart an in-flight fetch. A source failure retains its prior results and last successful fetch time; the other sources can still update. An unavailable source with no cache displays a dash, not a misleading zero-result count.

Legacy shared settings are migrated into independent source settings, preserving cached items, bookmarks, and retry deadlines. Cache schema version 2 is written on the next save or refresh. Changing a source configuration clears only that source's stale query results; bookmarks remain available even if they no longer match the new filters.

Configuration, fetched metadata, and bookmarks are stored in `paper-news.json` under the application's user-data directory. Papers and repository code are not downloaded during feed refresh. Fetches use the application's existing system-proxy-aware network transport and require no API token. GitHub public search quotas and regional network restrictions can limit availability.

## Implementation

The implementation is independent TypeScript code integrated with NeoWorker's desktop IPC and design system. It uses official source APIs; no reference-project source code or third-party feed mirrors are embedded.
