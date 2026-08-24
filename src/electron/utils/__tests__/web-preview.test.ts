import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildWebPagePreviewFromPath } from "../web-preview";

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-web-preview-test-"));
});

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

describe("web page preview extraction", () => {
  it("returns a tokenized local preview URL that keeps page assets available", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(path.join(workspace, "styles.css"), "body { color: teal; }");
    const htmlPath = path.join(workspace, "index.html");
    await fs.writeFile(
      htmlPath,
      '<!doctype html><link rel="stylesheet" href="styles.css"><main>Hello</main>',
    );

    const preview = await buildWebPagePreviewFromPath(htmlPath, workspace);

    expect(preview.canPreview).toBe(true);
    expect(preview.format).toBe("html");
    expect(preview.previewMode).toBe("sandboxed_iframe");
    expect(preview.previewUrl).toMatch(/^web-preview:\/\//);
    expect(preview.htmlContent).toContain('href="styles.css"');
  });

  it("accepts a canonical file path inside a symlinked workspace path", async () => {
    const realWorkspace = path.join(tempRoot, "real-workspace");
    const linkedWorkspace = path.join(tempRoot, "linked-workspace");
    await fs.mkdir(realWorkspace, { recursive: true });
    await fs.symlink(
      realWorkspace,
      linkedWorkspace,
      process.platform === "win32" ? "junction" : "dir",
    );
    const linkedHtmlPath = path.join(linkedWorkspace, "report.html");
    await fs.writeFile(linkedHtmlPath, "<main>Canonical path preview</main>");
    const canonicalHtmlPath = await fs.realpath(linkedHtmlPath);

    const preview = await buildWebPagePreviewFromPath(canonicalHtmlPath, linkedWorkspace);

    expect(preview.canPreview).toBe(true);
    expect(preview.previewUrl).toMatch(/^web-preview:\/\//);
    expect(preview.htmlContent).toContain("Canonical path preview");
  });

  it("resolves built React output from common build directories", async () => {
    const workspace = path.join(tempRoot, "workspace");
    const project = path.join(workspace, "app");
    await fs.mkdir(path.join(project, "dist"), { recursive: true });
    await fs.writeFile(
      path.join(project, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: { vite: "^5.0.0" } }),
    );
    await fs.writeFile(path.join(project, "dist", "index.html"), "<main>Built app</main>");

    const preview = await buildWebPagePreviewFromPath(project, workspace);

    expect(preview.canPreview).toBe(true);
    expect(preview.framework).toBe("vite");
    expect(preview.sourcePath).toBe(path.join(project, "dist", "index.html"));
    expect(preview.htmlContent).toContain("Built app");
  });

  it("returns a structured unavailable preview for React projects without built output", async () => {
    const workspace = path.join(tempRoot, "workspace");
    const project = path.join(workspace, "app");
    await fs.mkdir(project, { recursive: true });
    await fs.writeFile(
      path.join(project, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0" } }),
    );

    const preview = await buildWebPagePreviewFromPath(project, workspace);

    expect(preview.canPreview).toBe(false);
    expect(preview.framework).toBe("react");
    expect(preview.previewMessage).toContain("no built index.html");
  });
});
