# NeoWorker 零配置资讯源实测 — 2026-09-25

测试 45 个候选来源，共 78 次请求（含详情页、补充入口和少量低频复测）。没有修改产品代码或启用新来源。

## 测试方法与适用范围

- 在本机以独立空白 Electron 用户目录运行 NeoWorker 已编译的 `fetchWithSystemProxy`；不读取已安装应用的会话、账号或 Cookie，所有请求显式 `credentials: omit`。
- 没有使用 API key、Token、登录账号或手动配置代理；本机系统路由解析结果全部为 SYSTEM_PROXY。因此这是当前网络下的匿名测试，不能证明国内无代理网络也能访问所有海外来源。
- 并发上限 4、22 秒超时；一般响应上限 2 MiB。SemiAnalysis 新 RSS 超过该上限，第一次解析未完成；将该次补测上限提高到 16 MiB 后，完整收到 3,431,543 字节并解析 20 条。这是测试器限制，不能误报为网站故障。
- 检查实际响应内容和结构，不将 HTTP 200、导航页、登录页或空响应算作数据成功。网页通过表示样本可读，尚需开发和验证专用解析器；未执行付费/登录/验证码绕过。
- 只进行短时间抽样；未验证连续多日稳定性、所有付费文章、PDF 下载或大规模请求额度。零用户配置不等于任何内容均免费或任何网络均可达。

## 结果

- A：结构化入口通过：15 个。
- B：网页列表及正文抽查通过：13 个。
- C：只验证部分公开信息：4 个。
- D：本次未通过：13 个。

A/B 适合进入接入开发候选；C 尚不具备完整读取链路；D 暂不默认启用。A 中部分订阅来源仅保证公开标题、摘要或公开内容，不保证全文。

### SemiAnalysis 的关键结果

- 当前应使用 https://newsletter.semianalysis.com/feed ，20 条记录，最新条目日期为 2026-09-23。抽查文章公开正文可读，并明确提示部分附加内容需要付费。
- https://semianalysis.com/feed/ 虽为 200，但最新条目仍是 2025-09-16；不能用来展示最新动态。
- 官方订阅范围说明：https://semianalysis.com/faq/ 。应用只能展示匿名获得的公开内容，不能把订阅文章标成已获取全文。

## 学术研究

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| Semantic Scholar | D | [测试入口](https://api.semanticscholar.org/graph/v1/paper/search?query=agents&limit=3&fields=title,abstract,url,year) — 429 | 429，匿名额度受限；未连续重试，不能作为可靠的默认入口。 |
| Hugging Face Papers | A | [测试入口](https://huggingface.co/api/daily_papers?limit=3) — 200 | 3 条论文 JSON，含摘要；低频复测通过。 |
| arXiv | A | [测试入口](https://export.arxiv.org/api/query?search_query=all:agent&start=0&max_results=3&sortBy=submittedDate&sortOrder=descending) — 200 | 3 条 Atom 记录，含摘要和论文链接；低频复测仍为 200。未在本次测试下载 PDF。 |
| bioRxiv | D | [测试入口](https://api.biorxiv.org/details/biorxiv/2026-09-18/2026-09-25/0) — 200 | 两个详情查询均为 HTTP 200 但响应体为空；不能算数据获取成功，原因未确定。 |
| OpenAlex | A | [测试入口](https://api.openalex.org/works?search=agents&per-page=3) — 200 | 匿名 works 搜索返回 3 条记录；不能由单次通过推断长期额度。 |
| SSRN | D | [测试入口](https://www.ssrn.com/) — 403 | 403，返回自动化访问被阻止说明。 |
| OpenReview | D | [测试入口](https://api2.openreview.net/notes?content.venueid=ICLR.cc%2F2026%2FConference&limit=3) — 403 | 403，明确要求 challenge 验证；本次不通过。 |

## 开源与开发

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| Hugging Face Models | A | [测试入口](https://huggingface.co/api/models?limit=3&sort=downloads&direction=-1) — 200 | 模型列表 JSON 返回 3 条。 |
| GitHub | A | [测试入口](https://api.github.com/search/repositories?q=topic:ai+pushed:>2026-09-18&sort=updated&per_page=3) — 200 | 匿名仓库搜索返回 3 条，复测通过；生产中需缓存并遵守匿名额度。 |
| Hacker News | A | [测试入口](https://hacker-news.firebaseio.com/v0/topstories.json) — 200 | 获取 500 个故事 ID，并读取其中一个故事的标题、链接、时间和评分。 |
| InfoQ China | D | [测试入口](https://www.infoq.cn/) — 403 | 首页 403；没有将搜索引擎可访问算作应用可访问。 |
| Cloudflare Blog | A | [测试入口](https://blog.cloudflare.com/rss/) — 200 | 20 条 RSS 记录含内容；抽查文章页返回可读正文。 |
| Uber Engineering | D | [测试入口](https://www.uber.com/blog/engineering/) — 406 | 406 Not Acceptable。 |
| 博客园 | A | [测试入口](https://www.cnblogs.com/rss) — 200 | 20 条 Atom 记录，可读标题、链接、时间及摘要。 |

## 科技与产业

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| SemiAnalysis | A | [测试入口](https://newsletter.semianalysis.com/feed) — 200 | 新 newsletter RSS 返回 20 条，最新条目 2026-09-23；抽查正文可读且明确有付费附加内容。旧 /feed/ 只到 2025-09-16，不能用于当前资讯。 |
| The Next Platform | A | [测试入口](https://www.nextplatform.com/feed/) — 200 | 83 条 Atom 记录；抽查文章页可读。 |
| Semiconductor Engineering | A | [测试入口](https://semiengineering.com/feed/) — 200 | 10 条 RSS 记录；抽查文章页可读。 |
| TrendForce China | B | [测试入口](https://www.trendforce.cn/) — 200 | 首页可发现文章；抽查新闻正文可读。付费研究报告不在本次范围。 |
| 机器之心 | C | [测试入口](https://www.jiqizhixin.com/) — 200 | 首页只发现少量 PRO 链接；未验证持续资讯列表或正文，不列为首批稳定源。 |
| 爱集微 | B | [测试入口](https://www.laoyaoba.com/) — 200 | 首页文章列表和一篇文章正文可读。 |
| ChinaTalk | A | [测试入口](https://www.chinatalk.media/feed) — 200 | 20 条 RSS 记录，抽查一篇公开正文可读；不保证付费文章全文。 |
| EE Times China | B | [测试入口](https://www.eet-china.com/) — 200 | 首页列表和一篇新闻正文可读。 |

## 财经

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| 金十 | D | [测试入口](https://www.jin10.com/) — 200 | 首页仅页面壳；官方 MCP 无 Token 调用为 401 Unauthorized。公开快讯的动态获取路径尚未验证。 |
| 财联社 | B | [测试入口](https://www.cls.cn/) — 200 | 电报页仅返回页面壳；首页能读新闻列表，抽查新闻正文可读。尚未验证实时电报接口。 |
| 华尔街见闻 | B | [测试入口](https://wallstreetcn.com/) — 200 | 首页可区分公开 /articles/ 与会员 /member/articles/；抽查公开正文可读，会员内容不计入。 |
| 巨潮资讯 | C | [测试入口](https://www.cninfo.com.cn/new/index) — 200 | 首页有公告标题、日期和详情链接；详情页为动态壳，本次未打通公告 PDF 获取。 |
| 第一财经 | B | [测试入口](https://www.yicai.com/) — 200 | 首页新闻列表及抽查正文可读，列表复测通过；不代表付费内容全部开放。 |
| SEC EDGAR | D | [测试入口](https://data.sec.gov/submissions/CIK0000320193.json) — 403 | 公开 submissions 接口本机返回 403 自动化访问限制；不等于该接口需要 API key。 |
| Tushare | D | [测试入口](https://api.tushare.pro) — 200 | HTTP 200 但业务错误要求 Token，不能算成功。 |
| Alpha Vantage | D | [测试入口](https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=IBM) — 200 | HTTP 200 但 JSON 明确提示 apikey 缺失。 |

## 政策与宏观

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| 中国人民银行 | B | [测试入口](https://www.pbc.gov.cn/) — 200 | 首页新闻链接及抽查货币政策会议正文可读。 |
| 国家发展改革委 | B | [测试入口](https://www.ndrc.gov.cn/) — 200 | 首页新闻列表及抽查发布正文可读。 |
| 工信部 | B | [测试入口](https://www.miit.gov.cn/) — 200 | 首页新闻列表及抽查发布正文可读。 |
| Federal Reserve | A | [测试入口](https://www.federalreserve.gov/feeds/press_monetary.xml) — 200 | 15 条货币政策 RSS，可取标题、日期、摘要和原文链接；本次未检查全部文章。 |
| 国家统计局 | B | [测试入口](https://www.stats.gov.cn/) — 200 | 首页发布链接可发现，抽查生产资料价格发布正文/数据表可读。 |
| IMF | D | [测试入口](https://www.imf.org/en/publications) — 403 | 出版物列表页 403。 |
| World Bank | C | [测试入口](https://www.worldbank.org/en/research) — 200 | 研究目录页可读取报告标题及链接；报告正文和 PDF 未验证。 |
| FRED | D | [测试入口](https://api.stlouisfed.org/fred/series/observations?series_id=GDP&file_type=json) — 400 | 400，错误明确为 api_key 未设置。 |
| 证监会 | B | [测试入口](https://www.csrc.gov.cn/) — 200 | 首页发布列表及抽查正文可读。 |

## 商业与管理

| 来源 | 分类 | 实测入口 / HTTP | 内容与限制 |
|---|---|---|---|
| Stratechery | A | [测试入口](https://stratechery.com/feed/) — 200 | 10 条 RSS，标题/摘要可用；抽查订阅文章显示会员提示，不承诺全文。 |
| Benedict Evans | A | [测试入口](https://www.ben-evans.com/benedictevans?format=rss) — 200 | 20 条 RSS，抽查文章正文可读。 |
| Harvard Business Review | C | [测试入口](https://hbr.org/) — 200 | 尝试 /feed 为 404；首页及一篇文章页为 200，有标题/公开简介，未证明全文可用。 |
| 虎嗅 | B | [测试入口](https://www.huxiu.com/) — 200 | 首页列表及抽查文章正文可读；不代表会员内容开放。 |
| McKinsey | D | [测试入口](https://www.mckinsey.com/featured-insights) — net::ERR_HTTP2_PROTOCOL_ERROR | 本机网络 ERR_HTTP2_PROTOCOL_ERROR；尚未验证可用入口。 |
| BCG | B | [测试入口](https://www.bcg.com/publications) — 200 | 出版物目录及抽查文章正文可读；未验证所有报告下载。 |

## 对零配置产品的建议

优先开发官方开放 API/RSS，以及本次通过的国内新闻和官方发布网页。用户打开即看到默认内容；来源地址、缓存、刷新间隔、解析器、失败退避和状态提示均由 NeoWorker 管理。关注词属于可选偏好，不应是获取信息的前置条件。

首批可覆盖：学术（现有 arXiv/Hugging Face + OpenAlex）、开发（GitHub/Hacker News/博客园/Cloudflare）、科技（SemiAnalysis/半导体工程/集邦/爱集微/电子工程专辑）、财经（第一财经/财联社公开新闻/华尔街见闻公开新闻）、政策（央行/统计局/发改委/工信部/证监会）、商业（Benedict Evans/虎嗅/BCG）。这些是经抽样的候选，不表示已经集成进应用。

金十官方 MCP（https://mcp.jin10.com/app/doc.html）、Tushare、Alpha Vantage、FRED 的受测接口需要凭据；在本地直连、用户不配置且 NeoWorker 未提供统一授权服务的前提下，不纳入默认方案。SEC、OpenReview 等访问失败来源应另行评估，不能把问题转嫁为要求用户配置账号。

## 证据

- 同目录 `news-source-access-2026-09-25.json`：所有请求的 URL、时间、HTTP 状态、响应结构及错误。
- 本地原始响应及复现脚本：`output/source-access-audit/2026-09-25/`（未纳入版本控制）。
- 复测结果：arXiv、Hugging Face Papers、GitHub、第一财经均在第二次低频请求中通过；这不是长期可用性保证。

## 补测：量子位与机器之心

同日以相同的空白 Electron 环境补测 4 个入口，不使用账号或密钥：

| 来源 | 入口与结果 | 结论 |
|---|---|---|
| 量子位 | `https://www.qbitai.com/feed` 为 200，解析到 10 条，最新日期为 2026-09-25；首页和抽查文章 `https://www.qbitai.com/2026/09/497075.html` 均为 200，正文可读 | 纳入“科技与产业 → AI 动态”的零配置接入候选；RSS 仅短摘要，正文需读取文章页 |
| 机器之心 | `https://www.jiqizhixin.com/articles` 为 200，但仅返回导航和登录等页面壳，没有文章列表 | 继续列为待适配，不能因 HTTP 200 判为通过；尚未验证动态加载后的匿名列表，不代表网站所有文章必须登录 |

这次补测新增 1 个候选来源：累计测试 46 个来源、82 次请求；通过的 A/B 候选由 28 增为 29（A 类由 15 增为 16）。原始 45 个来源的表格和 JSON 保留原批次统计。补测证据位于 `output/source-access-audit/2026-09-25/ai-media-results.json`。没有修改产品接入代码。
