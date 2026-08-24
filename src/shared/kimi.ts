export const KIMI_CHINA_BASE_URL = "https://api.moonshot.cn/v1";
export const KIMI_INTERNATIONAL_BASE_URL = "https://api.moonshot.ai/v1";

export const KIMI_OFFICIAL_BASE_URLS = [
  KIMI_CHINA_BASE_URL,
  KIMI_INTERNATIONAL_BASE_URL,
] as const;

export type KimiConnectionErrorCode =
  | "missing_key"
  | "invalid_key"
  | "network"
  | "no_models"
  | "unknown";

export interface KimiConnectionResult {
  success: boolean;
  error?: string;
  errorCode?: KimiConnectionErrorCode;
  resolvedBaseUrl?: string;
  resolvedModel?: string;
  models?: Array<{ id: string; name: string }>;
}

export function normalizeKimiApiKey(value: string | undefined): string {
  return (value || "").trim().replace(/^Bearer\s+/i, "").trim();
}

export function normalizeKimiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isOfficialKimiBaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeKimiBaseUrl(value).toLowerCase();
  return KIMI_OFFICIAL_BASE_URLS.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
}

export function getKimiEndpointCandidates(
  preferredBaseUrl?: string,
): string[] {
  const preferred = preferredBaseUrl
    ? normalizeKimiBaseUrl(preferredBaseUrl)
    : "";

  if (preferred && !isOfficialKimiBaseUrl(preferred)) {
    return [preferred];
  }

  return [preferred, ...KIMI_OFFICIAL_BASE_URLS].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
}

export function selectPreferredKimiModel(
  models: Array<{ id: string; name: string }>,
  currentModel?: string,
): string {
  const ids = models.map((model) => model.id.trim()).filter(Boolean);
  const current = currentModel?.trim();
  if (current && ids.includes(current)) return current;

  const exactPriorities = [
    "kimi-k3",
    "kimi-k2.7",
    "kimi-k2.6",
    "kimi-k2.5",
  ];
  for (const model of exactPriorities) {
    if (ids.includes(model)) return model;
  }

  const familyPriorities = ["kimi-k3", "kimi-k2.7", "kimi-k2.6", "kimi-k2"];
  for (const family of familyPriorities) {
    const match = ids.find((id) => id.startsWith(family));
    if (match) return match;
  }

  return ids[0] || current || "kimi-k3";
}
