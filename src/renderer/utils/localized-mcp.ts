import { getCurrentLanguage, translate, type SupportedLanguage } from "../i18n";

export interface LocalizableMcpServer {
  id?: string;
  name: string;
  description?: string;
}

const MCP_NAME_ALIASES: Record<string, string> = {
  postgresql: "postgres",
  "everything-demo": "everything",
  "monday-com": "monday",
  "hugging-face": "huggingface",
  "cloudflare-developer-platform": "cloudflare",
  "cal-com": "calcom",
  "lseg-refinitiv": "lseg",
  "s-p-global": "spglobal",
  "mt-newswires": "mtnewswires",
  "common-room": "commonroom",
  "tribe-ai": "tribeai",
};

function normalizeMcpIdentity(value?: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getMcpDescriptionKey(server: LocalizableMcpServer): string {
  // Installed MCP configs use UUIDs and some older configs use custom ids, so
  // the stable product name is a more reliable localization identity.
  const identity =
    normalizeMcpIdentity(server.name) || normalizeMcpIdentity(server.id);
  return MCP_NAME_ALIASES[identity] || identity;
}

export function getLocalizedMcpServerDescription(
  server: LocalizableMcpServer,
  language: SupportedLanguage = getCurrentLanguage(),
): string {
  const original = String(server.description || "").trim();
  if (language === "en") {
    return (
      original || `Connect ${server.name} to provide external tools and data.`
    );
  }

  const key = getMcpDescriptionKey(server);
  const localized = translate(`connectors.description.${key}`, "").trim();
  if (localized) return localized;

  // Custom and newly-added MCP services must not leak raw English copy into
  // the Chinese interface before a dedicated translation is added.
  return translate(
    "connectors.customDescription",
    "{name} MCP service, providing external tools and data to NeoWorker.",
    { name: server.name },
  );
}
