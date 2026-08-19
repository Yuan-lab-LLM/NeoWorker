import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../FileViewer.tsx", import.meta.url)),
  "utf8",
);
const rendererIndexSource = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);
const electronMainSource = readFileSync(
  fileURLToPath(new URL("../../../electron/main.ts", import.meta.url)),
  "utf8",
);

describe("file preview recovery", () => {
  it("offers both an in-place retry and opening the original file", () => {
    expect(source).toContain('t("fileViewer.retryPreview", "重试预览")');
    expect(source).toContain("onClick={() => void loadFile()}");
    expect(source).toContain("onClick={handleOpenExternal}");
    expect(source).toContain(
      't("fileViewer.openWithDefaultApp", "Open with Default App")',
    );
  });

  it("allows tokenized local HTML pages to load inside the artifact iframe", () => {
    expect(rendererIndexSource).toContain("frame-src 'self' web-preview:;");
    expect(electronMainSource).toContain("\"frame-src 'self' web-preview:; \"");
  });
});
