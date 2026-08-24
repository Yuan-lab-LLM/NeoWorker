import { describe, expect, it } from "vitest";
import {
  assessPdfTextIntegrity,
  buildPDFHTML,
  contentBlocksToMarkdown,
} from "../document-generators/pdf-generator";

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
    expect(html).toContain('font-family: "NeoWorker CJK"');
    expect(html).toContain('local("Hiragino Sans GB")');
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
