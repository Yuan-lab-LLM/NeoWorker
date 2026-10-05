import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPermissionSecurityContext } from "../security/export-permission-context";
import { FileProvenanceRegistry } from "../../security/file-provenance-registry";

afterEach(() => vi.restoreAllMocks());

describe("batch vision export context", () => {
  it("includes every batch source and propagates untrusted provenance without mutating history", () => {
    vi.spyOn(FileProvenanceRegistry, "get").mockImplementation(file => ({
      path: file, sourceKind: "workspace_native", trustLevel: file.endsWith("external.png") ? "untrusted" : "trusted", recordedAt: 1,
    }));
    const history: Any[] = [];
    const context = buildPermissionSecurityContext({
      workspace: { path: "/work" } as Any,
      toolName: "analyze_image", toolInput: { paths: ["a.png", "external.png"] }, recentSensitiveSources: history,
    });
    expect(context?.recentSensitiveSources?.map(source => source.path)).toEqual(["a.png", "external.png"]);
    expect(context?.recentUntrustedContentRead).toBe(true);
    expect(history).toEqual([]);
  });
});
