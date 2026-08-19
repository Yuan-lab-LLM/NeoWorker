import { describe, expect, it } from "vitest";
import { normalizeLegacyProductBrand } from "../legacy-product-brand";

describe("normalizeLegacyProductBrand", () => {
  it.each([
    "NovaReady",
    "Nova Ready",
    "nova-ready",
    "CoWork",
    "CoWork OS",
    "CoWork-OS",
    "CoWorkOS",
    "CrewWork",
    "QuiverReady",
  ])(
    "normalizes legacy prose brand %s",
    (brand) => {
      expect(normalizeLegacyProductBrand(`请为 ${brand} 授权。`)).toBe(
        "请为 NeoWorker 授权。",
      );
    },
  );

  it("preserves fenced code, inline code, paths, and URLs", () => {
    const input = [
      "`CoWork-OS`",
      "```text\nCoWork OS\n```",
      "/Users/demo/CoWork-OS/config.json",
      "https://example.com/CoWork-OS/docs",
    ].join("\n");

    expect(normalizeLegacyProductBrand(input)).toBe(input);
  });

  it("uses the current workspace-kit directory even inside technical text", () => {
    const input = [
      "我检查了 `.novaready` 下的全部文件。",
      "我检查了 `.cowork` 下的全部文件。",
      "旧记录位于 /Users/demo/project/.cowork/MEMORY.md。",
      "```text\n.cowork/projects/demo/CONTEXT.md\n```",
    ].join("\n");

    expect(normalizeLegacyProductBrand(input)).toBe(
      [
        "我检查了 `.neoworker` 下的全部文件。",
        "我检查了 `.neoworker` 下的全部文件。",
        "旧记录位于 /Users/demo/project/.neoworker/MEMORY.md。",
        "```text\n.neoworker/projects/demo/CONTEXT.md\n```",
      ].join("\n"),
    );
  });

  it("does not rewrite the ordinary word coworker", () => {
    expect(normalizeLegacyProductBrand("AI coworker for teams")).toBe(
      "AI coworker for teams",
    );
  });
});
