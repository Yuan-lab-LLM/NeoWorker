import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVersionedOutputPath } from "../versioned-output-path";

describe("resolveVersionedOutputPath", () => {
  it("keeps the requested name when it is available", () => {
    expect(resolveVersionedOutputPath("/workspace/report.pptx", () => false)).toBe(
      "/workspace/report.pptx",
    );
  });

  it("increments the suffix without overwriting earlier artifacts", () => {
    const existing = new Set([
      path.normalize("/workspace/report.pptx"),
      path.normalize("/workspace/report-v2.pptx"),
    ]);

    expect(resolveVersionedOutputPath("/workspace/report.pptx", (value) => existing.has(value))).toBe(
      path.normalize("/workspace/report-v3.pptx"),
    );
  });

  it("continues an explicitly versioned filename", () => {
    const existing = new Set([path.normalize("/workspace/分析报告-v4.docx")]);

    expect(
      resolveVersionedOutputPath("/workspace/分析报告-v4.docx", (value) => existing.has(value)),
    ).toBe(path.normalize("/workspace/分析报告-v5.docx"));
  });
});

