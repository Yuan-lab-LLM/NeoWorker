export function isOpenCodeGoBaseUrl(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    return (
      url.hostname.toLowerCase() === "opencode.ai" &&
      /\/zen\/go(?:\/|$)/i.test(url.pathname)
    );
  } catch {
    return trimmed.toLowerCase().includes("opencode.ai/zen/go/");
  }
}

export function normalizeOpenCodeGoModelId(model: string): string {
  const trimmed = model.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("opencode-go/")) {
    return trimmed.slice("opencode-go/".length);
  }
  return trimmed;
}

export function isOpenCodeGoAnthropicMessagesModel(model: string): boolean {
  const normalized = normalizeOpenCodeGoModelId(model).toLowerCase();
  const withoutVariant = normalized.includes(":")
    ? normalized.slice(0, normalized.indexOf(":"))
    : normalized;
  return withoutVariant === "qwen3.7-max";
}

export function normalizeOpenCodeGoAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/chat/completions")) {
    return trimmed.slice(0, -"/chat/completions".length);
  }
  if (lower.endsWith("/models")) {
    return trimmed.slice(0, -"/models".length);
  }
  return trimmed;
}
