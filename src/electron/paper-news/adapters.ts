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
  const arxiv = record(legacy ? input : input.arxiv);
  const github = record(legacy ? input : input.github);
  const hf = record(legacy ? input : input.huggingface);
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
  return {
    ...(Object.fromEntries(
      NEWS_PUBLISHER_IDS.map((source) => [
        source,
        normalizeTopics(input[source] ?? DEFAULT_PAPER_NEWS_CONFIG[source], true),
      ]),
    ) as Pick<PaperNewsConfig, (typeof NEWS_PUBLISHER_IDS)[number]>),
    arxiv: { ...normalizeTopics(arxiv), category },
    github: { ...normalizeTopics(github), language: language.trim(), minStars },
    huggingface: { ...normalizeTopics(hf), matchedOnly },
  };
}

export function paperNewsEndpoint(
  source: PaperNewsSource,
  config: PaperNewsConfig,
  now: number,
): string {
  if (isNewsPublisher(source)) return NEWS_PUBLISHERS[source].endpoint;
  const settings = config[source];
  const since = new Date(now - settings.days * 86400000).toISOString().slice(0, 10);
  if (source === "arxiv") {
    const query = settings.topics.map((t) => `(ti:"${t}" OR abs:"${t}")`).join(" OR ");
    return `https://export.arxiv.org/api/query?${new URLSearchParams({ search_query: `(${query})${config.arxiv.category ? ` AND cat:${config.arxiv.category}` : ""} AND submittedDate:[${since.replaceAll("-", "")}0000 TO ${new Date(now).toISOString().slice(0, 10).replaceAll("-", "")}2359]`, start: "0", max_results: "60", sortBy: "submittedDate", sortOrder: "descending" })}`;
  }
  if (source === "huggingface") return "https://huggingface.co/api/daily_papers?limit=100";
  // Preserve existing keyword lengths where possible while reserving room for qualifiers.
  const qualifiers = ` pushed:>=${since} archived:false fork:false${config.github.language ? ` language:"${config.github.language}"` : ""}${config.github.minStars ? ` stars:>=${config.github.minStars}` : ""}`;
  const termBudget = Math.min(
    25,
    Math.floor(
      (256 - qualifiers.length - settings.topics.length * 2 - (settings.topics.length - 1) * 4) /
        settings.topics.length,
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
        item.source !== "huggingface" ||
        !config.huggingface.matchedOnly ||
        item.matchedTopics.length > 0,
    )
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
}
