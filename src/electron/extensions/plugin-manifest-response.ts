export type PluginManifestResponseErrorCode =
  | "plugin_manifest_expected_json"
  | "plugin_manifest_invalid_json";

export type PluginManifestResponseResult =
  | { ok: true; data: unknown }
  | {
      ok: false;
      errorCode: PluginManifestResponseErrorCode;
      error: string;
    };

export function parsePluginManifestResponse(
  body: string,
  contentType = "",
): PluginManifestResponseResult {
  const normalizedContentType = contentType.toLowerCase();
  const trimmedBody = body.trimStart();
  const returnedHtml =
    normalizedContentType.includes("text/html") ||
    /^<!doctype\s+html\b/i.test(trimmedBody) ||
    /^<html\b/i.test(trimmedBody);

  if (returnedHtml) {
    return {
      ok: false,
      errorCode: "plugin_manifest_expected_json",
      error:
        "This URL returned a web page instead of neoworker.plugin.json. Use a direct plugin manifest or Git repository URL. ClawHub skill pages must be installed as skills.",
    };
  }

  try {
    return { ok: true, data: JSON.parse(body) as unknown };
  } catch {
    return {
      ok: false,
      errorCode: "plugin_manifest_invalid_json",
      error:
        "This URL did not return a valid neoworker.plugin.json manifest.",
    };
  }
}
