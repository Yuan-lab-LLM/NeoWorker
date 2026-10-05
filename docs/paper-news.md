# News Feed

News Feed is included in v0.2.4 and newer desktop releases.

## Topic navigation and source directory

The current source tree has ten categories: Research, Open source, Technology, Markets, Policy & economy, Business, Health & living, Shopping & reviews, Productivity & tools, and Learning & growth. The directory has 41 entries: 40 connected sources and OpenAlex marked Planned.

All ten categories appear in a compact editorial index with a short description for each topic (18px section heading, 15px topic labels and 12px descriptions). Wide panels use two rows of five beside the Explore topics heading and All topics link; narrower panels reflow the index without hiding categories. The selected topic has a blue underline. Every category is directly selectable, including while a refresh is running. Existing category and source preferences continue to control the feed. The seven everyday feeds are WHO, ScienceDaily Health, Android Authority Reviews, Engadget, Zapier, The Learning Scientists, and Coursera. Their public RSS/Atom feeds were fetched and parsed successfully on 2026-09-29.

Opening a category automatically fetches enabled sources with no previous attempt. Returning to a category uses its cached content; previously failed requests retain their retry deadlines and manual refresh controls. Old six-category preferences migrate by adding defaults for the four new categories while retaining existing interests, disabled sources, and overrides.

Select a category, then a connected source. Search, sorting and bookmarks continue to apply within the selected category/source. Switching category resets the publisher filter but preserves search and bookmark mode. **All topics** returns to the combined feed. The source directory labels unavailable providers as **Planned**; categories without an adapter explain that no feed is connected and offer a return to existing content. Refresh/preferences are disabled in those categories rather than pretending to fetch them.

The initial experience uses built-in source defaults; preferences are optional. Source health, retry information, and independent settings remain available under **Fetch status and source settings** below the results.

## Discover and save

Open **Preferences** in the page header to manage general defaults and ten category profiles. Each category also has a **Category preferences** button. Source-specific options are under **Advanced** inside its category (or the selected-source settings icon).

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

Search filters the results already fetched. Bookmark up to 200 items to retain them independently of subsequent refreshes or topic changes. Source titles and abstracts default to their original language; controls follow the application's Chinese/English setting.

### Article opening and missing summaries

Card titles open the existing NeoWorker browser in an overlay. Closing it retains category, filters and feed scroll position, without attaching the page to an unrelated task. The **Source** button opens the same URL in the system default browser; PDF links retain their existing external behavior.

Publisher cards with no summary offer **Fetch summary**. On request NeoWorker reads public page metadata (Open Graph, description, Twitter description), or the first paragraphs in recognizable article containers. Body paragraphs are labeled **Article excerpt**, never passed off as an AI summary. There are no model calls, user-supplied endpoints or account setup. Success updates both discovery and bookmarks and persists to the feed cache; refresh preserves fetched text for unchanged titles/URLs when the source still omits its summary. Retrieval is manual, bounded to two concurrent requests, 15 seconds and 2 MB, with publisher host backoff and Retry-After support. Redirects must stay on the configured publisher's allowed hosts. No cookies are sent; access restrictions are not bypassed, and declared paid article bodies are not extracted. Unavailable/restricted pages explain the result and retain the compact card with a retry action.

### Chinese card display

**Show in Chinese** translates English card titles and summaries in place through the existing configured model. It does not create a task, fetch article bodies or translate a full PDF. **Show originals** restores source text and stops further queueing; up to two already-started requests can finish. Scrolling translates newly visible cards. Repository, model and dataset identifiers remain unchanged, along with authors, tags and links. Cached translations are included in local search while Chinese display is active.

Translation is explicitly enabled, may incur normal model costs, and records model usage. Only cached source metadata is accepted through the trusted main-window IPC; renderer-supplied prompts or URLs are not accepted. Requests time out after 60 seconds, run at most two concurrently, and errors preserve the original with a retry button. Missing model settings pause the queue. Successful translations are keyed to the exact original title/summary and persisted in `news-translations-zh.json` in app data (up to 500 entries / 8 MB). There is no translation request for already-Chinese content or empty Hub descriptions.

Cards follow content height instead of reserving title, author and summary space. Missing summaries show a compact “No source summary” label; empty authors, tags and detail disclosures are omitted. The source link and Read action remain available. Existing summaries are retained, and missing abstracts are never generated from a headline alone. No automatic article-body fetching is performed.


The feed uses three cards per row on wide panels, two on medium panels, and one on narrow panels. Each source uses its official brand mark in the compact source panel and paper cards. Official SVGs and website icons are bundled locally, with suitable light/dark presentation. Source panels use the same soft blue accent treatment as the Automation page and shared page header. Paper cards and topic chips stay neutral; blue highlights primary actions and selection. See [brand asset provenance](../src/renderer/assets/paper-news/README.md). Ranking details are available under **About ranking and sources**.

## Consistent content cards

Both display modes show article media with the official brand mark and date, title, authors, summary, source links and AI reading actions. In desktop **Feed** mode the image belongs in the left column and the text in the right column, including arXiv and other research sources. In **Cards** mode the image sits above the text. Titles and summaries have bounded previews; the full title is available on hover and the abstract expands in a scrollable area of at most 220 pixels. Source labels use restrained publisher-specific color, while panels and selected actions share NeoWorker's soft blue. Light and dark themes retain the original official logo variants.

Every entry reserves a 16:9 image area. Both modes resolve the article's own image; paper first-page previews are labeled explicitly. Source images retain their full proportions and support enlargement. Loading and unavailable images have explicit states, and must never be replaced with preset category illustrations. Cover resolution is limited to two concurrent requests for the displayed articles. Switching layouts retains filters, bookmarks, article order and resolved covers. Narrow panels stack media above the text; the desktop feed keeps its left image column. Reading and translation continue to use the original source and PDF links when a task is started.

Titles and PDF links open the existing browser workbench beside the feed, with tabs, navigation, fullscreen and close controls. Closing restores focus to the link and retains the feed. **Source** opens the system default browser. Source-preview links in task drafts and messages use the task's browser workbench.

## Read, translate, research

Card actions create a fresh task draft containing the original source links. Review and send it to run with the model and permissions configured in NeoWorker:

- **Read:** retrieve the full paper or repository documentation and produce a cited explanation.
- **Translate:** translate the full paper into the interface language, preserving figures, tables, equations, and numbering in a final PDF. Repository cards request a translated Markdown README instead; model and dataset cards request a translated Markdown model/dataset card, preserving license and access conditions.
- **Research:** compare the source with related work and implementations and produce a cited research report.

Models and datasets show task type, license (when provided), likes, last-30-day downloads and gated-access status. Public metadata does not imply an open-source license; follow each source card’s license. Feed refresh and task drafts do not automatically download weights or datasets.

No model request runs merely from fetching a feed or opening a draft. Drafts treat source metadata as reference data rather than instructions. Full-text retrieval, translation, and research still depend on source accessibility, the selected model, and the existing document tools; feed success does not prove task completion.

## Refresh and storage

During fetching, the refresh icon rotates and a small activity panel shows an indeterminate moving line and elapsed time while cached content remains available. During source cooldowns, the button shows a live countdown to the earliest eligible source, with a gently pulsing clock. These effects honor reduced-motion preferences and do not imply a completion percentage.

Opening or re-entering the page only reads cached results, even if stale or previously failed. It does not initiate network fetching. **Refresh all sources** requests every enabled information source regardless of the active category, source filter, or saved view, with a persisted per-source cooldown. The button’s cooldown also covers all enabled sources. Each source has a bounded request timeout; the overall time budget scales with the number of queued sources so later categories are not silently skipped behind slow sources. Temporary connection failures receive at most one retry after three seconds; rate limits and access denials are not immediately retried. Server Retry-After and GitHub quota reset deadlines are respected across restarts and topic changes. The page does not automatically launch another refresh when a retry deadline expires. Leaving the page does not restart an in-flight fetch; re-entry observes its progress until completion. A source failure retains its prior results and last successful fetch time; the other sources can still update. An unavailable source with no cache displays a dash, not a misleading zero-result count.

Legacy shared settings are migrated into independent source settings, preserving cached items, bookmarks, and retry deadlines. Cache schema version 4 is written on save or refresh, with versions 1–3 still readable. Hierarchical preferences retain cached results during refresh/cooldowns and re-rank them using effective settings; bookmarks remain available even if they no longer match the new filters.

Configuration, fetched metadata, and bookmarks are stored in `paper-news.json` under the application's user-data directory. Papers and repository code are not downloaded during feed refresh. Fetches use the application's existing system-proxy-aware network transport and require no API token. GitHub public search quotas and regional network restrictions can limit availability.

## Implementation

The implementation is independent TypeScript code integrated with NeoWorker's desktop IPC and design system. It uses official source APIs; no reference-project source code or third-party feed mirrors are embedded.

## Layout regression check

The feed owns its scrollport and positioned accessibility labels. Opening preferences scrolls that panel only. Long result lists must not increase the outer document height or move the sidebar; test both scrolling to the bottom and opening/closing preferences.

## Display modes

The Feed / Cards switch changes presentation without changing the filtered articles, bookmarks, or ordering. Feed is the default single-column layout; Cards retains the responsive grid. The choice persists locally, and switching preserves the first substantially visible article where possible. Feed uses left-side article images and right-side text on desktop, stacking images above text in narrow panels. Cards retain the grid with an article cover above the text and Read with AI, Translate, and Research buttons. Both modes fetch each visible article’s actual cover from RSS media/enclosures/content, article Open Graph/Twitter metadata, article structured data, or its own body. Maintained publisher/CDN host allowlists, media validation, bounded downloads, and a versioned cache apply to every publisher. GitHub uses custom social previews, then images scoped to the repository README (excluding status badges), with the generated GitHub preview as a final fallback. Older GitHub cover misses are invalidated when upgrading. There is no bundled category artwork fallback: genuinely missing or unavailable source media uses only the local source mark and localized source name, centered on the page surface without a placeholder box, repeated article title, or missing-image message. The left media column stays in place during loading and failure, so text never shifts across rows. Feed has Read with AI and a More menu for Translate and Research. Chinese-original articles omit Translate in the Chinese UI; English originals remain translatable even when their card title/summary is displayed in Chinese. Draft generation also rejects redundant Chinese-to-Chinese translation. Both modes retain articles without images. Sources and sorting use the shared NeoWorker select menu. Source logos appear in the options and selected trigger, with keyboard navigation and a visible selected state. The first 30 articles render immediately; Load more adds another 30.

Browser reading selections anchor the action toolbar to the last visible selected line, rather than the bounding box of a multi-paragraph range. Readiness re-arms the probe after navigation, and toolbar mouse presses preserve the selection until the chosen action runs.


### 资讯内容范围（2026-09-30）

资讯产品不展示政治类报道与评论。ChinaTalk 从内置来源、刷新入口、来源目录及配图来源中移除。其他来源共用中英文元数据过滤规则，覆盖标题、摘要、标签、链接及已知人物/政党/选举/地缘冲突等主题；规则不区分政治立场。正常技术术语（如分布式系统选主、强化学习 policy gradient）和中立经济数据不因单个歧义词被排除。

历史缓存与收藏在主进程加载时清理并落盘，渲染层再次过滤整份快照以保持数量与展示一致。后续提取摘要或生成译文若触发排除，移除整个条目并持久化其 ID，重启与刷新不会立即将它重新加入。被排除条目不能进入配图、摘要、翻译和资讯 AI 草稿入口。

工程边界：这是来源封禁与确定性文本规则，不是对所有正文和图像的语义审核，不能把测试通过描述成对任意未来内容的零漏检保证。新来源接入应同时检查内容范围并扩展规则与回归案例。代码需随新安装包发布；旧安装版不会自动获得这些约束。
