import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  new URL("../../styles/index.css", import.meta.url),
  "utf8",
);

describe("command output typography", () => {
  it("keeps shell commands and dense output compact", () => {
    expect(styles).toMatch(
      /\.command-output-title \.command-text\s*\{[\s\S]*?font-size:\s*11px;/,
    );
    expect(styles).toMatch(
      /\.command-output-content pre\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?line-height:\s*1\.5;/,
    );
    expect(styles).toMatch(
      /\.density-focused \.command-output-content pre\s*\{[\s\S]*?font-size:\s*11px;/,
    );
  });
});
