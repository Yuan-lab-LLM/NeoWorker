import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolveBundledOfficeCliExecutable } from "../../../utils/officecli-runtime";
import { runOfficeDocumentQualityCheck } from "../../../utils/office-document-quality";
import { buildAndPublishOfficeArtifact } from "../../../utils/office-artifact-publisher";
import { OfficeCliArtifactBuilder } from "../officecli-artifact-builder";

const execFileAsync = promisify(execFile);

async function validate(executable: string, filePath: string): Promise<void> {
  const { stdout } = await execFileAsync(executable, ["validate", filePath, "--json"], {
    encoding: "utf8",
  });
  expect(JSON.parse(stdout)).toMatchObject({ success: true });
}

describe("OfficeCliArtifactBuilder integration", () => {
  const executable = resolveBundledOfficeCliExecutable({ cwd: process.cwd() });
  const maybeIt = executable ? it : it.skip;

  maybeIt("generates valid DOCX, XLSX, and PPTX files with the bundled OfficeCLI", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-officecli-artifacts-"));
    const builder = new OfficeCliArtifactBuilder();
    const docxPath = path.join(tempDir, "report.docx");
    const xlsxPath = path.join(tempDir, "analysis.xlsx");
    const pptxPath = path.join(tempDir, "strategy.pptx");

    await builder.createDocument(docxPath, [
      { type: "heading", text: "经营分析报告", level: 1 },
      { type: "paragraph", text: "本报告由 NeoWorker 的 Office工具生成。" },
      { type: "heading", text: "核心结论", level: 2 },
      { type: "list", text: "", items: ["收入保持增长", "现金流持续改善"] },
      { type: "table", text: "关键指标", rows: [["指标", "本期"], ["收入", "128.5"]] },
    ]);
    await builder.createSpreadsheet(xlsxPath, [
      { name: "经营分析", data: [["指标", "本期"], ["收入", 128.5], ["合计", "=SUM(B2:B2)"]] },
    ]);
    await builder.createPresentation(
      pptxPath,
      [
        { title: "2026 年经营策略", slideType: "cover", subtitle: "管理层汇报" },
        { title: "三项关键判断", content: ["收入增长", "效率提升", "风险可控"] },
        {
          title: "关键指标",
          slideType: "table",
          data: {
            headers: ["指标", "本期"],
            rows: [["收入", 128.5], ["现金流", 32.1]],
          },
        },
        {
          title: "结论与下一步",
          slideType: "closing",
          content: [
            "结论：业务基本面保持稳健，但短期仍需管理需求波动与交付节奏。",
            "行动：优先推进高价值客户验证、优化重点场景方案，并按周复盘转化质量。",
            "风险：持续关注成本、现金流和关键供应约束，重大偏差及时升级处理。",
          ],
        },
      ],
      { visualMode: "premium", title: "2026 年经营策略" },
    );

    await expect(fs.stat(docxPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(xlsxPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(fs.stat(pptxPath)).resolves.toMatchObject({ size: expect.any(Number) });
    await validate(executable!, docxPath);
    await validate(executable!, xlsxPath);
    await validate(executable!, pptxPath);
    const docxQuality = await runOfficeDocumentQualityCheck(docxPath, {
      executable: executable!,
      renderPreview: false,
    });
    expect(docxQuality.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Body paragraph missing first-line indent",
        }),
      ]),
    );
    const pptxQuality = await runOfficeDocumentQualityCheck(pptxPath, {
      executable: executable!,
      renderPreview: false,
    });
    expect(pptxQuality.status).toBe("passed");
  }, 60_000);

  maybeIt("keeps long PPT Master closing copy within the slide bounds", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-ppt-master-closing-"));
    const pptxPath = path.join(tempDir, "flight-brief.pptx");
    const builder = new OfficeCliArtifactBuilder();

    await builder.createPresentation(
      pptxPath,
      [
        {
          title: "北京 → 沈阳 · 周六航班概览",
          slideType: "cover",
          subtitle: "代表性排班示例 · 请以实时数据为准",
        },
        {
          title: "数据说明",
          slideType: "closing",
          subtitle: "请以实时数据为准",
          content: [
            "本演示基于常规周六排班整理代表性示例，不构成实时航班或票价承诺。",
            "出发前请通过航空公司官方渠道核验班次、价格、航站楼及行李规则。",
            "天气、流量控制与临时调机均可能造成时刻变化，请预留充足衔接时间。",
          ],
        },
      ],
      { generationMode: "ppt-master", presentationWorkflow: "ppt-master" },
    );

    const quality = await runOfficeDocumentQualityCheck(pptxPath, {
      executable: executable!,
      renderPreview: false,
    });
    expect(quality.status).toBe("passed");
    expect(quality.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining("text overflow") }),
      ]),
    );
  }, 60_000);

  maybeIt("publishes DOCX blocks with advisory mixed-language content and preserves every bullet", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-officecli-list-publish-"));
    const builder = new OfficeCliArtifactBuilder();
    const requestedPath = path.join(tempDir, "list-report.docx");
    const published = await buildAndPublishOfficeArtifact({
      workspacePath: tempDir,
      requestedPath,
      expectation: { format: "docx", minimumTextCharacters: 1 },
      build: (stagingPath) =>
        builder.createDocument(stagingPath, [
          { type: "heading", text: "经营分析报告", level: 1 },
          { type: "heading", text: "核心结论", level: 2 },
          {
            type: "paragraph",
            text: "空气质量轻度污染，PM2.5 为 52.6 μg/m³；数据来自 Open-Meteo。",
          },
          {
            type: "list",
            text: "",
            items: ["收入保持增长", "现金流持续改善", "风险总体可控"],
          },
        ]),
      inspect: (stagingPath) =>
        runOfficeDocumentQualityCheck(stagingPath, {
          executable: executable!,
          renderPreview: true,
        }),
    });

    const { stdout } = await execFileAsync(
      executable!,
      ["get", published.path, "/body", "--json"],
      { encoding: "utf8" },
    );
    expect(stdout).toContain("收入保持增长");
    expect(stdout).toContain("现金流持续改善");
    expect(stdout).toContain("风险总体可控");
    expect(stdout).toContain("Open-Meteo");
    expect(published.qualityCheck.validation?.passed).toBe(true);
    expect(published.qualityCheck.visual?.passed).toBe(true);
    expect(published.qualityCheck.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "Body paragraph missing first-line indent",
        }),
      ]),
    );
  }, 60_000);
});
