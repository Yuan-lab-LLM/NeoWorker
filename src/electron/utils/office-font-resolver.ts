export interface OfficeFontPlan {
  locale: "zh-CN" | "en-US";
  platform: NodeJS.Platform;
  body: string;
  heading: string;
  eastAsia: string;
  monospace: string;
  serif: string;
  substitutions: Array<{ requested: string; resolved: string }>;
}

export interface OfficeFontResolutionOptions {
  language?: string;
  platform?: NodeJS.Platform;
  availableFonts?: Iterable<string>;
  requested?: Partial<Pick<OfficeFontPlan, "body" | "heading" | "eastAsia" | "monospace" | "serif">>;
}

const PLATFORM_CANDIDATES: Record<
  "darwin" | "win32" | "linux",
  Pick<OfficeFontPlan, "body" | "heading" | "eastAsia" | "monospace" | "serif">
> = {
  darwin: {
    body: "Helvetica Neue",
    heading: "Helvetica Neue",
    eastAsia: "PingFang SC",
    monospace: "SFMono-Regular",
    serif: "Songti SC",
  },
  win32: {
    body: "Arial",
    heading: "Arial",
    eastAsia: "Microsoft YaHei",
    monospace: "Consolas",
    serif: "SimSun",
  },
  linux: {
    body: "Liberation Sans",
    heading: "Liberation Sans",
    eastAsia: "Noto Sans CJK SC",
    monospace: "Liberation Mono",
    serif: "Noto Serif CJK SC",
  },
};

const FALLBACKS = {
  body: ["Aptos", "Arial", "Helvetica Neue", "Liberation Sans", "DejaVu Sans"],
  heading: ["Aptos Display", "Arial", "Helvetica Neue", "Liberation Sans", "DejaVu Sans"],
  eastAsia: [
    "PingFang SC",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "Noto Sans SC",
    "Source Han Sans SC",
    "Hiragino Sans GB",
    "Arial Unicode MS",
  ],
  monospace: ["SFMono-Regular", "Consolas", "Liberation Mono", "DejaVu Sans Mono"],
  serif: ["Songti SC", "SimSun", "Noto Serif CJK SC", "Georgia", "Times New Roman"],
} as const;

function supportedPlatform(platform: NodeJS.Platform): "darwin" | "win32" | "linux" {
  return platform === "darwin" || platform === "win32" ? platform : "linux";
}

function chooseFont(
  requested: string,
  candidates: readonly string[],
  available: Map<string, string> | null,
): { font: string; substituted: boolean } {
  if (!available) return { font: requested, substituted: false };
  const requestedMatch = available.get(requested.toLocaleLowerCase());
  if (requestedMatch) return { font: requestedMatch, substituted: false };
  for (const candidate of candidates) {
    const match = available.get(candidate.toLocaleLowerCase());
    if (match) return { font: match, substituted: match !== requested };
  }
  // Office applications still apply their own fallback. Keep a platform-safe
  // family name instead of emitting a random file-name-derived font family.
  return { font: requested, substituted: false };
}

export function resolveOfficeFontPlan(
  options: OfficeFontResolutionOptions = {},
): OfficeFontPlan {
  const platform = options.platform || process.platform;
  const defaults = PLATFORM_CANDIDATES[supportedPlatform(platform)];
  const available = options.availableFonts
    ? new Map(
        Array.from(options.availableFonts)
          .map((font) => String(font || "").trim())
          .filter(Boolean)
          .map((font) => [font.toLocaleLowerCase(), font]),
      )
    : null;
  const substitutions: OfficeFontPlan["substitutions"] = [];
  const resolve = (key: keyof typeof FALLBACKS): string => {
    const requested = options.requested?.[key] || defaults[key];
    const selection = chooseFont(requested, FALLBACKS[key], available);
    if (selection.substituted) {
      substitutions.push({ requested, resolved: selection.font });
    }
    return selection.font;
  };
  return {
    locale: /^en(?:-|$)/i.test(options.language || "") ? "en-US" : "zh-CN",
    platform,
    body: resolve("body"),
    heading: resolve("heading"),
    eastAsia: resolve("eastAsia"),
    monospace: resolve("monospace"),
    serif: resolve("serif"),
    substitutions,
  };
}

export function containsOfficeMojibake(value: string): boolean {
  return /\uFFFD|ï¿½|(?:Ã.|Â.){2,}|(?:�){1,}/u.test(String(value || ""));
}

