import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonlPreview, parseJsonlPreview } from "../JsonlPreview";

describe("JsonlPreview", () => {
  it("parses non-empty JSONL records with original line numbers", () => {
    const records = parseJsonlPreview(
      '{"level":"info","message":"ready"}\n\n{"level":"warn","message":"retry"}',
    );

    expect(records).toEqual([
      { lineNumber: 1, value: { level: "info", message: "ready" } },
      { lineNumber: 3, value: { level: "warn", message: "retry" } },
    ]);
  });

  it("returns null for malformed JSONL so callers can keep raw preview fallback", () => {
    expect(parseJsonlPreview('{"level":"info"}\nnot-json')).toBeNull();
  });

  it("renders structured rows with level, timestamp, component, and message", () => {
    const markup = renderToStaticMarkup(
      createElement(JsonlPreview, {
        content:
          '{"timestamp":"2026-05-20T08:12:00.000Z","level":"info","message":"starter content written","component":"neoworker-routine"}',
      }),
    );

    expect(markup).toContain("JSONL");
    expect(markup).toMatch(/1 (?:record|条记录)/);
    expect(markup).toContain('data-tone="info"');
    expect(markup).toContain("2026-05-20T08:12:00.000Z");
    expect(markup).toContain("neoworker-routine");
    expect(markup).toContain("starter content written");
  });
});
