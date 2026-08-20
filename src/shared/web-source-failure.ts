const WEB_SOURCE_TOOLS = new Set(["web_fetch", "http_request"]);

/**
 * Web research commonly probes several candidate URLs before finding a usable
 * source. A missing, blocked, or temporarily unreachable candidate is not the
 * same thing as the task failing, as long as another source can be used.
 */
export function isWebSourceTool(toolName: unknown): boolean {
  return typeof toolName === "string" && WEB_SOURCE_TOOLS.has(toolName.trim());
}

export function isRecoverableWebSourceFailure(reason: unknown): boolean {
  const message = typeof reason === "string" ? reason.trim().toLowerCase() : "";
  if (!message) return false;

  // Policy, malformed input, and unsupported protocols require a real fix.
  if (
    /domain not allowed|network access denied|malformed proxied url|only http and https|invalid url/.test(
      message,
    )
  ) {
    return false;
  }

  return (
    /\bhttp\s+(?:4\d\d|5\d\d)\b/.test(message) ||
    /\b(?:404|410|429|500|502|503|504)\b/.test(message) ||
    /not found|forbidden|access denied|robots|paywall/.test(message) ||
    /timed?\s*out|timeout|abort/.test(message) ||
    /fetch failed|network error|socket|connection|econn|enotfound|dns|tls|certificate/.test(
      message,
    )
  );
}
