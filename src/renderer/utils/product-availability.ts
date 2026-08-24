import {
  isSkillVisibleForCurrentModelSupport,
  type SkillCapabilityCandidate,
} from "./model-capability-visibility";

/**
 * Communication channels intentionally exposed in the current NeoWorker release.
 * Entry points outside Settings must use this same list so hidden legacy channels
 * cannot leak back into Quick Start, Ideas, or Skills.
 */
export const CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER = [
  "weixin",
  "wecom",
  "dingtalk",
  "feishu",
  "email",
] as const;

export type CurrentProductCommunicationChannel =
  (typeof CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER)[number];

const CURRENT_PRODUCT_COMMUNICATION_CHANNELS = new Set<string>(
  CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER,
);

const REMOVED_VIDEO_SKILL_IDS = new Set([
  "gsap",
  "hyperframes",
  "hyperframes-cli",
  "hyperframes-registry",
  "manim-video",
  "video-frames",
  "youtube",
]);

const VIDEO_SKILL_PATTERNS = [
  /\bvideo\b/,
  /\byoutube\b/,
  /\bhyperframes?\b/,
  /\bmanim\b/,
] as const;

/**
 * Service-specific skills that are not a sensible default for the mainland-
 * China-first product surface.  The implementations stay bundled so an
 * enterprise distribution can opt back in later; the consumer catalogue must
 * not advertise them as immediately usable.
 */
const CURRENTLY_HIDDEN_MAINLAND_SKILL_IDS = new Set([
  "bird",
  "codex-cli",
  "crypto-execution",
  "crypto-trading",
  "gemini",
  "gog",
  "goplaces",
  "last30days",
  "polymarket",
  "spotify-player",
  "tax-optimizer",
  "twitter",
  "youtube",
]);

/**
 * These packs are upstream US/EU legal workflows.  They remain installed for
 * compatibility, but presenting them as generic Chinese legal capabilities is
 * unsafe until NeoWorker exposes jurisdiction selection and Chinese-law
 * sources.
 */
const CURRENTLY_HIDDEN_OVERSEAS_LEGAL_PACK_IDS = new Set([
  "ai-governance-legal-pack",
  "cocounsel-legal-pack",
  "commercial-legal-pack",
  "corporate-legal-pack",
  "employment-legal-pack",
  "ip-legal-pack",
  "law-student-pack",
  "legal-builder-hub-pack",
  "legal-clinic-pack",
  "litigation-legal-pack",
  "privacy-legal-pack",
  "product-legal-pack",
  "regulatory-legal-pack",
]);

const CURRENTLY_HIDDEN_OVERSEAS_LEGAL_SKILL_PREFIXES = [
  "ai-governance-legal-",
  "cocounsel-legal-",
  "commercial-legal-",
  "corporate-legal-",
  "employment-legal-",
  "ip-legal-",
  "law-student-",
  "legal-builder-hub-",
  "legal-clinic-",
  "litigation-legal-",
  "privacy-legal-",
  "product-legal-",
  "regulatory-legal-",
] as const;

/**
 * Marketplace entries hidden from an unconfigured mainland-first install.
 * Connected entries are still shown by ConnectorsSettings so this never
 * removes or strands an existing user configuration.
 */
const CURRENTLY_HIDDEN_PRODUCT_INTEGRATIONS = new Set([
  "aiera",
  "chronograph",
  "codex",
  "daloopa",
  "discord",
  "dropbox",
  "egnyte",
  "factset",
  "gemini",
  "gmail",
  "gog",
  "google",
  "google-workspace",
  "googleworkspace",
  "lseg",
  "moodys",
  "morningstar",
  "mtnewswires",
  "openai",
  "pitchbook",
  "spglobal",
  "spotify",
  "twitter",
  "x",
  "youtube",
]);

const CURRENTLY_HIDDEN_PRODUCT_INTEGRATION_PATTERNS = [
  /\bgoogle\b/,
  /\bgmail\b/,
  /\bopenai\b/,
  /\bspotify\b/,
  /\btwitter\b/,
  /\byoutube\b/,
] as const;

const KNOWN_COMMUNICATION_CHANNELS = new Set([
  ...CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER,
  "telegram",
  "slack",
  "discord",
  "whatsapp",
  "teams",
  "microsoft-teams",
  "x",
  "twitter",
  "imessage",
  "signal",
  "googlechat",
  "google-chat",
  "line",
  "mattermost",
  "matrix",
  "twitch",
  "bluebubbles",
]);

const CHANNEL_SPECIFIC_SKILL_OVERRIDES = new Map<string, string>([
  ["slack", "slack"],
  ["wacli", "whatsapp"],
  ["imsg", "imessage"],
]);

function normalize(value: string | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

function searchableSkillText(candidate: SkillCapabilityCandidate): string {
  return [
    candidate.id,
    candidate.name,
    candidate.description,
    candidate.category,
    ...(candidate.tags || []),
    ...(candidate.metadata?.tags || []),
    candidate.metadata?.routing?.useWhen,
    candidate.metadata?.routing?.outputs,
    ...(candidate.metadata?.routing?.keywords || []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export function isCurrentProductCommunicationChannel(
  channel: string | undefined,
): channel is CurrentProductCommunicationChannel {
  return CURRENT_PRODUCT_COMMUNICATION_CHANNELS.has(normalize(channel));
}

/**
 * Whether an unconfigured integration should be advertised in the current
 * product. Callers may still show an already configured integration.
 */
export function isProductIntegrationVisible(integration: string): boolean {
  const normalized = normalize(integration);
  return (
    !CURRENTLY_HIDDEN_PRODUCT_INTEGRATIONS.has(normalized) &&
    !CURRENTLY_HIDDEN_PRODUCT_INTEGRATION_PATTERNS.some((pattern) =>
      pattern.test(normalized),
    ) &&
    (!KNOWN_COMMUNICATION_CHANNELS.has(normalized) ||
      isCurrentProductCommunicationChannel(normalized))
  );
}

export function areProductIntegrationsVisible(
  integrations: readonly string[] | undefined,
): boolean {
  return !integrations || integrations.every(isProductIntegrationVisible);
}

export function getRequiredHiddenCommunicationChannel(
  candidate: SkillCapabilityCandidate,
): string | null {
  const skillId = normalize(candidate.id);
  const override = CHANNEL_SPECIFIC_SKILL_OVERRIDES.get(skillId);
  if (override) return override;

  const text = searchableSkillText(candidate);
  const matches: Array<[RegExp, string]> = [
    [/\bslack\b/, "slack"],
    [/\bwhatsapp\b/, "whatsapp"],
    [/\btelegram\b/, "telegram"],
    [/\bdiscord\b/, "discord"],
    [/\bmicrosoft teams\b/, "teams"],
    [/\bgoogle chat\b/, "googlechat"],
    [/\bimessage\b/, "imessage"],
    [/\bsignal messenger\b/, "signal"],
  ];

  for (const [pattern, channel] of matches) {
    if (pattern.test(text) && !isCurrentProductCommunicationChannel(channel)) {
      return channel;
    }
  }
  return null;
}

export function isPluginPackVisibleForCurrentProductSupport(
  packId: string | undefined,
): boolean {
  return !CURRENTLY_HIDDEN_OVERSEAS_LEGAL_PACK_IDS.has(normalize(packId));
}

function isMainlandDefaultSkillVisible(skillId: string): boolean {
  return (
    !CURRENTLY_HIDDEN_MAINLAND_SKILL_IDS.has(skillId) &&
    !CURRENTLY_HIDDEN_OVERSEAS_LEGAL_SKILL_PREFIXES.some((prefix) =>
      skillId.startsWith(prefix),
    )
  );
}

export function isVideoSkillCandidate(
  candidate: SkillCapabilityCandidate,
): boolean {
  const skillId = normalize(candidate.id);
  if (REMOVED_VIDEO_SKILL_IDS.has(skillId)) return true;
  return VIDEO_SKILL_PATTERNS.some((pattern) =>
    pattern.test(searchableSkillText(candidate)),
  );
}

export function isSkillVisibleForCurrentProductSupport(
  candidate: SkillCapabilityCandidate,
): boolean {
  const skillId = normalize(candidate.id);
  return (
    !isVideoSkillCandidate(candidate) &&
    isSkillVisibleForCurrentModelSupport(candidate) &&
    getRequiredHiddenCommunicationChannel(candidate) === null &&
    isMainlandDefaultSkillVisible(skillId)
  );
}
