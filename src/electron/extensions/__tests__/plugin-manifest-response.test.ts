import { describe, expect, it } from "vitest";

import { parsePluginManifestResponse } from "../plugin-manifest-response";

describe("parsePluginManifestResponse", () => {
  it("rejects HTML pages with an actionable error instead of a JSON parser leak", () => {
    expect(
      parsePluginManifestResponse(
        "<!DOCTYPE html><html><body>ClawHub</body></html>",
        "text/html; charset=utf-8",
      ),
    ).toEqual({
      ok: false,
      errorCode: "plugin_manifest_expected_json",
      error:
        "This URL returned a web page instead of neoworker.plugin.json. Use a direct plugin manifest or Git repository URL. ClawHub skill pages must be installed as skills.",
    });
  });

  it("reports malformed manifests without exposing JSON.parse internals", () => {
    expect(parsePluginManifestResponse("{not-json}", "application/json")).toEqual({
      ok: false,
      errorCode: "plugin_manifest_invalid_json",
      error: "This URL did not return a valid neoworker.plugin.json manifest.",
    });
  });

  it("accepts a JSON manifest even when the server uses a generic content type", () => {
    expect(
      parsePluginManifestResponse('{"name":"example"}', "text/plain"),
    ).toEqual({ ok: true, data: { name: "example" } });
  });
});
