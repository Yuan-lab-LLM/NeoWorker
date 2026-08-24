const DEFAULT_OPENROUTER_ATTRIBUTION_URL = "https://github.com/NeoWorker/NeoWorker";
const DEFAULT_OPENROUTER_ATTRIBUTION_TITLE = "NeoWorker";
const DEFAULT_OPENROUTER_ATTRIBUTION_CATEGORIES = [
  "personal-agent",
  "programming-app",
] as const;

export function getOpenRouterAttributionHeaders(): Record<string, string> {
  return {
    "HTTP-Referer": DEFAULT_OPENROUTER_ATTRIBUTION_URL,
    "X-OpenRouter-Title": DEFAULT_OPENROUTER_ATTRIBUTION_TITLE,
    "X-OpenRouter-Categories": DEFAULT_OPENROUTER_ATTRIBUTION_CATEGORIES.join(","),
    // Keep the legacy title header for compatibility with older OpenRouter examples.
    "X-Title": DEFAULT_OPENROUTER_ATTRIBUTION_TITLE,
  };
}
