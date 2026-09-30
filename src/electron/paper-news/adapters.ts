import {
  HF_HUB_SOURCES,
  isHfHubSource,
  hfHubUrl,
  type HfHubSort,
  type HfHubSource,
} from "../../shared/news-hub";
import {
  NEWS_CATEGORIES,
  DEFAULT_FOLLOWED_NEWS_CATEGORIES,
  newsCategory,
  effectiveNewsSettings,
  newsSourceEnabled,
  type NewsPreferences,
} from "../../shared/news-preferences";
import { PAPER_NEWS_SOURCES } from "../../shared/paper-news";
import { NEWS_PUBLISHERS, NEWS_PUBLISHER_IDS, isNewsPublisher } from "../../shared/news-sources";
import { DEFAULT_PAPER_NEWS_CONFIG } from "../../shared/paper-news";
import { parsePublisherNews } from "./publishers";
import { newsImageUrl } from "./covers";
import { DOMParser } from "@xmldom/xmldom";
import type {
  PaperNewsConfig,
  PaperNewsTopicConfig,
  PaperNewsItem,
  PaperNewsSource,
} from "../../shared/paper-news";

type RecordValue = Record<string, unknown>;
const record = (v: unknown): RecordValue => (v && typeof v === "object" ? (v as RecordValue) : {});
const text = (v: unknown, max = 12000): string =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const date = (v: unknown): string =>
  typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : "";
const count = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined;
const arxivId = (v: string): string | undefined =>
  v.match(/(?:^|\/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/)?.[1];
const unique = (items: PaperNewsItem[]) => [
  ...new Map(items.filter((i) => i.title && i.date).map((i) => [i.id, i])).values(),
];

function normalizeTopics(value: unknown, optional = false): PaperNewsTopicConfig {
  const input = record(value);
  const topics = [
    ...new Set(
      array(input.topics)
        .map((v) =>
          text(v, 60)
            .replace(/["\\:()\r\n]/g, " ")
            .trim(),
        )
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (
    (!optional && !topics.length) ||
    !(optional ? [7, 14, 30, 90, 365] : [7, 14, 30]).includes(Number(input.days))
  )
    throw new Error("Invalid paper news settings");
  return { topics, days: Number(input.days) };
}

/** Version 1 shared settings migrate to independent copies for all three sources. */
export function normalizePaperNewsConfig(value: unknown): PaperNewsConfig {
  const input = record(value);
  const legacy = Array.isArray(input.topics) && !input.arxiv && !input.github && !input.huggingface;
  const preferences =
    input.preferences === undefined ? undefined : normalizeNewsPreferences(input.preferences);
  const sourceInput = (source: PaperNewsSource) =>
    preferences
      ? { ...record(input[source]), ...effectiveNewsSettings(preferences, source) }
      : input[source];
  const arxiv = record(legacy ? input : sourceInput("arxiv"));
  const github = record(legacy ? input : sourceInput("github"));
  const hf = record(legacy ? input : sourceInput("huggingface"));
  const category = arxiv.category ?? "";
  const language = github.language ?? "";
  const minStars = github.minStars ?? 0;
  const matchedOnly = hf.matchedOnly ?? false;
  if (
    typeof category !== "string" ||
    category.length > 32 ||
    (category && !/^[a-z]+(?:-[a-z]+)*(?:\.[A-Z]{2})?$/.test(category))
  )
    throw new Error("Invalid arXiv category");
  if (
    typeof language !== "string" ||
    language.length > 32 ||
    (language && !/^[a-zA-Z0-9+#. -]+$/.test(language))
  )
    throw new Error("Invalid repository language");
  if (
    typeof minStars !== "number" ||
    !Number.isInteger(minStars) ||
    minStars < 0 ||
    minStars > 10000000
  )
    throw new Error("Invalid minimum stars");
  if (typeof matchedOnly !== "boolean") throw new Error("Invalid interest filter");
  const hubConfigs = Object.fromEntries(
    HF_HUB_SOURCES.map((source) => {
      const raw = record(sourceInput(source) ?? DEFAULT_PAPER_NEWS_CONFIG[source]);
      const listSort = raw.listSort ?? "trendingScore";
      const matchedOnly = raw.matchedOnly ?? false;
      if (
        !["trendingScore", "lastModified", "downloads"].includes(String(listSort)) ||
        typeof matchedOnly !== "boolean"
      )
        throw new Error("Invalid Hugging Face settings");
      return [
        source,
        { ...normalizeTopics(raw, true), listSort: listSort as HfHubSort, matchedOnly },
      ];
    }),
  ) as Pick<PaperNewsConfig, HfHubSource>;
  return {
    ...hubConfigs,
    ...(Object.fromEntries(
      NEWS_PUBLISHER_IDS.map((source) => [
        source,
        normalizeTopics(sourceInput(source) ?? DEFAULT_PAPER_NEWS_CONFIG[source], true),
      ]),
    ) as Pick<PaperNewsConfig, (typeof NEWS_PUBLISHER_IDS)[number]>),
    ...(preferences ? { preferences } : {}),
    arxiv: { ...normalizeTopics(arxiv, Boolean(preferences)), category },
    github: {
      ...normalizeTopics(github, Boolean(preferences)),
      language: language.trim(),
      minStars,
    },
    huggingface: { ...normalizeTopics(hf, Boolean(preferences)), matchedOnly },
  };
}

export function paperNewsEndpoint(
  source: PaperNewsSource,
  config: PaperNewsConfig,
  now: number,
): string {
  if (isNewsPublisher(source)) return NEWS_PUBLISHERS[source].endpoint;
  if (isHfHubSource(source))
    return `https://huggingface.co/api/${source === "hf-models" ? "models" : "datasets"}?${new URLSearchParams({ sort: config[source].listSort, direction: "-1", limit: "60", full: "true", ...(source === "hf-models" ? { cardData: "true" } : {}) })}`;
  const settings = config[source];
  const since = new Date(now - settings.days * 86400000).toISOString().slice(0, 10);
  if (source === "arxiv") {
    const query = settings.topics.map((t) => `(ti:"${t}" OR abs:"${t}")`).join(" OR ");
    return `https://export.arxiv.org/api/query?${new URLSearchParams({ search_query: [query ? `(${query})` : "", config.arxiv.category ? `cat:${config.arxiv.category}` : "", `submittedDate:[${since.replaceAll("-", "")}0000 TO ${new Date(now).toISOString().slice(0, 10).replaceAll("-", "")}2359]`].filter(Boolean).join(" AND "), start: "0", max_results: "60", sortBy: "submittedDate", sortOrder: "descending" })}`;
  }
  if (source === "huggingface") return "https://huggingface.co/api/daily_papers?limit=100";
  // Preserve existing keyword lengths where possible while reserving room for qualifiers.
  const qualifiers = ` pushed:>=${since} archived:false fork:false${config.github.language ? ` language:"${config.github.language}"` : ""}${config.github.minStars ? ` stars:>=${config.github.minStars}` : ""}`;
  const termBudget = Math.min(
    25,
    Math.floor(
      (256 - qualifiers.length - settings.topics.length * 2 - (settings.topics.length - 1) * 4) /
        Math.max(1, settings.topics.length),
    ),
  );
  const terms = settings.topics.map((t) => `"${t.slice(0, termBudget)}"`).join(" OR ");
  return `https://api.github.com/search/repositories?${new URLSearchParams({ q: terms + qualifiers, sort: "stars", order: "desc", per_page: "60" })}`;
}

export function parsePaperNews(source: PaperNewsSource, raw: string): PaperNewsItem[] {
  if (isNewsPublisher(source)) return parsePublisherNews(source, raw);
  const base = { matchedTopics: [] as string[], score: 0 };
  if (source === "arxiv") {
    if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error("Invalid feed");
    let invalid = false;
    const doc = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: () => {
          invalid = true;
        },
        fatalError: () => {
          invalid = true;
        },
      },
    }).parseFromString(raw, "application/xml");
    if (invalid || doc.documentElement.localName !== "feed") throw new Error("Invalid feed");
    const items: PaperNewsItem[] = [];
    for (const entry of Array.from(doc.getElementsByTagName("entry")).slice(0, 100)) {
      const value = (key: string) => text(entry.getElementsByTagName(key)[0]?.textContent);
      const id = arxivId(value("id"));
      if (!id) {
        if (value("id").includes("api/errors")) throw new Error("Invalid query");
        continue;
      }
      items.push({
        ...base,
        id: `arxiv:${id.replace(/v\d+$/, "")}`,
        source,
        title: value("title"),
        summary: value("summary"),
        authors: Array.from(entry.getElementsByTagName("author"))
          .map((a) => text(a.getElementsByTagName("name")[0]?.textContent))
          .slice(0, 40),
        url: `https://arxiv.org/abs/${id}`,
        pdfUrl: `https://arxiv.org/pdf/${id}`,
        date: date(value("published")),
        tags: Array.from(entry.getElementsByTagName("category"))
          .map((c) => text(c.getAttribute("term"), 60))
          .slice(0, 10),
      });
    }
    return unique(items);
  }
  const parsed: unknown = JSON.parse(raw);
  if (isHfHubSource(source)) {
    if (!Array.isArray(parsed)) throw new Error("Invalid feed");
    return unique(
      parsed.slice(0, 60).flatMap((value) => {
        const row = record(value),
          card = record(row.cardData),
          id = text(row.id, 200);
        const url = hfHubUrl(source, id);
        if (!url || row.private === true || row.disabled === true) return [];
        const tags = array(row.tags)
          .map((v) => text(v, 100))
          .filter(Boolean);
        const license =
          text(card.license, 100) || tags.find((tag) => tag.startsWith("license:"))?.slice(8);
        const hubTask =
          text(row.pipeline_tag, 100) ||
          array(card.task_categories)
            .map((v) => text(v, 100))
            .filter(Boolean)
            .join(", ")
            .slice(0, 200);
        return [
          {
            ...base,
            source,
            id: `${source}:${id}`,
            title: id,
            url,
            summary: text(row.description) || text(card.description),
            authors: [text(row.author, 100) || id.split("/")[0]],
            date: date(row.lastModified),
            tags: tags.slice(0, 20),
            popularity: count(row.likes),
            downloads: count(row.downloads),
            license,
            hubTask,
            gated: row.gated === true || row.gated === "auto" || row.gated === "manual",
          },
        ];
      }),
    );
  }
  if (source === "huggingface") {
    if (!Array.isArray(parsed)) throw new Error("Invalid feed");
    return unique(
      parsed.slice(0, 100).flatMap((v) => {
        const row = record(v),
          paper = record(row.paper),
          id = arxivId(text(paper.id));
        if (!id) return [];
        return [
          {
            ...base,
            id: `huggingface:${id.replace(/v\d+$/, "")}`,
            source,
            title: text(paper.title, 500),
            summary: text(paper.summary),
            authors: array(paper.authors)
              .map((a) => text(record(a).name, 120))
              .slice(0, 40),
            url: `https://huggingface.co/papers/${id}`,
            pdfUrl: `https://arxiv.org/pdf/${id}`,
            date: date(row.publishedAt) || date(paper.publishedAt),
            tags: array(paper.ai_keywords)
              .map((t) => text(t, 60))
              .filter(Boolean)
              .slice(0, 8),
            popularity: count(paper.upvotes),
            imageUrl: newsImageUrl(row.thumbnail) || newsImageUrl(paper.thumbnail),
          },
        ];
      }),
    );
  }
  const root = record(parsed);
  if (!Array.isArray(root.items)) throw new Error("Invalid feed");
  return unique(
    root.items.slice(0, 100).flatMap((v) => {
      const row = record(v),
        name = text(row.full_name, 200);
      if (!/^[\w.-]+\/[\w.-]+$/.test(name)) return [];
      return [
        {
          ...base,
          id: `github:${name.toLowerCase()}`,
          source,
          title: name,
          summary: text(row.description),
          authors: [text(record(row.owner).login, 100)],
          url: `https://github.com/${name}`,
          date: date(row.pushed_at),
          tags: array(row.topics)
            .map((t) => text(t, 60))
            .slice(0, 10),
          popularity: count(row.stargazers_count),
        },
      ];
    }),
  );
}

export function rankPaperNews(
  items: PaperNewsItem[],
  config: PaperNewsConfig,
  now: number,
  keepOlder = false,
): PaperNewsItem[] {
  return items
    .filter((i) => keepOlder || newsSourceEnabled(config, i.source))
    .filter(
      (i) =>
        keepOlder ||
        (isNewsPublisher(i.source) && !i.date) ||
        (Date.parse(i.date) >= now - config[i.source].days * 86400000 &&
          Date.parse(i.date) <= now + 86400000),
    )
    .map((item) => {
      const settings = config[item.source];
      const haystack = `${item.title} ${item.summary} ${item.tags.join(" ")}`.toLowerCase();
      const matchedTopics = settings.topics.filter((t) => haystack.includes(t.toLowerCase()));
      const age = item.date ? Math.max(0, (now - Date.parse(item.date)) / 86400000) : settings.days;
      return {
        ...item,
        matchedTopics,
        score: Math.round(
          (settings.topics.length ? (70 * matchedTopics.length) / settings.topics.length : 0) +
            (settings.topics.length ? 30 : 100) * Math.max(0, 1 - age / settings.days),
        ),
      };
    })
    .filter(
      (item) =>
        keepOlder ||
        (!isHfHubSource(item.source) && item.source !== "huggingface") ||
        !(config[item.source] as { matchedOnly?: boolean }).matchedOnly ||
        !config[item.source].topics.length ||
        item.matchedTopics.length > 0,
    )
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}

function normalizeNewsPreferences(value: unknown): NewsPreferences {
  const input = record(value),
    general = record(input.general),
    categories = record(input.categories),
    sources = record(input.sources);
  const sort = (value: unknown) => {
    if (value !== "recommended" && value !== "newest") throw new Error("Invalid news sort");
    return value;
  };
  const override = (v: unknown) => {
    const raw = record(v);
    const result: { topics?: string[]; days?: number } = {};
    if (raw.topics !== undefined) {
      if (!Array.isArray(raw.topics) || raw.topics.some((t) => typeof t !== "string"))
        throw new Error("Invalid news interests");
      result.topics = normalizeTopics({ topics: raw.topics, days: 7 }, true).topics;
    }
    if (raw.days !== undefined)
      result.days = normalizeTopics({ topics: [], days: raw.days }, true).days;
    return result;
  };
  const normalizedCategories = Object.fromEntries(
    NEWS_CATEGORIES.map((id) => {
      const item = categories[id] === undefined ? { disabledSources: [] } : record(categories[id]);
      if (
        !Array.isArray(item.disabledSources) ||
        item.disabledSources.some(
          (s) =>
            !PAPER_NEWS_SOURCES.includes(s as PaperNewsSource) ||
            newsCategory(s as PaperNewsSource) !== id,
        )
      )
        throw new Error("Invalid disabled source");
      return [
        id,
        {
          ...override(item),
          ...(item.sort === undefined ? {} : { sort: sort(item.sort) }),
          disabledSources: [...new Set(item.disabledSources)],
        },
      ];
    }),
  ) as NewsPreferences["categories"];
  const normalizedSources: NewsPreferences["sources"] = {};
  for (const key of Object.keys(sources)) {
    if (!PAPER_NEWS_SOURCES.includes(key as PaperNewsSource))
      throw new Error("Invalid source override");
    normalizedSources[key as PaperNewsSource] = override(sources[key]);
  }
  const followed = input.followedCategories ?? DEFAULT_FOLLOWED_NEWS_CATEGORIES;
  if (!Array.isArray(followed) || followed.some(id => !NEWS_CATEGORIES.includes(id)) || followed.length > 4)
    throw new Error("Invalid followed news categories");
  return {
    followedCategories: [...new Set(followed)] as NewsPreferences["followedCategories"],
    general: {
      days: normalizeTopics({ topics: [], days: general.days }, true).days,
      sort: sort(general.sort),
    },
    categories: normalizedCategories,
    sources: normalizedSources,
  };
}
