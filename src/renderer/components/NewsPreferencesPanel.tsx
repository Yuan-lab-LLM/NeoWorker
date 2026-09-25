import { useState } from "react";
import { ChevronRight, RotateCcw, Settings2, X } from "lucide-react";
import {
  PAPER_NEWS_SOURCES,
  type PaperNewsConfig,
  type PaperNewsSource,
} from "../../shared/paper-news";
import {
  effectiveNewsSettings,
  getNewsPreferences,
  type NewsCategoryId,
  type NewsOverride,
  type NewsPreferences,
  type NewsSort,
} from "../../shared/news-preferences";
import {
  NEWS_FEED_CATEGORIES,
  newsCategoryForSource,
  newsSourcesForCategory,
} from "./news-feed-catalog";
import { useLanguage } from "../i18n";
export type NewsSettingsScope = "general" | NewsCategoryId | PaperNewsSource;
const days = [7, 14, 30, 90, 365];
export function NewsPreferencesPanel({
  config,
  initialScope,
  names,
  busy,
  onClose,
  onSave,
}: {
  config: PaperNewsConfig;
  initialScope: NewsSettingsScope;
  names: Record<PaperNewsSource, string>;
  busy: boolean;
  onClose: () => void;
  onSave: (config: PaperNewsConfig) => Promise<PaperNewsConfig>;
}) {
  const language = useLanguage(),
    t = (zh: string, en: string) => (language === "zh-CN" ? zh : en);
  const [draft, setDraft] = useState(() => structuredClone(config));
  const [preferences, setPreferences] = useState(() => getNewsPreferences(config));
  const [scope, setScope] = useState(initialScope);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(false);
  const isSource = PAPER_NEWS_SOURCES.includes(scope as PaperNewsSource);
  const source = scope as PaperNewsSource;
  const category =
    scope === "general"
      ? undefined
      : NEWS_FEED_CATEGORIES.find(
          (c) => c.id === (isSource ? newsCategoryForSource(source) : scope),
        )!;
  const categoryId = category?.id;
  const categoryName = category ? t(category.name, category.nameEn) : "";
  const heading =
    scope === "general"
      ? t("通用默认值", "General defaults")
      : isSource
        ? names[source]
        : categoryName;
  function update(mutator: (next: NewsPreferences) => void) {
    setPreferences((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setDirty(true);
    setSaved(false);
    setError(false);
  }
  function advanced(patch: Record<string, unknown>) {
    setDraft((current) => ({ ...current, [source]: { ...current[source], ...patch } }));
    setDirty(true);
    setSaved(false);
    setError(false);
  }
  function override(field: keyof NewsOverride, value: string[] | number | undefined) {
    update((next) => {
      const target = isSource ? (next.sources[source] ||= {}) : next.categories[categoryId!];
      if (value === undefined) delete target[field];
      else if (field === "days") target.days = value as number;
      else target.topics = value as string[];
    });
  }
  function close() {
    if (
      dirty &&
      !window.confirm(t("还有未保存的偏好，放弃这些修改？", "Discard unsaved preference changes?"))
    )
      return;
    onClose();
  }
  const current = isSource
    ? preferences.sources[source] || {}
    : categoryId
      ? preferences.categories[categoryId]
      : undefined;
  const effective = isSource
    ? effectiveNewsSettings(preferences, source)
    : {
        topics: categoryId ? preferences.categories[categoryId].topics || [] : [],
        days: categoryId
          ? (preferences.categories[categoryId].days ?? preferences.general.days)
          : preferences.general.days,
      };
  const labelDays = (d: number) => t(`近 ${d} 天`, `Last ${d} days`);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(false);
    try {
      const resolved = structuredClone({ ...draft, preferences });
      for (const s of PAPER_NEWS_SOURCES)
        Object.assign(resolved[s], effectiveNewsSettings(preferences, s));
      const result = await onSave(resolved);
      setDraft(structuredClone(result));
      setPreferences(getNewsPreferences(result));
      setDirty(false);
      setSaved(true);
      setRevision((v) => v + 1);
    } catch {
      setError(true);
    }
  }
  return (
    <form
      className="pn-preferences"
      onSubmit={save}
      aria-label={t("资讯偏好设置", "News preferences")}
    >
      <header className="pn-preferences-header">
        <div>
          <Settings2 size={18} />
          <strong>{t("偏好设置", "Preferences")}</strong>
          <span>{t("默认值、分类与来源", "Defaults, categories and sources")}</span>
        </div>
        <button
          type="button"
          className="pn-icon"
          aria-label={t("关闭偏好设置", "Close preferences")}
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="pn-preferences-body">
        <nav className="pn-preferences-nav" aria-label={t("设置范围", "Preference scope")}>
          <button
            type="button"
            aria-pressed={scope === "general"}
            onClick={() => setScope("general")}
          >
            {t("通用默认值", "General defaults")}
          </button>
          <small>{t("分类偏好", "Category preferences")}</small>
          {NEWS_FEED_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setScope(c.id)}
            >
              {t(c.name, c.nameEn)}
              <ChevronRight size={13} />
            </button>
          ))}
        </nav>
        <fieldset className="pn-preferences-fields" disabled={busy}>
          <legend>
            {heading}
            {isSource ? ` · ${t("来源高级设置", "Source settings")}` : ""}
          </legend>
          <p className="pn-pref-scope">
            {scope === "general"
              ? t(
                  "为继承默认值的分类提供时间范围和排序方式。关注词在各分类中单独管理。",
                  "Default time window and sorting for inheriting categories. Interests are managed per category.",
                )
              : isSource
                ? t(
                    `仅影响 ${names[source]}。未单独设置的项目继承「${categoryName}」。`,
                    `Only affects ${names[source]}. Unset fields inherit from ${categoryName}.`,
                  )
                : t(
                    `应用于「${categoryName}」下的来源；已有来源覆盖值会保留。`,
                    `Applies to ${categoryName} sources; existing source overrides are retained.`,
                  )}
          </p>
          {isSource && (
            <button
              className="pn-text-button"
              type="button"
              onClick={() => {
                setScope(categoryId!);
                setSaved(false);
              }}
            >
              {t(`返回 ${categoryName} 分类偏好`, `Back to ${categoryName} preferences`)}
            </button>
          )}
          {scope !== "general" && (
            <div className="pn-pref-field">
              <label htmlFor="pn-pref-topics">
                {isSource
                  ? t("关注词覆盖", "Source interests")
                  : t("分类关注词", "Category interests")}
              </label>
              {isSource && (
                <label className="pn-pref-check">
                  <input
                    type="checkbox"
                    checked={current?.topics === undefined}
                    onChange={(e) =>
                      override("topics", e.target.checked ? undefined : [...effective.topics])
                    }
                  />
                  {t("继承分类关注词", "Inherit category interests")}
                </label>
              )}
              <input
                id="pn-pref-topics"
                key={`${scope}-${current?.topics === undefined}-${revision}`}
                disabled={isSource && current?.topics === undefined}
                maxLength={304}
                defaultValue={effective.topics.join(", ")}
                placeholder={t("例如：人工智能, 半导体", "e.g. AI, semiconductors")}
                onChange={(e) =>
                  override(
                    "topics",
                    e.target.value
                      .split(/[,，\n]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
              <small>
                {t(
                  "最多 5 个，用逗号分隔；留空表示不限制关注词。arXiv / GitHub 用于检索，其余来源用于内容排序。",
                  "Up to 5 comma-separated interests; leave empty for no topic restriction. Used for arXiv / GitHub search and other source ranking.",
                )}
              </small>
            </div>
          )}
          <div className="pn-pref-two">
            <label className="pn-pref-field" htmlFor="pn-pref-days">
              {t("时间范围", "Time window")}
              <select
                id="pn-pref-days"
                value={
                  scope === "general" ? preferences.general.days : (current?.days ?? "inherit")
                }
                onChange={(e) =>
                  scope === "general"
                    ? update((p) => {
                        p.general.days = Number(e.target.value);
                      })
                    : override(
                        "days",
                        e.target.value === "inherit" ? undefined : Number(e.target.value),
                      )
                }
              >
                {scope !== "general" && (
                  <option value="inherit">
                    {isSource
                      ? t(
                          `继承分类（${labelDays(preferences.categories[categoryId!].days ?? preferences.general.days)}）`,
                          `Inherit category (${labelDays(preferences.categories[categoryId!].days ?? preferences.general.days)})`,
                        )
                      : t(
                          `继承通用（${labelDays(preferences.general.days)}）`,
                          `Inherit general (${labelDays(preferences.general.days)})`,
                        )}
                  </option>
                )}
                {days.map((d) => (
                  <option key={d} value={d}>
                    {labelDays(d)}
                  </option>
                ))}
              </select>
              <small>
                {scope === "general"
                  ? t("仅影响继承通用时间的项目。", "Affects fields inheriting the general window.")
                  : t(
                      `当前生效：${labelDays(effective.days)}`,
                      `Effective: ${labelDays(effective.days)}`,
                    )}
              </small>
            </label>
            {!isSource && (
              <label className="pn-pref-field" htmlFor="pn-pref-sort">
                {t("默认排序", "Default sorting")}
                <select
                  id="pn-pref-sort"
                  value={
                    scope === "general"
                      ? preferences.general.sort
                      : (preferences.categories[categoryId!].sort ?? "inherit")
                  }
                  onChange={(e) =>
                    update((p) => {
                      if (scope === "general") p.general.sort = e.target.value as NewsSort;
                      else if (e.target.value === "inherit") delete p.categories[categoryId!].sort;
                      else p.categories[categoryId!].sort = e.target.value as NewsSort;
                    })
                  }
                >
                  {scope !== "general" && (
                    <option value="inherit">{t("继承通用排序", "Inherit general sorting")}</option>
                  )}
                  <option value="recommended">{t("推荐排序", "Recommended")}</option>
                  <option value="newest">{t("时间排序", "Newest first")}</option>
                </select>
                <small>
                  {t(
                    "页面临时切换排序不会改写偏好。",
                    "Sorting temporarily on the feed does not change preferences.",
                  )}
                </small>
              </label>
            )}
          </div>
          {isSource && (
            <>
              <button
                type="button"
                className="pn-text-button"
                onClick={() =>
                  update((p) => {
                    delete p.sources[source];
                  })
                }
              >
                <RotateCcw size={13} />
                {t("恢复继承：关注词与时间", "Restore inherited interests and time window")}
              </button>
              {source === "arxiv" && (
                <label className="pn-pref-field">
                  {t("arXiv 学科分类", "arXiv subject")}
                  <input
                    value={draft.arxiv.category}
                    maxLength={32}
                    placeholder="cs.AI"
                    onChange={(e) => advanced({ category: e.target.value })}
                  />
                </label>
              )}
              {source === "github" && (
                <div className="pn-pref-two">
                  <label className="pn-pref-field">
                    {t("编程语言", "Programming language")}
                    <input
                      value={draft.github.language}
                      maxLength={32}
                      placeholder="Python"
                      onChange={(e) => advanced({ language: e.target.value })}
                    />
                  </label>
                  <label className="pn-pref-field">
                    {t("最低 Star 数", "Minimum stars")}
                    <input
                      type="number"
                      min={0}
                      max={10000000}
                      step={1}
                      required
                      value={Number.isFinite(draft.github.minStars) ? draft.github.minStars : ""}
                      onChange={(e) => advanced({ minStars: e.target.valueAsNumber })}
                    />
                  </label>
                </div>
              )}
              {source === "huggingface" && (
                <label className="pn-pref-check">
                  <input
                    type="checkbox"
                    checked={draft.huggingface.matchedOnly}
                    onChange={(e) => advanced({ matchedOnly: e.target.checked })}
                  />
                  {t("只显示匹配关注词的精选论文", "Only show selected papers matching interests")}
                </label>
              )}
            </>
          )}
          {!isSource && categoryId && (
            <section className="pn-pref-sources" aria-label={t("分类来源", "Category sources")}>
              <h3>{t("启用的来源", "Enabled sources")}</h3>
              <p>
                {t(
                  "关闭后停止抓取并隐藏动态，已有收藏仍保留。",
                  "Disabled sources stop fetching and leave the discovery feed; bookmarks remain.",
                )}
              </p>
              {newsSourcesForCategory(categoryId).map((s) => (
                <div key={s} className="pn-pref-source-row">
                  <label className="pn-pref-check">
                    <input
                      type="checkbox"
                      checked={!preferences.categories[categoryId].disabledSources.includes(s)}
                      onChange={(e) =>
                        update((p) => {
                          const list = p.categories[categoryId].disabledSources;
                          p.categories[categoryId].disabledSources = e.target.checked
                            ? list.filter((v) => v !== s)
                            : [...new Set([...list, s])];
                        })
                      }
                    />
                    {names[s]}
                  </label>
                  <span>
                    {Object.keys(preferences.sources[s] || {}).length
                      ? t("有单独设置", "Has overrides")
                      : t("继承分类设置", "Inherits category")}
                  </span>
                  <button type="button" className="pn-text-button" onClick={() => setScope(s)}>
                    {t("高级设置", "Advanced")}
                    <ChevronRight size={13} />
                  </button>
                </div>
              ))}
            </section>
          )}
        </fieldset>
      </div>
      <footer className="pn-preferences-footer">
        <span role="status">
          {error
            ? t("保存失败，请检查输入后重试。", "Could not save. Check your inputs and retry.")
            : saved
              ? t("偏好已保存并生效。", "Preferences saved and applied.")
              : dirty
                ? t(
                    "有未保存的修改；保存将应用所有修改。",
                    "Unsaved changes; saving applies all edits.",
                  )
                : t(
                    "来源单独设置优先于分类，分类优先于通用默认值。",
                    "Source overrides take precedence over category settings, then general defaults.",
                  )}
        </span>
        <button className="pn-button pn-primary" disabled={busy || !dirty}>
          {busy ? t("保存中…", "Saving…") : t("保存偏好", "Save preferences")}
        </button>
      </footer>
    </form>
  );
}
