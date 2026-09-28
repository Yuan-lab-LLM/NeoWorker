import { describe, expect, it } from "vitest";
import {
  assessPdfTextIntegrity,
  assertPdfHeadingsPresent,
  buildPDFHTML,
  contentBlocksToMarkdown,
  hasPdfUnicodeFontResources,
} from "../document-generators/pdf-generator";

describe("PDF Unicode font resources", () => {
  const type3 = "4 0 obj <</Type /Font /Subtype /Type3 /ToUnicode 41 0 R /CharProcs <</g0 39 0 R /g2C0F 40 0 R>>>> endobj";

  it("accepts macOS STFangsong glyph programs without CID font-file entries", () => {
    expect(hasPdfUnicodeFontResources(type3)).toBe(true);
    expect(hasPdfUnicodeFontResources("/ToUnicode 3 0 R /Identity-H /FontFile2 4 0 R")).toBe(true);
  });

  it("rejects missing glyph programs, missing Unicode maps and unrelated font maps", () => {
    expect(hasPdfUnicodeFontResources(type3.replace(/\/CharProcs.*?endobj/, "endobj"))).toBe(false);
    expect(hasPdfUnicodeFontResources(type3.replace("/ToUnicode 41 0 R", ""))).toBe(false);
    expect(hasPdfUnicodeFontResources(type3.replace("/ToUnicode 41 0 R", "") + " 5 0 obj <</ToUnicode 41 0 R>> endobj")).toBe(false);
    expect(hasPdfUnicodeFontResources("4 0 obj <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>> endobj")).toBe(false);
  });
});

describe("PDF generator HTML", () => {
  it("applies an explicit color to document titles and headings", () => {
    const html = buildPDFHTML({
      title: "Red report",
      titleColor: "#cc0000",
      markdown: "## Findings",
    });

    expect(html).toContain("color: #CC0000");
    expect(html).toContain("border-bottom: 2px solid #CC0000");
  });

  it("does not duplicate a matching leading markdown title", () => {
    const title = "商务部沟通材料分析报告";
    const html = buildPDFHTML({
      title,
      markdown: `# ${title}\n\n## 核心论点`,
    });

    expect(html.match(new RegExp(title, "g"))).toHaveLength(2);
    expect(html).toContain(`<h1 class="doc-title">${title}</h1>`);
    expect(html).not.toContain(`<h1>${title}</h1>`);
  });

  it("renders Chinese GFM content with an explicit CJK font stack", () => {
    const html = buildPDFHTML({
      title: "商务部沟通材料分析报告",
      markdown: ["| 指标 | 数据 |", "| --- | --- |", "| 国内 Token 日消耗量 | 180 万亿 |"].join(
        "\n",
      ),
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('font-family: "NeoWorker FangSong"');
    expect(html).toContain('local("STFangsong")');
    expect(html).toContain("<table>");
    expect(html).toContain("国内 Token 日消耗量");
    expect(html).not.toContain("| 指标 | 数据 |");
  });

  it("renders the professional report cover and editorial body system", () => {
    const reportHtml = buildPDFHTML({
      title: "2026年半年度总结材料分析报告",
      subtitle: "管理层决策参考",
      author: "郭磊",
      organization: "人工智能与高性能软件产品部",
      reportDate: "2026年8月23日",
      templateId: "neoworker-docx-business-report",
      markdown: "# 一、执行摘要\n\n## 1.1 核心判断\n\n正文内容。",
    });
    expect(reportHtml).toContain('class="report-cover"');
    expect(reportHtml).toContain('class="cover-title">2026年半年度总结材料分析报告');
    expect(reportHtml).toContain("background: #1F4E78");
    expect(reportHtml).toContain('class="report-body"');
    expect(reportHtml).not.toContain('class="doc-title"');
  });

  it("uses restrained academic typography and removes a translation-qualified duplicate title", () => {
    const html = buildPDFHTML({ title: "PASTABench：代理安全性（简体中文全文翻译）", markdown: "# PASTABench：代理安全性\n\n## 摘要\n\n研究正文。" });
    expect(html).toContain('font-family: "NeoWorker Times", "NeoWorker FangSong"');
    expect(html).toContain('local("Times New Roman")');
    expect(html).not.toContain('<h1>PASTABench：代理安全性</h1>');
    expect(html).toContain('border-bottom: 2px solid #2563eb');
    expect(html).not.toContain('border: 0; padding-bottom: 0');
    expect(html).not.toContain('background: #f8f8f8');
  });

  it("does not execute raw HTML from Markdown", () => {
    const html = buildPDFHTML({ markdown: '<script>alert("x")</script>' });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves structured lists and tables when routing create_document to Chromium", () => {
    const markdown = contentBlocksToMarkdown([
      { type: "heading", text: "航班明细", level: 2 },
      { type: "list", items: ["首都机场 T2", "大兴机场" ] },
      {
        type: "table",
        rows: [
          ["航班号", "起飞时间"],
          ["CA1301", "10:25"],
        ],
      },
    ]);

    expect(markdown).toContain("## 航班明细");
    expect(markdown).toContain("- 首都机场 T2");
    expect(markdown).toContain("| 航班号 | 起飞时间 |");
    expect(markdown).toContain("| CA1301 | 10:25 |");
  });

  it("rejects the exact WinAnsi CJK corruption previously published as a successful PDF", () => {
    const integrity = assessPdfTextIntegrity(
      "北京到广州航班明细，包含航班号、机场航站楼和起降时刻。",
      "SN¬ !’ ^•]Þ‚*síf~Æb¥TJ gå‹âeågÿ2026 ÞQqg NŒ0‚*síf~Æˆh N0QúSÑg",
    );

    expect(integrity.passed).toBe(false);
    expect(integrity.message).toMatch(/mojibake|lost Chinese/i);
  });

  it("accepts a readable Chinese text layer with broad character coverage", () => {
    const text = "北京到广州航班明细，包含航班号、机场航站楼和起降时刻。";
    expect(assessPdfTextIntegrity(text, text).passed).toBe(true);
  });
});

it("embeds manuscript-relative images and rejects missing or escaping images before rendering", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-images-"));
  try {
    fs.mkdirSync(path.join(root, "drafts"));
    fs.mkdirSync(path.join(root, "images"));
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    fs.writeFileSync(path.join(root, "images", "中文 图.png"), bytes);
    const options = { imageBasePath: fs.realpathSync.native(path.join(root, "drafts")), imageRootPath: root };
    const html = buildPDFHTML({ ...options, markdown: "![原图](<../images/中文 图.png>)" });
    expect(html).toContain(`src="data:image/png;base64,${bytes.toString("base64")}"`);
    expect(html).not.toContain('src="../');
    expect(() => buildPDFHTML({ ...options, markdown: "![missing](gone.png)" })).toThrow();
    fs.symlinkSync(os.tmpdir(), path.join(root, "escape"));
    expect(() => buildPDFHTML({ ...options, markdown: "![escape](../../outside.png)" })).toThrow();
    expect(() => buildPDFHTML({ ...options, markdown: "![remote](https://example.com/image.png)" })).toThrow("local file");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("rejects missing final PDF headings even when the body remains readable", () => {
  expect(() => assertPdfHeadingsPresent(["中文图片交付验证"], "这是一份包含原始图片的中文文档。"))
    .toThrow("missing a heading");
  expect(() => assertPdfHeadingsPresent(["中文图片交付验证"], "中⽂ 图⽚ 交付 验证\n正文内容"))
    .not.toThrow();
});

it("checks math headings without requiring PDF glyph order to match visual order", () => {
  const heading = { prose: ["附录 D ORIG 与 NOISE 下的逐模型 ", " 与 ", " 轨迹"], math: ["σ1\u200b", "Δ"] };
  const text = "附 录 D ORIG 与 NOISE 下 的 逐 模 型 与 轨 迹 正文 σ 1 Δ";
  expect(() => assertPdfHeadingsPresent([heading], text)).not.toThrow();
  expect(() => assertPdfHeadingsPresent([heading], text.replace("轨 迹", ""))).toThrow("missing a heading");
  expect(() => assertPdfHeadingsPresent([heading], text.replace("Δ", ""))).toThrow("missing a heading");
});
