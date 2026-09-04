import {
  SearchProvider,
  SearchProviderConfig,
  SearchQuery,
  SearchResponse,
  SearchResult,
  SearchType,
} from "./types";
import { extractFlightRoute } from "./flight-query";

type SearchFetch = typeof fetch;

let duckDuckGoUnavailableUntil = 0;

function getElectronNetFetch(): SearchFetch | null {
  try {
    // DuckDuckGo is often unreachable through Node's undici network path on
    // proxied macOS networks, while Electron's Chromium network stack honors
    // the system proxy. Keep the provider usable outside Electron by falling
    // back to the regular global fetch implementation.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // oxlint-disable-next-line typescript-eslint(no-require-imports)
    const electron = require("electron") as Any;
    const netFetch = electron?.net?.fetch;
    return typeof netFetch === "function" ? netFetch.bind(electron.net) : null;
  } catch {
    return null;
  }
}

function describeNetworkError(error: Any): string {
  const cause = error?.cause;
  const code = cause?.code || error?.code;
  const detail = cause?.message || error?.message;

  if (code === "UND_ERR_CONNECT_TIMEOUT" || error?.name === "AbortError") {
    return "DuckDuckGo connection timed out. Check your network or proxy settings and try again.";
  }

  return detail
    ? `DuckDuckGo connection failed: ${detail}`
    : "Failed to connect to DuckDuckGo";
}

/**
 * Built-in web search provider (free, no API key required).
 * Scrapes DuckDuckGo HTML and falls back to Bing's public SERP when the DDG
 * route is blocked. Chinese lookups prefer the mainland Bing host, while
 * flight lookups keep DDG first so route direction is not lost.
 */
export class DuckDuckGoProvider implements SearchProvider {
  readonly type = "duckduckgo" as const;
  readonly supportedSearchTypes: SearchType[] = ["web"];

  private baseUrl = "https://html.duckduckgo.com/html/";

  constructor(_config?: SearchProviderConfig) {
    // No API key needed — this is a free provider.
  }

  async search(query: SearchQuery): Promise<SearchResponse> {
    const requestedSearchType = query.searchType || "web";
    const searchType = requestedSearchType;

    if (searchType !== "web") {
      throw new Error(`DuckDuckGo only supports web search, not ${searchType}`);
    }

    const maxResults = Math.min(query.maxResults || 10, 20);

    const text = String(query.query || "");
    const hasChinese = /[\u3400-\u9fff]/u.test(text);
    const isFlight = /(?:航班|机票|航线|起飞|到达|票价|飞行时间|机场|航空|flight|airfare|airline|airport|departure|arrival)/i.test(
      text,
    );
    const preferChinaRoute =
      query.preferChinaRoute === true || query.region === "cn" || query.region === "cn-zh" || hasChinese;

    // Prefer the mainland route for Chinese non-flight searches. Flight
    // lookups keep DDG first because its indexed pages preserve IATA direction
    // more often; Bing is the bounded fallback when DDG is blocked or empty.
    if (preferChinaRoute && !isFlight && Date.now() >= duckDuckGoUnavailableUntil) {
      try {
        return await this.searchBing(query, maxResults, requestedSearchType);
      } catch {
        // Continue through the regular DDG path below.
      }
    }

    if (Date.now() < duckDuckGoUnavailableUntil) {
      return this.searchBing(query, maxResults, requestedSearchType);
    }

    const params = new URLSearchParams({
      q: query.query,
    });

    // DuckDuckGo HTML endpoint supports region via 'kl' param
    if (query.region) {
      params.set("kl", this.mapRegion(query.region));
    }

    // Date range via 'df' param
    if (query.dateRange) {
      params.set("df", this.mapDateRange(query.dateRange));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const requestInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
        body: params.toString(),
        signal: controller.signal,
      };

      const electronFetch = getElectronNetFetch();
      let response: Response;

      try {
        response = await (electronFetch || globalThis.fetch)(this.baseUrl, requestInit);
      } catch (primaryError: Any) {
        // Outside Electron there is no Chromium fetch. Inside Electron, retry
        // with Node fetch only when the Chromium request itself fails.
        if (!electronFetch) throw primaryError;
        try {
          response = await globalThis.fetch(this.baseUrl, requestInit);
        } catch (fallbackError: Any) {
          throw new Error(describeNetworkError(fallbackError), {
            cause: fallbackError,
          });
        }
      }

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`DuckDuckGo request failed: ${response.status}`);
      }

      const html = await response.text();
      const results = this.parseResults(html, maxResults);

      if (results.length === 0) {
        throw new Error("DuckDuckGo returned no results");
      }

      duckDuckGoUnavailableUntil = 0;

      return {
        results,
        query: query.query,
        searchType: "web",
        provider: "duckduckgo",
      };
    } catch (error: Any) {
      clearTimeout(timeout);
      duckDuckGoUnavailableUntil = Date.now() + 10 * 60 * 1000;
      try {
        return await this.searchBing(query, maxResults, requestedSearchType);
      } catch (fallbackError: Any) {
        const primaryMessage = error?.message?.startsWith("DuckDuckGo")
          ? error.message
          : describeNetworkError(error);
        throw new Error(
          `${primaryMessage}; Bing fallback failed: ${fallbackError?.message || fallbackError}`,
          { cause: fallbackError },
        );
      }
    }
  }

  private async searchBing(
    query: SearchQuery,
    maxResults: number,
    requestedSearchType: SearchType,
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query.query,
      count: String(maxResults),
    });
    const chinaRoute =
      query.preferChinaRoute === true ||
      query.region === "cn" ||
      query.region === "cn-zh" ||
      /[\u3400-\u9fff]/u.test(String(query.query || ""));
    const results: SearchResult[] = [];
    const hosts = chinaRoute
      ? ["https://cn.bing.com/search", "https://www.bing.com/search"]
      : ["https://www.bing.com/search"];
    const queryTokens: string[] = [];
    const queryText = String(query.query || "").toLowerCase();
    const flightRoute = /(?:航班|机票|航线|起飞|到达|票价|飞行时间|机场|航空|flight|airfare|airline|airport|departure|arrival)/i.test(
      queryText,
    )
      ? extractFlightRoute(queryText)
      : null;
    for (const token of queryText.match(/[a-z0-9]{3,}/g) || []) {
      queryTokens.push(token);
    }
    // Chinese SERP titles often insert a suffix between two query terms, so
    // use bounded bigrams instead of requiring the whole query verbatim.
    for (const run of queryText.match(/[\u3400-\u9fff]{2,}/g) || []) {
      for (let index = 0; index < run.length - 1; index += 1) {
        queryTokens.push(run.slice(index, index + 2));
      }
    }
    const isRelevant = (title: string, url: string, snippet: string) => {
      if (queryTokens.length === 0) return true;
      const fields = [title, url, snippet].map((field) => field.toLowerCase());
      if (!queryTokens.some((token) => fields.some((field) => field.includes(token)))) {
        return false;
      }
      if (!flightRoute) return true;
      const fromSignals = [flightRoute.fromCode, flightRoute.fromCity].map((signal) =>
        signal.toLowerCase(),
      );
      const toSignals = [flightRoute.toCode, flightRoute.toCity].map((signal) =>
        signal.toLowerCase(),
      );
      return fields.some((field) =>
        fromSignals.some((from) =>
          toSignals.some((to) => {
            const fromIndex = field.indexOf(from);
            const toIndex = field.indexOf(to, fromIndex + from.length);
            return fromIndex >= 0 && toIndex >= 0 && toIndex - fromIndex <= 180;
          }),
        ),
      );
    };
    let lastError: Any = null;
    for (const host of hosts) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await (getElectronNetFetch() || globalThis.fetch)(`${host}?${params}`, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Bing request failed: ${response.status}`);
        const html = await response.text();
        const htmlRegex =
          /<li[^>]+class=["'][^"']*b_algo[^"']*["'][^>]*>[\s\S]*?<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>|<div[^>]+class=["'][^"']*b_caption[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>)[\s\S]*?<\/li>/gi;
        let match: RegExpExecArray | null;
        while ((match = htmlRegex.exec(html)) && results.length < maxResults) {
          const title = this.stripHtml(match[2]).trim();
          const url = this.stripHtml(match[1]).trim();
          const snippet = this.stripHtml(match[3] || match[4] || "").trim();
          if (!title || !url || !isRelevant(title, url, snippet)) continue;
          results.push({ title, url, snippet, source: this.extractHostname(url) });
        }
        if (results.length === 0) {
          const rssRegex =
            /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/gi;
          while ((match = rssRegex.exec(html)) && results.length < maxResults) {
            const title = this.stripHtml(match[1]).trim();
            const url = this.stripHtml(match[2]).trim();
            const snippet = this.stripHtml(match[3] || "").trim();
            if (!title || !url || !isRelevant(title, url, snippet)) continue;
            results.push({ title, url, snippet, source: this.extractHostname(url) });
          }
        }
        if (results.length > 0) break;
      } catch (error: Any) {
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!results.length) {
      throw lastError || new Error("Bing returned no results");
    }
    return {
      results,
      query: query.query,
      searchType: "web",
      provider: "duckduckgo",
      metadata: {
        fallbackProvider: "bing",
        fallbackFrom: "duckduckgo",
        requestedSearchType,
        searchTypeDowngraded: requestedSearchType !== "web",
      },
    };
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await this.search({ query: "test", maxResults: 1 });
      if (result.results.length === 0) {
        return { success: false, error: "No results returned from DuckDuckGo" };
      }
      return { success: true };
    } catch (error: Any) {
      return {
        success: false,
        error: error.message || "Failed to connect to DuckDuckGo",
      };
    }
  }

  /**
   * Parse search results from DuckDuckGo HTML response.
   *
   * The HTML structure uses:
   * - .result__a for the title link (href = redirect URL, text = title)
   * - .result__snippet for the description text
   */
  private parseResults(html: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];

    // Match each result block: class="result__a" for title+url, class="result__snippet" for snippet
    const resultBlockRegex =
      /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    let match: RegExpExecArray | null;
    while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
      const rawUrl = match[1];
      const rawTitle = match[2];
      const rawSnippet = match[3];

      // DDG wraps URLs in a redirect; extract actual URL from uddg= param
      const url = this.extractUrl(rawUrl);
      const title = this.stripHtml(rawTitle).trim();
      const snippet = this.stripHtml(rawSnippet).trim();

      if (url && title) {
        results.push({
          title,
          url,
          snippet,
          source: this.extractHostname(url),
        });
      }
    }

    return results;
  }

  /**
   * Extract the real URL from DuckDuckGo's redirect wrapper.
   * DDG links look like: /l/?uddg=https%3A%2F%2Fexample.com&rut=...
   */
  private extractUrl(rawUrl: string): string {
    try {
      if (rawUrl.includes("uddg=")) {
        const urlObj = new URL(rawUrl, "https://duckduckgo.com");
        const uddg = urlObj.searchParams.get("uddg");
        if (uddg) return uddg;
      }
      if (rawUrl.startsWith("http")) return rawUrl;
    } catch {
      // Fall through
    }
    return rawUrl;
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<b>/g, "")
      .replace(/<\/b>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  }

  private extractHostname(url: string): string | undefined {
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  }

  private mapRegion(region: string): string {
    const regionMap: Record<string, string> = {
      us: "us-en",
      uk: "uk-en",
      gb: "uk-en",
      de: "de-de",
      fr: "fr-fr",
      es: "es-es",
      it: "it-it",
      jp: "jp-jp",
      br: "br-pt",
    };
    return regionMap[region.toLowerCase()] || `${region.toLowerCase()}-en`;
  }

  private mapDateRange(range: string): string {
    switch (range) {
      case "day":
        return "d";
      case "week":
        return "w";
      case "month":
        return "m";
      case "year":
        return "y";
      default:
        return "w";
    }
  }
}
