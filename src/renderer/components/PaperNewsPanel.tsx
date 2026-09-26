import { useNewsCardTranslations } from "./useNewsCardTranslations";
import { isHfHubSource } from "../../shared/news-hub";
import { NewsPreferencesPanel, type NewsSettingsScope } from "./NewsPreferencesPanel";
import { newsSourceEnabled, newsDefaultSort } from "../../shared/news-preferences";
import { NEWS_PUBLISHERS, isNewsPublisher } from "../../shared/news-sources";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  Database,
  Box,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  ChevronRight,
  Code2,
  Cpu,
  GraduationCap,
  Landmark,
  LayoutGrid,
  Library,
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
import { NewsSourceBrand as SourceBrand } from "./NewsSourceBrand";
import {
  NEWS_FEED_CATEGORIES,
  newsCategoryForSource,
  newsSourcesForCategory,
  type NewsCategoryId,
} from "./news-feed-catalog";
import "./paper-news.css";

const categoryIcons = {
  research: GraduationCap,
  development: Code2,
  technology: Cpu,
  finance: ChartNoAxesCombined,
  policy: Landmark,
  business: BriefcaseBusiness,
};

const paperNames = {
  arxiv: "arXiv",
  huggingface: "Hugging Face Papers",
  "hf-models": "Hugging Face Models",
  "hf-datasets": "Hugging Face Datasets",
  github: "GitHub",
};
function NewsSourceDirectory({
  category,
  expanded,
  language,
  onClose,
  onSelect,
  onExplore,
}: {
  category: NewsCategoryId | "all";
  expanded: boolean;
  language: string;
  onClose: () => void;
  onSelect: (category: NewsCategoryId, source: PaperNewsSource) => void;
  onExplore?: () => void;
}) {
  const t = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [selected, setSelected] = useState<NewsCategoryId>(
    category === "all" ? "research" : category,
  );
  const entry = NEWS_FEED_CATEGORIES.find((item) => item.id === selected)!;
  const connected = entry.providers.filter((provider) => provider.adapter);
  const planned = entry.providers.filter((provider) => !provider.adapter);
  const Icon = categoryIcons[entry.id];
  return (
    <section
      className={`pn-directory ${expanded ? "is-expanded" : "is-compact"}`}
      aria-label={t("来源目录", "Source directory")}
    >
      {expanded && (
        <header className="pn-directory-heading">
          <div className="pn-directory-title">
            <span className="pn-directory-emblem">
              <Library size={19} aria-hidden="true" />
            </span>
            <div>
              <h2>{t("来源目录", "Source directory")}</h2>
              <p>
                {t(
                  "按领域浏览，找到你关心的信息来源。",
                  "Find the sources that matter to you, by topic.",
                )}
              </p>
            </div>
          </div>
          <button
            className="pn-icon"
            aria-label={t("关闭来源目录", "Close source directory")}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
      )}
      <div className="pn-directory-body">
        {expanded && (
          <nav
            className="pn-directory-nav"
            aria-label={t("来源目录分类", "Source directory categories")}
          >
            {NEWS_FEED_CATEGORIES.map((item) => {
              const TopicIcon = categoryIcons[item.id];
              return (
                <button
                  key={item.id}
                  aria-pressed={selected === item.id}
                  onClick={() => setSelected(item.id)}
                >
                  <TopicIcon size={17} strokeWidth={1.7} aria-hidden="true" />
                  <span>{t(item.name, item.nameEn)}</span>
                  <small>{item.providers.length}</small>
                </button>
              );
            })}
          </nav>
        )}
        <div className="pn-directory-detail">
          <div className="pn-directory-topic">
            <span className="pn-directory-emblem">
              <Icon size={21} strokeWidth={1.65} aria-hidden="true" />
            </span>
            <div>
              <h3>
                {expanded ? t(entry.name, entry.nameEn) : t("本领域来源", "Sources in this topic")}
              </h3>
              <p>{t(entry.description, entry.descriptionEn)}</p>
            </div>
          </div>
          {connected.length > 0 && (
            <section
              className="pn-directory-group"
              aria-label={t("已接入来源", "Connected sources")}
            >
              <h4>
                <CheckCircle2 size={13} aria-hidden="true" />
                {t("已接入", "Connected")}
                <span>{connected.length}</span>
              </h4>
              <ul className="pn-directory-list">
                {connected.map((provider) => (
                  <li key={provider.id}>
                    <button
                      className="pn-directory-source is-connected"
                      onClick={() => onSelect(entry.id, provider.adapter!)}
                    >
                      <SourceBrand source={provider.adapter!} />
                      <span>{t(provider.name, provider.nameEn || provider.name)}</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {planned.length > 0 && (
            <section
              className="pn-directory-group is-planned"
              aria-label={t("待接入来源", "Planned sources")}
            >
              <h4>
                <Clock3 size={13} aria-hidden="true" />
                {t("待接入", "Planned")}
                <span>{planned.length}</span>
              </h4>
              <ul className="pn-directory-list">
                {planned.map((provider) => (
                  <li className="pn-directory-source" key={provider.id}>
                    <SourceBrand source={provider.id} />
                    <span>{t(provider.name, provider.nameEn || provider.name)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="pn-directory-note">
            {connected.length > 0
              ? t(
                  "点击已接入的来源即可浏览，无需配置账号或密钥。",
                  "Browse connected sources directly. No account or API key needed.",
                )
              : t(
                  "这些来源尚未接入，暂时没有可浏览的内容。",
                  "These sources are not connected yet. No stories are available here.",
                )}
          </p>
        </div>
      </div>
      {onExplore && (
        <footer className="pn-directory-footer">
          <span>
            {t(
              "先看看研究与开源领域的新动态",
              "Explore the latest research and open-source projects",
            )}
          </span>
          <button className="pn-text-button" onClick={onExplore}>
            {t("浏览已有动态", "Explore available stories")}
            <ArrowRight size={14} />
          </button>
        </footer>
      )}
    </section>
  );
}

export function PaperNewsPanel({
  onUsePrompt,
}: {
  onUsePrompt: (prompt: string) => Promise<void> | void;
}) {
  const language = useLanguage();
  const t = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const names = Object.fromEntries(
    PAPER_NEWS_SOURCES.map((s) => [
      s,
      isNewsPublisher(s) ? t(NEWS_PUBLISHERS[s].name, NEWS_PUBLISHERS[s].nameEn) : paperNames[s],
    ]),
  ) as Record<PaperNewsSource, string>;
  const [snapshot, setSnapshot] = useState<PaperNewsSnapshot | null>(null);
  const [source, setSource] = useState<PaperNewsSource | "all">("all");
  const [category, setCategory] = useState<NewsCategoryId | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const activeCategory = NEWS_FEED_CATEGORIES.find((entry) => entry.id === category);
  const availableSources = newsSourcesForCategory(category);
  const activeSources = availableSources.filter(
    (s) => !snapshot || newsSourceEnabled(snapshot.config, s),
  );
  const categoryUnavailable = category !== "all" && availableSources.length === 0;
  function selectCategory(next: NewsCategoryId | "all") {
    setCategory(next);
    setSource("all");
    setCatalogOpen(false);
    setSortOverride(null);
  }
  const [query, setQuery] = useState("");
  const [sortOverride, setSortOverride] = useState<string | null>(null);
  const sort =
    sortOverride || (snapshot ? newsDefaultSort(snapshot.config, category) : "recommended");
  const [settings, setSettings] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const preferencesAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    const anchor = preferencesAnchor.current;
    if (settings && panel && anchor) {
      // scrollIntoView also scrolls ancestors, including the desktop shell.
      panel.scrollTo({
        top:
          panel.scrollTop + anchor.getBoundingClientRect().top - panel.getBoundingClientRect().top,
        behavior: "instant",
      });
    }
  }, [settings]);
  const [settingsScope, setSettingsScope] = useState<NewsSettingsScope>("general");
  const [settingsRevision, setSettingsRevision] = useState(0);
  function openSettings(target: NewsSettingsScope) {
    if (settings) return; // Keep unsaved edits until explicitly saved or dismissed.
    setSettingsScope(target);
    setSettingsRevision((value) => value + 1);
    setSettings(true);
  }
  const [busy, setBusy] = useState(false);
  const [busyStartedAt, setBusyStartedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(Date.now);
  const refreshSources = source === "all" ? activeSources : [source];
  const coolingDown = Boolean(
    snapshot &&
    refreshSources.length &&
    refreshSources.every(
      (s) =>
        snapshot.sources[s]?.nextRetryAt &&
        Date.parse(snapshot.sources[s]?.nextRetryAt || "") > clock,
    ),
  );
  const retryAt = coolingDown
    ? Math.min(...refreshSources.map((s) => Date.parse(snapshot!.sources[s]!.nextRetryAt!)))
    : 0;
  const remainingSeconds = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const duration = (seconds: number) =>
    seconds < 60
      ? `${seconds}${t("秒", "s")}`
      : `${Math.floor(seconds / 60)}${t("分", "m")} ${seconds % 60}${t("秒", "s")}`;
  useEffect(() => {
    const timer = window.setInterval(
      () => setClock(Date.now()),
      busy || coolingDown ? 1000 : 15_000,
    );
    return () => window.clearInterval(timer);
  }, [busy, coolingDown]);
  useEffect(() => {
    const now = Date.now();
    setBusyStartedAt(busy ? now : null);
    setClock(now);
  }, [busy]);
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
      const state = await window.electronAPI.refreshPaperNews(
        source === "all" ? activeSources : source,
      );
      if (mounted.current) setSnapshot(state);
    } catch {
      if (mounted.current) setFailure("load");
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!snapshot || busy || busyRef.current || settings || failure || document.hidden) return;
    const retryDue = activeSources.some((s) => {
      const state = snapshot.sources[s] || {};
      return (
        (!state.updatedAt || state.error) &&
        !["accessDenied", "invalidResponse"].includes(state.error || "") &&
        (!state.nextRetryAt || Date.parse(state.nextRetryAt) <= clock)
      );
    });
    if (retryDue) void refresh();
  }, [snapshot, busy, clock, settings, failure]);

  useEffect(() => {
    if (!busy) return;
    let disposed = false;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await window.electronAPI.getPaperNews();
        if (!disposed && mounted.current) setSnapshot(next);
      } catch {
        /* Keep the current cards while the refresh request reports its result. */
      } finally {
        pending = false;
      }
    }, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [busy]);

  async function saveConfig(config: PaperNewsConfig): Promise<PaperNewsConfig> {
    if (busyRef.current || !snapshot) throw new Error("Settings unavailable");
    busyRef.current = true;
    setBusy(true);
    try {
      const state = await window.electronAPI.savePaperNewsConfig(config);
      if (!mounted.current) return state.config;
      setSnapshot(state);
      setSortOverride(null);
      if (source !== "all" && !newsSourceEnabled(state.config, source)) setSource("all");
      const changed = PAPER_NEWS_SOURCES.filter(
        (s) =>
          newsSourceEnabled(state.config, s) &&
          (!newsSourceEnabled(snapshot.config, s) ||
            JSON.stringify(snapshot.config[s]) !== JSON.stringify(state.config[s])),
      );
      if (changed.length) {
        try {
          const refreshed = await window.electronAPI.refreshPaperNews(changed);
          if (mounted.current) setSnapshot(refreshed);
        } catch {
          if (mounted.current) setFailure("load"); // Saving succeeded even if the refresh failed.
        }
      }
      return state.config;
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
  const categoryItems = useMemo(() => {
    const pool = savedOnly ? snapshot?.saved : snapshot?.items;
    return (pool || [])
      .filter(
        (i) =>
          (savedOnly || !snapshot || newsSourceEnabled(snapshot.config, i.source)) &&
          (source === "all" || i.source === source) &&
          (category === "all" || newsCategoryForSource(i.source) === category),
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.date.localeCompare(a.date)
          : b.score - a.score || b.date.localeCompare(a.date),
      );
  }, [snapshot, source, sort, category, savedOnly]);
  const cardTranslations = useNewsCardTranslations(
    categoryItems,
    panelRef,
    query,
  );
  const items = categoryItems.filter((item) =>
    `${item.title} ${item.summary} ${item.tags.join(" ")} ${cardTranslations.searchText(item)}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const formatDate = (value: string) =>
    !value
      ? t("发布时间未提供", "Publication date unavailable")
      : new Date(value).toLocaleDateString(language, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  const sourceDescription = (s: PaperNewsSource) =>
    s === "arxiv"
      ? t("按关注词检索近期论文", "Recent papers matching your topics")
      : isHfHubSource(s)
        ? t(
            s === "hf-models" ? "公开模型与模型卡" : "公开数据集与数据说明",
            s === "hf-models"
              ? "Public models and model cards"
              : "Public datasets and dataset cards",
          )
        : s === "huggingface"
          ? t("社区每日精选论文", "Community daily paper selection")
          : s === "github"
            ? t("近期更新的开源项目", "Recently active open-source projects")
            : t("公开资讯与原文链接", "Public stories and source links");

  return (
    <main
      ref={panelRef}
      className={`paper-news-panel ${categoryUnavailable ? "pn-no-sources" : ""}`}
      aria-label={t("资讯动态", "News Feed")}
    >
      <NeoWorkerPageHeader
        title={t("资讯动态", "News Feed")}
        description={t(
          "从研究到产业，发现值得关注的新进展。",
          "From research to industry. Discover what matters next.",
        )}
        icon={<Newspaper />}
        actions={
          <>
            <button
              className="pn-button"
              disabled={busy || !snapshot || settings}
              aria-expanded={settings}
              onClick={() => openSettings("general")}
            >
              <SlidersHorizontal size={16} />
              {t("偏好设置", "Preferences")}
            </button>
            <button
              className={`pn-button pn-primary pn-refresh ${busy || coolingDown ? "is-waiting" : ""}`}
              disabled={busy || coolingDown || categoryUnavailable || !activeSources.length}
              aria-busy={busy}
              title={
                coolingDown && !busy
                  ? t(
                      "来源请求间隔尚未结束，倒计时结束后可再次刷新。",
                      "Source cooldown is active. Refresh will be available when the countdown ends.",
                    )
                  : undefined
              }
              onClick={() => void refresh()}
            >
              {coolingDown && !busy ? (
                <Clock3 size={16} className="pn-wait-pulse" aria-hidden="true" />
              ) : (
                <RefreshCw size={16} className={busy ? "pn-spinning" : ""} aria-hidden="true" />
              )}
              {busy
                ? t("获取中…", "Fetching…")
                : coolingDown
                  ? t(
                      `${duration(remainingSeconds)}后可刷新`,
                      `Refresh in ${duration(remainingSeconds)}`,
                    )
                  : t("获取最新", "Refresh")}
            </button>
          </>
        }
      />
      <div className="pn-content">
        {busy && (
          <div className="pn-fetch-activity">
            <div className="pn-fetch-status">
              <span role="status">
                <RefreshCw size={14} className="pn-spinning" aria-hidden="true" />
                {t("正在获取最新内容", "Fetching the latest content")}
              </span>
              <span className="pn-fetch-elapsed">
                {t("已等待 ", "Elapsed ")}
                {duration(Math.max(0, Math.floor((clock - (busyStartedAt ?? clock)) / 1000)))}
              </span>
            </div>
            <div className="pn-fetch-track" aria-hidden="true">
              <span />
            </div>
            <p>
              {t(
                "内容会陆续更新，你可以继续浏览已有内容。",
                "Results update as sources respond. You can keep browsing existing content.",
              )}
            </p>
          </div>
        )}
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
        {settings && snapshot && (
          <div ref={preferencesAnchor}>
            <NewsPreferencesPanel
              key={settingsRevision}
              config={snapshot.config}
              initialScope={settingsScope}
              names={names}
              busy={busy}
              onClose={() => setSettings(false)}
              onSave={saveConfig}
            />
          </div>
        )}
        <section className="pn-discovery" aria-label={t("浏览资讯分类", "Browse news categories")}>
          <div className="pn-section-label">
            <div className="pn-section-options">
              <span>{t("探索领域", "EXPLORE TOPICS")}</span>
              <button
                className={`pn-all-topics ${category === "all" ? "is-active" : ""}`}
                aria-pressed={category === "all"}
                onClick={() => selectCategory("all")}
              >
                <LayoutGrid size={12} />
                {t("全部动态", "All topics")}
              </button>
            </div>
            <button
              className="pn-text-button"
              aria-expanded={catalogOpen}
              onClick={() => setCatalogOpen(!catalogOpen)}
            >
              <Library size={14} />
              {t("来源目录", "Source directory")}{" "}
              <span>
                {NEWS_FEED_CATEGORIES.reduce((count, entry) => count + entry.providers.length, 0)}
              </span>
              <ChevronRight size={14} />
            </button>
          </div>
          <nav className="pn-categories" aria-label={t("资讯分类", "News categories")}>
            {NEWS_FEED_CATEGORIES.map((entry) => {
              const Icon = categoryIcons[entry.id];
              return (
                <button
                  key={entry.id}
                  className={`pn-category ${category === entry.id ? "is-active" : ""}`}
                  aria-pressed={category === entry.id}
                  onClick={() => selectCategory(entry.id)}
                >
                  <span className="pn-category-icon">
                    <Icon size={21} strokeWidth={1.65} />
                  </span>
                  <strong>{t(entry.name, entry.nameEn)}</strong>
                  <span>{t(entry.description, entry.descriptionEn)}</span>
                </button>
              );
            })}
          </nav>
        </section>
        <div className="pn-feed-heading">
          <div>
            <h2>
              {activeCategory
                ? t(activeCategory.name, activeCategory.nameEn)
                : t("发现新进展", "Your next discovery")}
            </h2>
          </div>
          <div className="pn-tabs">
            <button
              aria-pressed={cardTranslations.enabled}
              className={cardTranslations.enabled ? "is-active" : ""}
              title={t(
                "使用已配置的模型翻译可见卡片的标题与摘要，可能产生模型费用；译文会缓存。",
                "Translate visible titles and summaries using your configured model; model charges may apply. Translations are cached.",
              )}
              onClick={cardTranslations.toggle}
            >
              <Languages size={15} aria-hidden="true" />
              {cardTranslations.enabled
                ? t("显示原文", "Show originals")
                : t("中文显示", "Show in Chinese")}
            </button>
            {activeCategory && (
              <button
                disabled={busy || !snapshot || settings}
                onClick={() => openSettings(activeCategory.id)}
              >
                <SlidersHorizontal size={14} />
                {t("分类偏好", "Category preferences")}
              </button>
            )}
            <button
              aria-pressed={!savedOnly}
              className={!savedOnly ? "is-active" : ""}
              onClick={() => setSavedOnly(false)}
            >
              <Compass size={15} aria-hidden="true" />
              {t("发现", "Discover")}
            </button>
            <button
              aria-pressed={savedOnly}
              className={savedOnly ? "is-active" : ""}
              onClick={() => setSavedOnly(true)}
            >
              <Bookmark size={14} />
              {t("收藏", "Saved")} <span>{snapshot?.saved.length || 0}</span>
            </button>
          </div>
        </div>
        {(catalogOpen || categoryUnavailable) && (
          <NewsSourceDirectory
            key={`${category}-${catalogOpen}`}
            category={category}
            expanded={catalogOpen}
            language={language}
            onClose={() => setCatalogOpen(false)}
            onSelect={(nextCategory, nextSource) => {
              setSortOverride(null);
              setCategory(nextCategory);
              setSource(nextSource);
              setCatalogOpen(false);
              setSavedOnly(false);
              setQuery("");
            }}
            onExplore={
              categoryUnavailable
                ? () => {
                    selectCategory("all");
                    setSavedOnly(false);
                    setQuery("");
                  }
                : undefined
            }
          />
        )}
        <div className="pn-toolbar">
          {!!(savedOnly ? availableSources : activeSources).length && (
            <div
              className="pn-source-filters"
              role="group"
              aria-label={t("筛选来源", "Filter sources")}
            >
              <button
                className={source === "all" ? "is-active" : ""}
                aria-pressed={source === "all"}
                onClick={() => setSource("all")}
              >
                {t("全部来源", "All sources")}
              </button>
              {(savedOnly ? availableSources : activeSources).map((entry) => (
                <button
                  key={entry}
                  className={source === entry ? "is-active" : ""}
                  aria-pressed={source === entry}
                  onClick={() => setSource(entry)}
                >
                  <SourceBrand source={entry} />
                  <span className={entry === "arxiv" ? "pn-visually-hidden" : ""}>
                    {names[entry]}
                  </span>
                  <small>
                    {(savedOnly ? snapshot?.saved : snapshot?.items)?.filter(
                      (item) => item.source === entry,
                    ).length || 0}
                  </small>
                </button>
              ))}
              {source !== "all" && (
                <button
                  className="pn-filter-settings"
                  disabled={busy || !snapshot}
                  aria-label={t("来源高级设置", "Source settings")}
                  onClick={() => openSettings(source)}
                >
                  <SlidersHorizontal size={15} />
                </button>
              )}
            </div>
          )}

          <label className="pn-search">
            <Search size={16} />
            <input
              aria-label={t("搜索已获取的内容", "Search fetched results")}
              placeholder={t("搜索标题、摘要或标签", "Search titles, abstracts or tags")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label={t("排序方式", "Sort order")}
            value={sort}
            onChange={(e) => setSortOverride(e.target.value)}
          >
            <option value="recommended">{t("推荐排序", "Recommended")}</option>
            <option value="newest">{t("时间排序", "Most recent")}</option>
          </select>
        </div>
        {cardTranslations.enabled && (
          <p className="pn-translation-hint" role="status">
            <Languages size={14} aria-hidden="true" />
            {cardTranslations.modelUnavailable
              ? t(
                  "翻译暂不可用：请检查已有模型设置，再点击卡片上的重试。",
                  "Translation unavailable. Check your model settings, then retry a card.",
                )
              : t(
                  "使用已配置的模型，按需翻译可见卡片并缓存；可能产生模型费用。项目名称和来源链接保留原样。",
                  "Visible cards are translated with your configured model and cached; model charges may apply. Project names and source links are preserved.",
                )}
          </p>
        )}
        <div className="pn-context">
          <span aria-live="polite">
            {items.length} {t("条内容", "results")}
            {source !== "all" ? ` · ${names[source]}` : ""}
          </span>
          <div
            className="pn-following"
            hidden={
              categoryUnavailable ||
              !(source === "all" ? activeSources : [source]).some(
                (s) => snapshot?.config[s]?.topics.length,
              )
            }
          >
            <span>{t("关注", "Following")}</span>
            {(snapshot
              ? [
                  ...new Set(
                    (source === "all" ? activeSources : [source]).flatMap(
                      (s) => snapshot.config[s].topics,
                    ),
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
              "设置关注词后按匹配度与时间排序；未设置时按时间排序。日期未提供的内容仍会保留。资讯仅展示来源公开提供的内容。",
              "With interests, ranking combines relevance and recency; otherwise it uses recency. Items without a publication date remain available. News includes publicly provided content only.",
            )}
          </p>
        </details>
        {categoryUnavailable ? null : !items.length ? (
          <div className="pn-empty">
            <BookOpen size={28} />
            <h2>
              {busy
                ? t("正在寻找值得读的内容", "Finding your next read")
                : savedOnly
                  ? t("把想深入读的内容留在这里", "Keep your next deep read here")
                  : !activeSources.length
                    ? t("当前范围的来源已全部关闭", "All sources in this view are disabled")
                    : activeSources.some((s) => snapshot?.sources[s]?.error)
                      ? t("暂时未能获取内容", "Could not fetch stories yet")
                      : t("还没有匹配的内容", "No matching results yet")}
            </h2>
            <p>
              {busy
                ? t(
                    "首次获取可能需要一些时间，你可以切换页面，稍后回来。",
                    "The first fetch may take a moment. You can leave this page and return later.",
                  )
                : savedOnly
                  ? t(
                      "点击卡片上的收藏按钮，刷新后仍会保留。",
                      "Bookmark a card to keep it across refreshes.",
                    )
                  : !activeSources.length
                    ? t(
                        "打开分类偏好，重新启用需要的来源。",
                        "Open category preferences to enable sources.",
                      )
                    : t(
                        "可以切换来源或清空搜索；获取失败的原因和重试时间见下方来源状态。",
                        "Try another source or clear your search. Source status below shows fetch errors and retry times.",
                      )}
            </p>
          </div>
        ) : (
          <div className="pn-grid">
            {items.map((item) => {
              const saved = snapshot?.saved.some((i) => i.id === item.id);
              const translation = cardTranslations.entry(item);
              const translated =
                translation?.status === "done" ? translation.value : undefined;
              const displayTitle = translated?.title || item.title;
              const displaySummary = translated?.summary ?? item.summary;
              const hubDetails =
                isHfHubSource(item.source) &&
                Boolean(item.hubTask || item.license);
              const hasDetails = Boolean(item.summary.trim() || hubDetails);
              return (
                <article
                  className={`pn-card pn-source-${item.source}${!hasDetails ? " pn-card-compact" : ""}`}
                  key={item.id}
                  data-news-id={item.id}
                >
                  <div className="pn-card-meta">
                    <span className="pn-source-badge">
                      <SourceBrand source={item.source} />
                      <span className={item.source === "arxiv" ? "pn-visually-hidden" : undefined}>
                        {names[item.source]}
                      </span>
                    </span>
                    <span className="pn-date">
                      <CalendarDays size={12} aria-hidden="true" />
                      {isHfHubSource(item.source) && t("更新于 ", "Updated ")}
                      {formatDate(item.date)}
                    </span>
                    <button
                      className={`pn-icon ${saved ? "is-saved" : ""}`}
                      aria-label={saved ? t("取消收藏", "Remove bookmark") : t("收藏", "Bookmark")}
                      aria-pressed={Boolean(saved)}
                      onClick={() => void bookmark(item)}
                    >
                      <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <h2>
                    <button
                      title={displayTitle}
                      onClick={() => void open(item.url)}
                    >
                      {displayTitle}
                    </button>
                  </h2>
                  {!!item.authors.length && (
                    <p className="pn-authors" title={item.authors.join(", ")}>
                      {item.authors.slice(0, 4).join(", ")}
                      {item.authors.length > 4 ? " …" : ""}
                    </p>
                  )}
                  {translation && (
                    <div className="pn-card-translation">
                      {translation.status === "loading" ? (
                        <>
                          <RefreshCw size={12} className="pn-spinning" />
                          {t(
                            "正在翻译，暂显示原文…",
                            "Translating; showing original…",
                          )}
                        </>
                      ) : translation.status === "error" ? (
                        <>
                          <span>
                            {t(
                              "翻译未完成，已保留原文",
                              "Translation unavailable; original retained",
                            )}
                          </span>
                          <button onClick={() => cardTranslations.retry(item)}>
                            {t("重试", "Retry")}
                          </button>
                        </>
                      ) : (
                        <span>
                          {t("中文译文 · AI 翻译", "Chinese · AI translated")}
                        </span>
                      )}
                    </div>
                  )}
                  {displaySummary.trim() && (
                    <p className="pn-summary">{displaySummary}</p>
                  )}
                  {hasDetails ? (
                    <details className="pn-abstract">
                      <summary>
                        {item.summary.trim()
                          ? t("摘要与详情", "Abstract and details")
                          : t("任务与许可信息", "Task and license")}
                      </summary>
                      {displaySummary.trim() && <p>{displaySummary}</p>}
                      {hubDetails && (
                        <p>
                          {t("任务", "Task")}:{" "}
                          {item.hubTask || t("未提供", "Not provided")}
                          <br />
                          {t("许可证", "License")}:{" "}
                          {item.license ||
                            t("请查看来源说明", "Check the source card")}
                        </p>
                      )}
                    </details>
                  ) : (
                    <span className="pn-no-summary">
                      {t("来源未提供摘要", "No source summary")}
                    </span>
                  )}
                  <div className="pn-tags">
                    {isHfHubSource(item.source) && (
                      <span>
                        {item.source === "hf-models" ? (
                          <Box size={12} />
                        ) : (
                          <Database size={12} />
                        )}
                        {item.source === "hf-models"
                          ? t("模型", "Model")
                          : t("数据集", "Dataset")}
                      </span>
                    )}
                    {item.gated && (
                      <span>{t("需申请访问", "Gated access")}</span>
                    )}
                    {item.matchedTopics.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    {item.downloads !== undefined && (
                      <small
                        title={t(
                          "Hugging Face 近 30 天下载量",
                          "Hugging Face downloads in the last 30 days",
                        )}
                      >
                        <Download size={12} aria-hidden="true" />
                        {item.downloads.toLocaleString(language)}{" "}
                        {t("下载", "downloads")}
                      </small>
                    )}
                    {item.popularity !== undefined && (
                      <small>
                        <Star size={12} aria-hidden="true" />
                        {item.popularity.toLocaleString(language)}{" "}
                        {item.source === "github" ? t("星标", "stars") : t("点赞", "likes")}
                      </small>
                    )}
                  </div>
                  <div className="pn-links">
                    <button onClick={() => void open(item.url)}>
                      <ExternalLink size={13} />
                      {item.source === "github"
                        ? t("仓库", "Repository")
                        : item.source === "hf-models"
                          ? t("模型卡", "Model card")
                          : item.source === "hf-datasets"
                            ? t("数据集卡", "Dataset card")
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
                        "按关注词匹配与时间计算，不代表内容质量",
                        "Based on topic matches and recency, not content quality",
                      )}
                    >
                      <TrendingUp size={13} aria-hidden="true" />
                      {t("推荐", "Rank")} {item.score}
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
        {!!activeSources.length && (
          <details
            className="pn-source-health"
            open={
              !busy && !items.length && activeSources.some((s) => snapshot?.sources[s]?.error)
                ? true
                : undefined
            }
          >
            <summary>
              <Clock3 size={13} />
              {t("获取状态与来源设置", "Fetch status and source settings")}
            </summary>
            <div className="pn-sources">
              {activeSources.map((s) => {
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
                          <strong className={s === "arxiv" ? "pn-visually-hidden" : undefined}>
                            {names[s]}
                          </strong>
                        </span>
                        <span className="pn-count">
                          {state?.error && !state.updatedAt
                            ? "—"
                            : snapshot?.items.filter((i) => i.source === s).length || 0}
                        </span>
                      </span>
                      <span className="pn-source-description">{sourceDescription(s)}</span>
                      {state?.error && !busy && (
                        <small className="pn-source-error">
                          {state.error === "rateLimit"
                            ? t("请求受限，请稍后刷新", "Request limited; retry later")
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
                      {state?.nextRetryAt && Date.parse(state.nextRetryAt) > clock && (
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
          </details>
        )}
        <p className="pn-footer">
          {t(
            "阅读、翻译和研究会创建任务草稿，发送后使用你当前配置的模型执行。中文显示仅翻译卡片标题与摘要；同一内容可能出现在多个来源。",
            "Read, translate and research prepare a task draft. Send it to use your configured model. Chinese display translates card titles and summaries only; an article may appear in multiple sources.",
          )}
        </p>
      </div>
    </main>
  );
}
