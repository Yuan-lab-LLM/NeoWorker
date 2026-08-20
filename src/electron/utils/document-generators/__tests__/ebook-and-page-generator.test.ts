import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generateEPUB } from "../epub-generator";
import { generateLandingPage } from "../html-page-generator";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `neoworker-docgen-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe("ebook and landing page generators", () => {
  it("writes a valid EPUB package", async () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, "novel.epub");

    const result = await generateEPUB(outputPath, {
      title: "Test Novel",
      author: "NeoWorker",
      chapters: [
        { title: "Chapter 1", content: "# One\nThis is chapter one." },
        { title: "Chapter 2", content: "# Two\nThis is chapter two." },
      ],
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);

    const zip = await JSZip.loadAsync(fs.readFileSync(outputPath));
    expect(zip.file("mimetype")).toBeTruthy();
    expect(zip.file("OEBPS/content.opf")).toBeTruthy();
    expect(zip.file("OEBPS/nav.xhtml")).toBeTruthy();
    expect(zip.file("OEBPS/chapter-001.xhtml")).toBeTruthy();
  });

  it("writes a standalone landing page", async () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, "index.html");

    const result = await generateLandingPage(outputPath, {
      title: "Test Novel",
      subtitle: "A fiction project",
      description: "A short landing page for a story pipeline.",
      author: "NeoWorker",
      badge: "Novelist",
      callToAction: { label: "Read more", href: "#details" },
      sections: [{ title: "Overview", content: "This is a story project." }],
    });

    expect(result.success).toBe(true);
    const html = fs.readFileSync(outputPath, "utf8");
    expect(html).toContain("Test Novel");
    expect(html).toContain("A fiction project");
    expect(html).toContain("Novelist");
    expect(html).toContain('href="#details"');
  });

  it("blocks unsafe links in generated landing pages", async () => {
    const dir = makeTempDir();
    const outputPath = path.join(dir, "index.html");

    await generateLandingPage(outputPath, {
      title: "Safe Links",
      callToAction: { label: "Click me", href: "javascript:alert(1)" },
      sections: [{ title: "Overview", content: "[Open docs](javascript:alert(2))" }],
    });

    const html = fs.readFileSync(outputPath, "utf8");
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).not.toContain("javascript:alert(2)");
    expect(html).toContain('href="#"');
  });
});
