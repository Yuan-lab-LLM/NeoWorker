import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  Info,
  Star,
  TrendingUp,
  BookOpen,
  ExternalLink,
  FileText,
  FlaskConical,
  Languages,
  Newspaper,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  PAPER_NEWS_SOURCES,
  DEFAULT_PAPER_NEWS_CONFIG,
  type PaperNewsConfig,
  paperNewsPrompt,
  paperNewsNeedsRefresh,
  type PaperNewsAction,
  type PaperNewsItem,
  type PaperNewsSnapshot,
  type PaperNewsSource,
} from "../../shared/paper-news";
import { useLanguage } from "../i18n";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import arxivBrand from "../assets/paper-news/arxiv.svg";
import arxivWhiteBrand from "../assets/paper-news/arxiv-white.svg";
import huggingFaceBrand from "../assets/paper-news/huggingface.svg";
import githubBrand from "../assets/paper-news/github-black.svg";
import githubWhiteBrand from "../assets/paper-news/github-white.svg";
import "./paper-news.css";

const brandAssets = {
  arxiv: arxivBrand,
  huggingface: huggingFaceBrand,
  github: githubBrand,
};
const darkBrandAssets = { arxiv: arxivWhiteBrand, github: githubWhiteBrand };

const names = { arxiv: "arXiv", huggingface: "Hugging Face", github: "GitHub" };
function SourceBrand({ source }: { source: PaperNewsSource }) {
  return (
    <span className={`pn-brand pn-brand-${source}`} aria-hidden="true">
      <img className="pn-brand-light" src={brandAssets[source]} alt="" />
      {source !== "huggingface" && (
        <img className="pn-brand-dark" src={darkBrandAssets[source]} alt="" />
      )}
    </span>
  );
}

export function PaperNewsPanel({
  onUsePrompt,
}: {
  onUsePrompt: (prompt: string) => Promise<void> | void;
}) {
  const language = useLanguage();
  const t = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [snapshot, setSnapshot] = useState<PaperNewsSnapshot | null>(null);
  const [source, setSource] = useState<PaperNewsSource | "all" | "saved">(
    "all",
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [settings, setSettings] = useState(false);
  const [settingsSource, setSettingsSource] =
    useState<PaperNewsSource>("arxiv");
  const [draftConfig, setDraftConfig] = useState<PaperNewsConfig>(() =>
    structuredClone(DEFAULT_PAPER_NEWS_CONFIG),
  );
  const [topicInputs, setTopicInputs] = useState<
    Record<PaperNewsSource, string>
  >({
    arxiv: "",
    github: "",
    huggingface: "",
  });
  const [savedSource, setSavedSource] = useState<PaperNewsSource | null>(null);
  function openSettings(target: PaperNewsSource) {
    if (!settings) {
      const config = snapshot?.config || DEFAULT_PAPER_NEWS_CONFIG;
      setDraftConfig(structuredClone(config));
      setTopicInputs({
        arxiv: config.arxiv.topics.join(", "),
        github: config.github.topics.join(", "),
        huggingface: config.huggingface.topics.join(", "),
      });
    }
    setSavedSource(null);
    setSettingsSource(target);
    setSettings(true);
  }
  const currentDraft = draftConfig[settingsSource];
  function updateDraft(patch: Partial<PaperNewsConfig[PaperNewsSource]>) {
    setSavedSource(null);
    setDraftConfig((config) => ({
      ...config,
      [settingsSource]: { ...config[settingsSource], ...patch },
    }));
  }
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const coolingDown = Boolean(
    snapshot &&
    PAPER_NEWS_SOURCES.every(
      (s) =>
        snapshot.sources[s].nextRetryAt &&
        Date.parse(snapshot.sources[s].nextRetryAt!) > clock,
    ),
  );
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<"load" | "save" | "open" | null>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    const load = async () => {
      try {
        const state = await window.electronAPI.getPaperNews();
        if (disposed) return;
        setSnapshot(state);
        if (paperNewsNeedsRefresh(state, Date.now())) {
          busyRef.current = true;
          setBusy(true);
          const next = await window.electronAPI.refreshPaperNews();
          if (!disposed) setSnapshot(next);
        }
      } catch {
        if (!disposed) setFailure("load");
      } finally {
        if (!disposed) {
          setBusy(false);
          busyRef.current = false;
        }
      }
    };
    void load();
    return () => {
      disposed = true;
      mounted.current = false;
    };
  }, []);

  async function refresh() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const state = await window.electronAPI.refreshPaperNews();
      if (mounted.current) setSnapshot(state);
    } catch {
      if (mounted.current) setFailure("load");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !snapshot ||
      busy ||
      busyRef.current ||
      settings ||
      failure ||
      document.hidden
    )
      return;
    const retryDue = PAPER_NEWS_SOURCES.some((s) => {
      const state = snapshot.sources[s];
      return (
        (!state.updatedAt || state.error) &&
        !["accessDenied", "invalidResponse"].includes(state.error || "") &&
        (!state.nextRetryAt || Date.parse(state.nextRetryAt) <= clock)
      );
    });
    if (retryDue) void refresh();
  }, [snapshot, busy, clock, settings, failure]);

  async function saveConfig(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (!snapshot) return;
      const config = {
        ...snapshot.config,
        [settingsSource]: {
          ...currentDraft,
          topics: topicInputs[settingsSource]
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
      const state = await window.electronAPI.savePaperNewsConfig(config);
      if (!mounted.current) return;
      setSnapshot(state);
      setDraftConfig((draft) => ({
        ...draft,
        [settingsSource]: state.config[settingsSource],
      }));
      setTopicInputs((draft) => ({
        ...draft,
        [settingsSource]: state.config[settingsSource].topics.join(", "),
      }));
      setSavedSource(settingsSource);
      const refreshed =
        await window.electronAPI.refreshPaperNews(settingsSource);
      if (mounted.current) setSnapshot(refreshed);
    } catch {
      if (mounted.current) setFailure("save");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function bookmark(item: PaperNewsItem) {
    try {
      const state = await window.electronAPI.setPaperNewsSaved(
        item.id,
        !snapshot?.saved.some((i) => i.id === item.id),
      );
      if (mounted.current) setSnapshot(state);
    } catch {
      if (mounted.current) setFailure("save");
    }
  }
  async function open(url: string) {
    try {
      await window.electronAPI.openExternal(url);
    } catch {
      setFailure("open");
    }
  }
  async function start(item: PaperNewsItem, action: PaperNewsAction) {
    if (opening) return;
    setOpening(true);
    try {
      await onUsePrompt(paperNewsPrompt(item, action, language));
    } catch {
      if (mounted.current) setFailure("open");
    } finally {
      if (mounted.current) setOpening(false);
    }
  }
  const items = useMemo(() => {
    const pool = source === "saved" ? snapshot?.saved : snapshot?.items;
    return (pool || [])
      .filter(
        (i) =>
          (source === "all" || source === "saved" || i.source === source) &&
          `${i.title} ${i.summary} ${i.tags.join(" ")}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.date.localeCompare(a.date)
          : b.score - a.score || b.date.localeCompare(a.date),
      );
  }, [snapshot, source, query, sort]);
  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString(language, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const sourceDescription = (s: PaperNewsSource) =>
    s === "arxiv"
      ? t("按关注词检索近期论文", "Recent papers matching your topics")
      : s === "huggingface"
        ? t("社区每日精选论文", "Community daily paper selection")
        : t("近期更新的开源项目", "Recently active open-source projects");

  return (
    <main className="paper-news-panel" aria-label={t("资讯动态", "News Feed")}>
      <NeoWorkerPageHeader
        title={t("资讯动态", "News Feed")}
        description={t(
          "汇集你关注的内容，发现新进展，继续阅读与探索。",
          "Follow your interests, discover what’s new, and explore further.",
        )}
        icon={<Newspaper />}
        actions={
          <>
            <button
              className="pn-button"
              disabled={busy || !snapshot}
              aria-expanded={settings}
              onClick={() => {
                if (settings) setSettings(false);
                else
                  openSettings(
                    source === "all" || source === "saved" ? "arxiv" : source,
                  );
              }}
            >
              <SlidersHorizontal size={16} />
              {t("来源设置", "Source settings")}
            </button>
            <button
              className="pn-button pn-primary"
              disabled={busy || coolingDown}
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} className={busy ? "pn-spinning" : ""} />
              {busy
                ? t("获取中…", "Fetching…")
                : coolingDown
                  ? t("等待刷新", "Wait to refresh")
                  : t("获取最新", "Refresh")}
            </button>
          </>
        }
      />
      <div className="pn-content">
        {failure && (
          <div className="pn-notice" role="alert">
            {failure === "load"
              ? t(
                  "暂时无法获取动态，请稍后重试。已有内容会保留。",
                  "Could not load news. Please retry later; existing content is kept.",
                )
              : failure === "save"
                ? t(
                    "保存失败，请检查关注词或稍后重试。最多收藏 200 条。",
                    "Could not save. Check your topics or retry later. Up to 200 bookmarks are supported.",
                  )
                : t("无法打开，请重试。", "Could not open. Please retry.")}
            <button
              className="pn-icon"
              aria-label={t("关闭提示", "Dismiss")}
              onClick={() => setFailure(null)}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {settings && (
          <form className="pn-settings" onSubmit={saveConfig}>
            <div
              className="pn-settings-tabs"
              role="group"
              aria-label={t("选择设置来源", "Choose source settings")}
            >
              {PAPER_NEWS_SOURCES.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  aria-pressed={settingsSource === s}
                  onClick={() => {
                    setSettingsSource(s);
                    setSavedSource(null);
                  }}
                >
                  <SourceBrand source={s} />
                  <span
                    className={s === "arxiv" ? "pn-visually-hidden" : undefined}
                  >
                    {names[s]}
                  </span>
                </button>
              ))}
              <button
                className="pn-icon pn-settings-close"
                type="button"
                aria-label={t("关闭设置", "Close settings")}
                onClick={() => setSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <fieldset className="pn-settings-fields" disabled={busy}>
              <legend>
                {names[settingsSource]} ·{" "}
                {t("独立设置", "Independent settings")}
              </legend>
              <p>
                {settingsSource === "huggingface"
                  ? t(
                      "从每日精选中按兴趣词排序；开启下方筛选后，只显示匹配的内容。这里不进行全文检索。",
                      "Interests rank the daily selection. Enable the filter below to show only matches; this is not a full-text search.",
                    )
                  : t(
                      "这些条件只用于当前来源，不影响其他来源的设置。",
                      "These conditions apply only to this source.",
                    )}
              </p>
              <label htmlFor="pn-topics">
                {settingsSource === "huggingface"
                  ? t("兴趣词", "Interests")
                  : t("检索关键词", "Search keywords")}
              </label>
              <input
                id="pn-topics"
                required
                maxLength={304}
                value={topicInputs[settingsSource]}
                onChange={(e) => {
                  setSavedSource(null);
                  setTopicInputs({
                    ...topicInputs,
                    [settingsSource]: e.target.value,
                  });
                }}
                placeholder="large language models, agents, multimodal"
              />
              <p>
                {t(
                  "建议使用英文，逗号分隔，最多 5 个，每个不超过 60 字符。",
                  "English works best. Up to 5 comma-separated terms, 60 characters each.",
                )}
              </p>
              <div className="pn-settings-options">
                <label htmlFor="pn-days">
                  {settingsSource === "arxiv"
                    ? t("发表时间", "Publication window")
                    : settingsSource === "github"
                      ? t("代码更新时间", "Code update window")
                      : t("精选时间", "Selection window")}
                  <select
                    id="pn-days"
                    value={currentDraft.days}
                    onChange={(e) =>
                      updateDraft({ days: Number(e.target.value) })
                    }
                  >
                    {[7, 14, 30].map((d) => (
                      <option key={d} value={d}>
                        {language === "zh-CN" ? `近 ${d} 天` : `Last ${d} days`}
                      </option>
                    ))}
                  </select>
                </label>
                {settingsSource === "arxiv" && (
                  <label htmlFor="pn-category">
                    {t("学科分类（选填）", "Subject category (optional)")}
                    <input
                      id="pn-category"
                      maxLength={32}
                      pattern={"[a-z]+(-[a-z]+)*(\\.[A-Z]{2})?"}
                      placeholder="cs.AI"
                      value={draftConfig.arxiv.category}
                      onChange={(e) =>
                        updateDraft({ category: e.target.value })
                      }
                    />
                  </label>
                )}
                {settingsSource === "github" && (
                  <>
                    <label htmlFor="pn-language">
                      {t("编程语言（选填）", "Programming language (optional)")}
                      <input
                        id="pn-language"
                        maxLength={32}
                        placeholder="Python"
                        value={draftConfig.github.language}
                        onChange={(e) =>
                          updateDraft({ language: e.target.value })
                        }
                      />
                    </label>
                    <label htmlFor="pn-stars">
                      {t("最低 Star 数", "Minimum stars")}
                      <input
                        id="pn-stars"
                        type="number"
                        min={0}
                        max={10000000}
                        step={1}
                        required
                        value={
                          Number.isFinite(draftConfig.github.minStars)
                            ? draftConfig.github.minStars
                            : ""
                        }
                        onChange={(e) =>
                          updateDraft({ minStars: e.target.valueAsNumber })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
              {settingsSource === "huggingface" && (
                <label className="pn-setting-check">
                  <input
                    type="checkbox"
                    checked={draftConfig.huggingface.matchedOnly}
                    onChange={(e) =>
                      updateDraft({ matchedOnly: e.target.checked })
                    }
                  />
                  {t(
                    "只显示匹配兴趣词的精选论文",
                    "Only show selected papers matching my interests",
                  )}
                </label>
              )}
              <div className="pn-settings-footer">
                <span role="status">
                  {savedSource === settingsSource
                    ? t(
                        `${names[settingsSource]} 设置已保存`,
                        `${names[settingsSource]} settings saved`,
                      )
                    : t(
                        "每个来源单独保存，已有收藏会保留。",
                        "Save each source separately. Bookmarks are retained.",
                      )}
                </span>
                <button
                  className="pn-button pn-primary"
                  disabled={busy || !topicInputs[settingsSource].trim()}
                >
                  {t(
                    `保存并刷新 ${names[settingsSource]}`,
                    `Save and refresh ${names[settingsSource]}`,
                  )}
                </button>
              </div>
            </fieldset>
          </form>
        )}
        <div className="pn-sources">
          {PAPER_NEWS_SOURCES.map((s) => {
            const state = snapshot?.sources[s];
            return (
              <div className="pn-source-wrap" key={s}>
                <button
                  className={`pn-source pn-source-${s} ${source === s ? "is-active" : ""}`}
                  aria-pressed={source === s}
                  onClick={() => setSource(source === s ? "all" : s)}
                >
                  <span className="pn-source-heading">
                    <span className="pn-source-identity">
                      <SourceBrand source={s} />
                      <strong
                        className={
                          s === "arxiv" ? "pn-visually-hidden" : undefined
                        }
                      >
                        {names[s]}
                      </strong>
                    </span>
                    <span className="pn-count">
                      {state?.error && !state.updatedAt
                        ? "—"
                        : snapshot?.items.filter((i) => i.source === s)
                            .length || 0}
                    </span>
                  </span>
                  <span className="pn-source-description">
                    {sourceDescription(s)}
                  </span>
                  {state?.error && !busy && (
                    <small className="pn-source-error">
                      {state.error === "rateLimit"
                        ? t(
                            "请求受限，请稍后刷新",
                            "Request limited; retry later",
                          )
                        : state.error === "accessDenied"
                          ? t(
                              "来源拒绝访问，请稍后重试",
                              "Source denied access; try again later",
                            )
                          : state.error === "unavailable"
                            ? t(
                                "来源服务暂时不可用，将稍后重试",
                                "Source temporarily unavailable; retry scheduled",
                              )
                            : state.error === "invalidResponse"
                              ? t(
                                  "来源返回的数据异常，请稍后重试",
                                  "Unexpected source response; retry later",
                                )
                              : t(
                                  "暂时无法连接，请检查网络或代理",
                                  "Connection unavailable; check your network or proxy",
                                )}
                    </small>
                  )}
                  <small className="pn-source-status">
                    {state?.updatedAt && !state.error && !busy ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : (
                      <Clock3 size={12} aria-hidden="true" />
                    )}
                    {busy
                      ? t("正在获取…", "Fetching…")
                      : state?.updatedAt
                        ? `${state.error ? t("上次成功获取：", "Last successful fetch: ") : t("获取于 ", "Fetched ")}${new Date(state.updatedAt).toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                        : state?.error
                          ? t("尚无缓存内容", "No cached results yet")
                          : t("等待获取", "Not fetched yet")}
                  </small>
                  {state?.nextRetryAt &&
                    Date.parse(state.nextRetryAt) > clock && (
                      <small>
                        {t(
                          `可在 ${Math.ceil((Date.parse(state.nextRetryAt) - clock) / 60_000)} 分钟后刷新`,
                          `Refresh available in ${Math.ceil((Date.parse(state.nextRetryAt) - clock) / 60_000)} min`,
                        )}
                      </small>
                    )}
                </button>
                <button
                  className="pn-icon pn-source-settings"
                  disabled={busy || !snapshot}
                  title={t(`设置 ${names[s]}`, `Configure ${names[s]}`)}
                  aria-label={t(`设置 ${names[s]}`, `Configure ${names[s]}`)}
                  onClick={() => openSettings(s)}
                >
                  <SlidersHorizontal size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="pn-toolbar">
          <div className="pn-tabs">
            <button
              aria-pressed={source !== "saved"}
              className={source !== "saved" ? "is-active" : ""}
              onClick={() => setSource("all")}
            >
              <Compass size={15} aria-hidden="true" />
              {t("发现", "Discover")}
            </button>
            <button
              aria-pressed={source === "saved"}
              className={source === "saved" ? "is-active" : ""}
              onClick={() => setSource("saved")}
            >
              <Bookmark size={14} />
              {t("收藏", "Saved")} <span>{snapshot?.saved.length || 0}</span>
            </button>
          </div>
          <label className="pn-search">
            <Search size={16} />
            <input
              aria-label={t("搜索已获取的内容", "Search fetched results")}
              placeholder={t(
                "搜索标题、摘要或标签",
                "Search titles, abstracts or tags",
              )}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={t("排序方式", "Sort order")}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recommended">{t("推荐排序", "Recommended")}</option>
            <option value="newest">{t("时间排序", "Most recent")}</option>
          </select>
        </div>
        <div className="pn-context">
          <span aria-live="polite">
            {items.length} {t("条内容", "results")}
            {source !== "all" && source !== "saved"
              ? ` · ${names[source]}`
              : ""}
          </span>
          <div className="pn-following">
            <span>{t("关注", "Following")}</span>
            {(snapshot
              ? [
                  ...new Set(
                    (source === "all" || source === "saved"
                      ? PAPER_NEWS_SOURCES
                      : [source]
                    ).flatMap((s) => snapshot.config[s].topics),
                  ),
                ]
              : []
            ).map((topic) => (
              <span className="pn-topic" key={topic}>
                {topic}
              </span>
            ))}
          </div>
        </div>
        <details className="pn-explainer">
          <summary>
            <Info size={13} aria-hidden="true" />
            {t("推荐依据与来源说明", "About ranking and sources")}
          </summary>
          <p>
            {t(
              "推荐 = 关注词匹配（70%）+ 时间（30%），不代表学术质量。arXiv 按发表时间、Hugging Face 按精选时间、GitHub 按代码更新时间筛选；精选与项目结果不保证逐项匹配关注词。",
              "Ranking uses topic matches (70%) and recency (30%), not scientific quality. Dates represent arXiv publication, Hugging Face selection, and GitHub code updates. Daily selections and repository results may not match every topic.",
            )}
          </p>
        </details>
        {!items.length ? (
          <div className="pn-empty">
            <BookOpen size={28} />
            <h2>
              {busy
                ? t("正在寻找值得读的内容", "Finding your next read")
                : source === "saved"
                  ? t(
                      "把想深入读的内容留在这里",
                      "Keep your next deep read here",
                    )
                  : t("还没有匹配的内容", "No matching results yet")}
            </h2>
            <p>
              {busy
                ? t(
                    "首次获取可能需要一些时间，你可以切换页面，稍后回来。",
                    "The first fetch may take a moment. You can leave this page and return later.",
                  )
                : source === "saved"
                  ? t(
                      "点击卡片上的收藏按钮，刷新后仍会保留。",
                      "Bookmark a card to keep it across refreshes.",
                    )
                  : t(
                      "调整关注词或搜索条件，也可以点击“获取最新”重试。",
                      "Adjust your topics or search, or refresh to try again.",
                    )}
            </p>
          </div>
        ) : (
          <div className="pn-grid">
            {items.map((item) => {
              const saved = snapshot?.saved.some((i) => i.id === item.id);
              return (
                <article
                  className={`pn-card pn-source-${item.source}`}
                  key={item.id}
                >
                  <div className="pn-card-meta">
                    <span className="pn-source-badge">
                      <SourceBrand source={item.source} />
                      <span
                        className={
                          item.source === "arxiv"
                            ? "pn-visually-hidden"
                            : undefined
                        }
                      >
                        {names[item.source]}
                      </span>
                    </span>
                    <span className="pn-date">
                      <CalendarDays size={12} aria-hidden="true" />
                      {formatDate(item.date)}
                    </span>
                    <button
                      className={`pn-icon ${saved ? "is-saved" : ""}`}
                      aria-label={
                        saved
                          ? t("取消收藏", "Remove bookmark")
                          : t("收藏", "Bookmark")
                      }
                      aria-pressed={Boolean(saved)}
                      onClick={() => void bookmark(item)}
                    >
                      <Bookmark
                        size={17}
                        fill={saved ? "currentColor" : "none"}
                      />
                    </button>
                  </div>
                  <h2>
                    <button
                      title={item.title}
                      onClick={() => void open(item.url)}
                    >
                      {item.title}
                    </button>
                  </h2>
                  <p className="pn-authors" title={item.authors.join(", ")}>
                    {item.authors.slice(0, 4).join(", ")}
                    {item.authors.length > 4 ? " …" : ""}
                  </p>
                  <p className="pn-summary">
                    {item.summary ||
                      t(
                        "打开来源查看项目说明。",
                        "Open the source for details.",
                      )}
                  </p>
                  <details className="pn-abstract">
                    <summary>{t("摘要与详情", "Abstract and details")}</summary>
                    <p>
                      {item.summary ||
                        t(
                          "来源没有提供摘要。",
                          "No abstract provided by the source.",
                        )}
                    </p>
                  </details>
                  <div className="pn-tags">
                    {item.matchedTopics.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {item.popularity !== undefined && (
                      <small>
                        <Star size={12} aria-hidden="true" />
                        {item.popularity.toLocaleString(language)}{" "}
                        {item.source === "github"
                          ? t("星标", "stars")
                          : t("点赞", "upvotes")}
                      </small>
                    )}
                  </div>
                  <div className="pn-links">
                    <button onClick={() => void open(item.url)}>
                      <ExternalLink size={13} />
                      {item.source === "github"
                        ? t("仓库", "Repository")
                        : t("原文", "Source")}
                    </button>
                    {item.pdfUrl && (
                      <button onClick={() => void open(item.pdfUrl!)}>
                        <FileText size={13} />
                        PDF
                      </button>
                    )}
                    <span
                      className="pn-match"
                      title={t(
                        "按关注词匹配与时间计算，不代表论文质量",
                        "Based on topic matches and recency, not paper quality",
                      )}
                    >
                      <TrendingUp size={13} aria-hidden="true" />
                      {t("匹配", "Match")} {item.score}
                    </span>
                  </div>
                  <div className="pn-card-actions">
                    <button
                      className="pn-action-read"
                      disabled={opening}
                      onClick={() => void start(item, "read")}
                    >
                      <BookOpen size={15} />
                      {t("阅读", "Read")}
                    </button>
                    <button
                      className="pn-action-translate"
                      disabled={opening}
                      onClick={() => void start(item, "translate")}
                    >
                      <Languages size={15} />
                      {t("翻译", "Translate")}
                    </button>
                    <button
                      className="pn-action-research"
                      disabled={opening}
                      onClick={() => void start(item, "research")}
                    >
                      <FlaskConical size={15} />
                      {t("研究", "Research")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <p className="pn-footer">
          {t(
            "阅读、翻译和研究会创建任务草稿，发送后使用你当前配置的模型执行。内容保留来源原文；同一论文可能出现在多个来源。",
            "Read, translate and research prepare a task draft. Send it to use your configured model. Source text stays in its original language; a paper may appear in multiple sources.",
          )}
        </p>
      </div>
    </main>
  );
}
