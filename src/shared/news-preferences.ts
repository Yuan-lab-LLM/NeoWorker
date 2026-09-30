import { isHfHubSource } from "./news-hub";
import {
  DEFAULT_PAPER_NEWS_CONFIG,
  PAPER_NEWS_SOURCES,
  type PaperNewsConfig,
  type PaperNewsSource,
} from "./paper-news";
import { NEWS_PUBLISHERS, isNewsPublisher } from "./news-sources";
export const NEWS_CATEGORIES = [
  "research",
  "development",
  "technology",
  "finance",
  "policy",
  "business",
  "health",
  "consumer",
  "productivity",
  "learning",
] as const;
export type NewsCategoryId = (typeof NEWS_CATEGORIES)[number];
export const DEFAULT_FOLLOWED_NEWS_CATEGORIES: NewsCategoryId[] = ["research", "development", "technology", "finance"];
export type NewsSort = "recommended" | "newest";
export interface NewsOverride {
  topics?: string[];
  days?: number;
}
export interface NewsPreferences {
  followedCategories?: NewsCategoryId[];
  general: { days: number; sort: NewsSort };
  categories: Record<
    NewsCategoryId,
    NewsOverride & { sort?: NewsSort; disabledSources: PaperNewsSource[] }
  >;
  sources: Partial<Record<PaperNewsSource, NewsOverride>>;
}
export function newsCategory(source: PaperNewsSource): NewsCategoryId {
  return isNewsPublisher(source)
    ? NEWS_PUBLISHERS[source].category
    : source === "github" || isHfHubSource(source)
      ? "development"
      : "research";
}
/** Old non-default source choices become explicit overrides; defaults can inherit. */
export function getNewsPreferences(config: PaperNewsConfig): NewsPreferences {
  if (config.preferences) {
    const preferences = structuredClone(config.preferences);
    for (const id of NEWS_CATEGORIES) preferences.categories[id] ||= { disabledSources: [] };
    preferences.followedCategories ??= [...DEFAULT_FOLLOWED_NEWS_CATEGORIES];
    return preferences;
  }
  const categories = Object.fromEntries(
    NEWS_CATEGORIES.map((id) => [id, { disabledSources: [] as PaperNewsSource[] }]),
  ) as NewsPreferences["categories"];
  categories.research = {
    topics: [...DEFAULT_PAPER_NEWS_CONFIG.arxiv.topics],
    days: 14,
    disabledSources: [],
  };
  categories.development = {
    topics: [...DEFAULT_PAPER_NEWS_CONFIG.github.topics],
    days: 14,
    disabledSources: [],
  };
  const sources: NewsPreferences["sources"] = {};
  for (const source of PAPER_NEWS_SOURCES) {
    const value: NewsOverride = {};
    const settings = config[source] ?? DEFAULT_PAPER_NEWS_CONFIG[source];
    if (
      JSON.stringify(settings.topics) !== JSON.stringify(DEFAULT_PAPER_NEWS_CONFIG[source].topics)
    )
      value.topics = [...settings.topics];
    if (settings.days !== DEFAULT_PAPER_NEWS_CONFIG[source].days) value.days = settings.days;
    if (Object.keys(value).length) sources[source] = value;
  }
  return { general: { days: 365, sort: "recommended" }, categories, sources, followedCategories: [...DEFAULT_FOLLOWED_NEWS_CATEGORIES] };
}
export function effectiveNewsSettings(preferences: NewsPreferences, source: PaperNewsSource) {
  const category = preferences.categories[newsCategory(source)] ?? { disabledSources: [] };
  const override = preferences.sources[source];
  return {
    topics: override?.topics ?? category.topics ?? [],
    days: override?.days ?? category.days ?? preferences.general.days,
  };
}
export function newsSourceEnabled(config: PaperNewsConfig, source: PaperNewsSource): boolean {
  return !config.preferences?.categories[newsCategory(source)]?.disabledSources.includes(source);
}
export function newsDefaultSort(
  config: PaperNewsConfig,
  category: NewsCategoryId | "all",
): NewsSort {
  const preferences = config.preferences;
  return (
    (category !== "all" && preferences?.categories[category]?.sort) ||
    preferences?.general.sort ||
    "recommended"
  );
}
