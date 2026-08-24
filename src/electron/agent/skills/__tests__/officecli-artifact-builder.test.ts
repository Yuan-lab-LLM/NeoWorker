import { describe, expect, it } from "vitest";
import { OfficeCliArtifactBuilder, type OfficeCliInvoker } from "../officecli-artifact-builder";

function createRecordingInvoker(): {
  invoker: OfficeCliInvoker;
  calls: Array<{ executable: string; args: string[]; input?: string; signal?: AbortSignal }>;
} {
  const calls: Array<{ executable: string; args: string[]; input?: string; signal?: AbortSignal }> = [];
  return {
    calls,
    invoker: async (executable, args, input, signal) => {
      calls.push({ executable, args, input, signal });
      return {
        stdout: JSON.stringify({
          success: true,
          data: args[0] === "batch" ? { summary: { failed: 0 } } : "ok",
        }),
        stderr: "",
      };
    },
  };
}

function batchCommands(calls: Array<{ args: string[]; input?: string }>): Array<Record<string, unknown>> {
  return calls
    .filter((call) => call.args[0] === "batch")
    .flatMap((call) => JSON.parse(call.input || "[]") as Array<Record<string, unknown>>);
}

describe("OfficeCliArtifactBuilder", () => {
  it("creates DOCX content through OfficeCLI with polished CJK typography", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createDocument("/tmp/report.docx", [
      { type: "heading", text: "季度报告", level: 1 },
      { type: "paragraph", text: "核心结论" },
      { type: "list", text: "", items: ["收入增长", "风险可控"] },
      { type: "table", text: "关键指标", rows: [["指标", "数值"], ["收入", "128"]] },
    ]);

    expect(calls.some((call) => call.args[0] === "load_skill" && call.args[1] === "word")).toBe(true);
    expect(calls.some((call) => call.args[0] === "create" && call.args.includes("zh-CN"))).toBe(true);
    const commands = batchCommands(calls);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "set", path: "/document" }),
        expect.objectContaining({
          command: "add",
          type: "paragraph",
          props: expect.objectContaining({
            text: "收入增长",
            listStyle: "bullet",
          }),
        }),
        expect.objectContaining({
          command: "add",
          type: "paragraph",
          props: expect.objectContaining({
            text: "风险可控",
            listStyle: "bullet",
          }),
        }),
        expect.objectContaining({ command: "add", type: "table" }),
      ]),
    );
    expect(JSON.stringify(commands)).toContain("PingFang SC");
    expect(calls.at(-1)?.args[0]).toBe("close");
  });

  it("builds report metadata, cover, contents, running header and pagination", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createDocument(
      "/tmp/professional-report.docx",
      [
        { type: "heading", text: "2026年半年度总结材料分析报告", level: 1 },
        { type: "heading", text: "一、执行摘要", level: 1 },
        { type: "paragraph", text: "本报告汇总核心结论与行动建议。" },
        { type: "heading", text: "二、经营分析", level: 1 },
        { type: "paragraph", text: "经营指标保持稳定增长。" },
        { type: "heading", text: "三、风险与建议", level: 1 },
        { type: "paragraph", text: "建议持续跟踪关键风险。" },
      ],
      {
        templateId: "neoworker-docx-business-report",
        title: "2026年半年度总结材料分析报告",
        subtitle: "管理层决策参考",
        author: "郭磊",
        organization: "人工智能与高性能软件产品部",
        reportDate: "2026年8月23日",
      },
    );

    const commands = batchCommands(calls);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: "set",
          path: "/document",
          props: expect.objectContaining({
            title: "2026年半年度总结材料分析报告",
            author: "郭磊",
            updateFields: true,
          }),
        }),
        expect.objectContaining({
          command: "add",
          parent: "/",
          type: "header",
          props: expect.objectContaining({ type: "default" }),
        }),
        expect.objectContaining({
          command: "add",
          parent: "/",
          type: "footer",
          props: expect.objectContaining({ type: "default", field: "page" }),
        }),
        expect.objectContaining({
          command: "add",
          parent: "/body",
          type: "toc",
          props: expect.objectContaining({ levels: "1-3", pageNumbers: true }),
        }),
      ]),
    );
    expect(JSON.stringify(commands)).toContain("NEOWORKER · PROFESSIONAL REPORT");
    expect(JSON.stringify(commands)).toContain('"fill":"#1F4E78"');
  });

  it("creates XLSX data through OfficeCLI and keeps formulas editable", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createSpreadsheet(
      "/tmp/model.xlsx",
      [{ name: "分析", data: [["项目", "数值"], ["收入", 100], ["合计", "=SUM(B2:B2)"]] }],
      { officialProfile: "financial-model" },
    );

    expect(calls.some((call) => call.args[0] === "load_skill" && call.args[1] === "financial-model")).toBe(true);
    const commands = batchCommands(calls);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "set", path: "/Sheet1" }),
        expect.objectContaining({ command: "set", path: "/分析/B3", props: expect.objectContaining({ formula: "SUM(B2:B2)" }) }),
      ]),
    );
    expect(JSON.stringify(commands)).toContain("#1F4E78");
  });

  it("creates widescreen PPTX slides through OfficeCLI instead of the legacy generator", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createPresentation(
      "/tmp/deck.pptx",
      [
        { title: "年度策略", slideType: "cover", subtitle: "管理层汇报" },
        { title: "关键判断", content: ["增长确定性", "现金流改善", "风险可控"] },
      ],
      {
        visualMode: "premium",
        themeColor: "176B87",
        accentColor: "F59E0B",
        officialProfile: "pitch-deck",
      },
    );

    expect(calls.some((call) => call.args[0] === "load_skill" && call.args[1] === "pitch-deck")).toBe(true);
    const commands = batchCommands(calls);
    expect(commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "set", path: "/presentation", props: expect.objectContaining({ slideSize: "widescreen" }) }),
        expect.objectContaining({ command: "add", parent: "/", type: "slide" }),
        expect.objectContaining({ command: "add", parent: "/slide[2]", type: "shape" }),
      ]),
    );
    expect(JSON.stringify(commands)).toContain("Content card 1");
    expect(JSON.stringify(commands)).toContain("INVESTOR STORY");
    expect(JSON.stringify(commands)).toContain('"size":"36pt"');
  });

  it("applies the official Morph profile and native slide transitions", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createPresentation(
      "/tmp/morph.pptx",
      [
        { title: "产品演进", slideType: "cover" },
        { title: "下一阶段", content: ["统一叙事", "连续视觉", "可编辑元素"] },
      ],
      { officialProfile: "morph-ppt" },
    );

    expect(calls.some((call) => call.args[0] === "load_skill" && call.args[1] === "morph-ppt")).toBe(true);
    const commands = batchCommands(calls);
    const morphSlides = commands.filter(
      (command) =>
        command.command === "add" &&
        command.parent === "/" &&
        command.type === "slide" &&
        (command.props as Record<string, unknown> | undefined)?.transition === "morph",
    );
    expect(morphSlides).toHaveLength(2);
  });

  it("uses the host-pinned PPT Master renderer instead of the standard card template", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createPresentation(
      "/tmp/ppt-master.pptx",
      [
        { title: "Executive story", slideType: "cover", subtitle: "Board narrative" },
        {
          title: "Headline metrics",
          slideType: "metric",
          data: {
            items: [
              { label: "ARR", value: "$128M", detail: "+32% YoY" },
              { label: "NRR", value: "118%", detail: "enterprise" },
            ],
          },
        },
        {
          title: "Revenue momentum",
          slideType: "chart",
          data: {
            categories: ["Q1", "Q2", "Q3"],
            series: [{ name: "Revenue", values: [72, 94, 128] }],
          },
        },
        {
          title: "Execution path",
          slideType: "timeline",
          data: {
            items: [
              { label: "Now", value: "Validate" },
              { label: "Next", value: "Launch" },
            ],
          },
        },
      ],
      {
        officialProfile: "morph-ppt",
        generationMode: "ppt-master",
        presentationWorkflow: "ppt-master",
      },
    );

    const commands = batchCommands(calls);
    const serialized = JSON.stringify(commands);
    expect(commands).toContainEqual(
      expect.objectContaining({
        command: "set",
        path: "/presentation",
        props: expect.objectContaining({
          subject: "PPT Master / Advanced / ppt-master",
        }),
      }),
    );
    expect(serialized).toContain("PPT Master engine mark");
    expect(serialized).toContain("PPT Master metric hero");
    expect(serialized).toContain("PPT Master metric hero value");
    expect(serialized).toContain("PPT Master metric card 2");
    expect(serialized).toContain("PPT Master chart thesis");
    expect(serialized).toContain("PPT Master chart peak");
    expect(serialized).toContain("PPT Master vertical timeline");
    expect(serialized).toContain("PPT Master canvas field");
    expect(serialized).toContain("PPT Master signature field");
    expect(serialized).not.toContain("Metric card 1");
    expect(serialized).not.toContain("Content card 1");
    expect(serialized).not.toContain("INVESTOR STORY");
    expect(serialized).not.toContain('"text":"PPT MASTER / ADVANCED"');

    const slideBackgrounds = commands
      .filter(
        (command) =>
          command.command === "add" &&
          command.parent === "/" &&
          command.type === "slide",
      )
      .map(
        (command) =>
          (command.props as Record<string, unknown> | undefined)?.background,
      );
    expect(slideBackgrounds).toEqual([
      "#101522",
      "#F7F3EB",
      "#101522",
      "#F7F3EB",
    ]);

    const morphSlides = commands.filter(
      (command) =>
        command.command === "add" &&
        command.parent === "/" &&
        command.type === "slide" &&
        (command.props as Record<string, unknown> | undefined)?.transition === "morph",
    );
    expect(morphSlides).toHaveLength(4);
  });

  it("gives PPT Master evidence, narrative, and closing slides distinct compositions", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createPresentation(
      "/tmp/ppt-master-layout-system.pptx",
      [
        { title: "Decision brief", slideType: "cover", subtitle: "Executive review" },
        {
          title: "Evidence roster",
          slideType: "table",
          data: {
            headers: ["Option", "Signal", "Decision"],
            rows: [
              ["A", "Strong", "Advance"],
              ["B", "Mixed", "Watch"],
            ],
          },
        },
        {
          title: "Operating implications",
          slideType: "content",
          content: [
            "The leading signal changes the decision frame.",
            "Protect the critical path.",
            "Sequence the next validation.",
          ],
        },
        {
          title: "Decision",
          slideType: "closing",
          content: ["Advance with a bounded pilot.", "Review the evidence in two weeks."],
        },
      ],
      { generationMode: "ppt-master", presentationWorkflow: "ppt-master" },
    );

    const commands = batchCommands(calls);
    const serialized = JSON.stringify(commands);
    expect(serialized).toContain("PPT Master evidence rail");
    expect(serialized).toContain("PPT Master evidence accent");
    expect(serialized).toContain("PPT Master narrative field");
    expect(serialized).toContain("PPT Master narrative lead");
    expect(serialized).toContain("PPT Master closing field");
    expect(serialized).toContain("PPT Master closing numeral");
    expect(serialized).not.toContain("PPT Master header rule");

    const closingAccent = commands.find(
      (command) =>
        command.command === "add" &&
        (command.props as Record<string, unknown> | undefined)?.name ===
          "PPT Master closing accent",
    );
    expect(closingAccent?.props).toEqual(
      expect.objectContaining({ y: "4.82in", height: "1.6in" }),
    );
  });

  it("renders structured PPT data as distinct editable layouts", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const builder = new OfficeCliArtifactBuilder(invoker);
    await builder.createPresentation("/tmp/structured.pptx", [
      { title: "Structured report", slideType: "cover" },
      {
        title: "Headline metrics",
        slideType: "metric",
        data: { items: [{ label: "ARR", value: 100, detail: "USDm" }] },
      },
      {
        title: "Revenue trend",
        slideType: "chart",
        data: { categories: ["H1", "H2"], series: [{ name: "Revenue", values: [80, 100] }] },
      },
      {
        title: "Peer comparison",
        slideType: "table",
        data: { headers: ["Peer", "Revenue"], rows: [["A", 100], ["B", 80]] },
      },
      {
        title: "Execution path",
        slideType: "timeline",
        data: { items: [{ label: "Now", value: "Validate" }, { label: "Next", value: "Launch" }] },
      },
    ]);

    const commands = batchCommands(calls);
    const serialized = JSON.stringify(commands);
    expect(serialized).toContain("Metric card 1");
    expect(serialized).toContain("Chart bar 1");
    expect(commands).toContainEqual(
      expect.objectContaining({ command: "add", parent: "/slide[4]", type: "table" }),
    );
    expect(serialized).toContain("Timeline rail");
    expect(serialized).not.toMatch(/"(?:line|border)":"[0-9A-Fa-f]{6}:/);
    expect(serialized).toContain('"border":"1pt solid #D8E1EB"');
  });

  it("passes the cancellation signal to every OfficeCLI operation", async () => {
    const { invoker, calls } = createRecordingInvoker();
    const controller = new AbortController();
    const builder = new OfficeCliArtifactBuilder(invoker, {
      signal: controller.signal,
    });

    await builder.createDocument("/tmp/cancellable.docx", [
      { type: "paragraph", text: "Cancellable content" },
    ]);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.signal === controller.signal)).toBe(true);
  });
});
