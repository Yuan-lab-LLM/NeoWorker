import { describe, expect, it } from "vitest";
import { pageTranslationBatches, parsePageTranslations } from "../browser-page-translation";

describe("page translation model boundary", () => {
  const source = [
    { id: 0, text: "Hello" },
    { id: 1, text: "World" },
  ];
  it("accepts reordered IDs and treats HTML-looking output as text", () => {
    expect(
      parsePageTranslations(
        '```json\n[{"id":1,"text":"世界"},{"id":0,"text":"<b>你好</b>"}]\n```',
        source,
      ),
    ).toEqual([
      { id: 1, text: "世界" },
      { id: 0, text: "<b>你好</b>" },
    ]);
  });
  it.each([
    "[]",
    '[{"id":0,"text":"你好"}]',
    '[{"id":0,"text":"你好"},{"id":0,"text":"世界"}]',
    '[{"id":0,"text":"你好"},{"id":2,"text":"世界"}]',
    '[{"id":0,"text":""},{"id":1,"text":"世界"}]',
    '[{"id":"0","text":"你好"},{"id":1,"text":"世界"}]',
    "not JSON",
  ])("rejects missing, duplicate, foreign, or malformed segments: %s", (raw) => {
    expect(() => parsePageTranslations(raw, source)).toThrow();
  });
  it("does not silently truncate a long document when batching", () => {
    const rows = Array.from({ length: 155 }, (_, id) => ({ id, text: "word ".repeat(30) }));
    const batches = pageTranslationBatches(rows);
    expect(batches.flat()).toEqual(rows);
    expect(
      batches.every(
        (batch) =>
          batch.length <= 50 && batch.reduce((sum, row) => sum + row.text.length, 0) <= 4500,
      ),
    ).toBe(true);
  });
  it("rejects untranslated prose", () => {
    const rows = [{ id: 0, text: "English prose ".repeat(12) }];
    expect(() => parsePageTranslations(JSON.stringify(rows), rows)).toThrow("未返回中文");
  });
});
