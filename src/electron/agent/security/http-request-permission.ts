const READ_HEADERS = new Set(["accept", "accept-language", "user-agent"]);

function isOriginOnlyHeader(value: string): boolean {
  try {
    const url = new URL(value);
    // Sites such as Sina require their public origin as the Referer. A full
    // referring URL can include private paths, search text, or access tokens.
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username && !url.password &&
      (value === url.origin || value === `${url.origin}/`)
    );
  } catch {
    return false;
  }
}

/** Classify the request; workspace and network policies still apply separately. */
export function isReadOnlyHttpRequestInput(input: unknown): boolean {
  const request = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const method = typeof request.method === "string" && request.method.trim()
    ? request.method.trim().toUpperCase()
    : "GET";
  if (method !== "GET" && method !== "HEAD") return false;
  if (request.body != null && request.body !== "") return false;

  if (typeof request.url === "string") {
    try {
      const url = new URL(request.url);
      if (url.username || url.password) return false;
    } catch {
      return false;
    }
  }

  if (request.headers == null) return true;
  if (typeof request.headers !== "object" || Array.isArray(request.headers)) return false;
  return Object.entries(request.headers).every(([name, value]) => {
    if (typeof value !== "string" || /[\r\n]/.test(value)) return false;
    const header = name.toLowerCase();
    if (READ_HEADERS.has(header)) return true;
    if (header === "referer" || header === "origin") return isOriginOnlyHeader(value);
    // Credentials, cookies, and arbitrary custom headers remain export-scoped.
    return false;
  });
}
