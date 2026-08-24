import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PptxPreviewService } from "../PptxPreviewService";

const PNG_BYTES = Buffer.from("presentation-preview");

let tempRoot = "";

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "neoworker-pptx-preview-test-"),
  );
});

afterEach(async () => {
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

async function createDeck(filePath: string): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";

  const first = pptx.addSlide();
  first.addText("Intro", { x: 0.6, y: 0.7, w: 6, h: 0.5, fontSize: 28 });
  first.addText("Opening slide", {
    x: 0.6,
    y: 1.4,
    w: 6,
    h: 0.5,
    fontSize: 18,
  });
  first.addNotes("Presenter note A");

  const second = pptx.addSlide();
  second.addText("Findings", { x: 0.6, y: 0.7, w: 6, h: 0.5, fontSize: 28 });
  second.addText("First point\nSecond point", {
    x: 0.6,
    y: 1.4,
    w: 6,
    h: 1.5,
    fontSize: 18,
  });
  second.addNotes("Presenter note B");

  await pptx.writeFile({ fileName: filePath });
}

describe("PptxPreviewService", () => {
  it("renders non-PPTX PowerPoint files through the image fallback", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "legacy.ppt");
    await fs.writeFile(deckPath, Buffer.from("legacy powerpoint bytes"));

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: async ({ outputDir }) => {
        await fs.writeFile(path.join(outputDir, "slide-1.png"), PNG_BYTES);
        await fs.writeFile(path.join(outputDir, "slide-2.png"), PNG_BYTES);
      },
      commandRunner: async () => {
        throw new Error("converter should not be needed");
      },
    });

    const preview = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
      renderMode: "full",
    });

    expect(preview.slideCount).toBe(2);
    expect(preview.renderStatus).toBe("rendered");
    expect(preview.slides[0].imageDataUrl).toContain("data:image/png;base64,");
    expect(preview.slides[1].imageDataUrl).toContain("data:image/png;base64,");
  });

  it("returns fast text preview without rendering slide images", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);
    const calls: string[] = [];

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: async () => {
        calls.push("artifact-tool");
      },
      commandRunner: async (command) => {
        calls.push(command);
      },
    });

    const preview = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
      renderMode: "fast",
    });

    expect(preview.slideCount).toBe(2);
    expect(preview.renderStatus).toBe("rendering");
    expect(preview.slides[0].text).toContain("Intro");
    expect(preview.slides[0].imageDataUrl).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("extracts structured slide text and speaker notes", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async () => {
        throw new Error("converter unavailable");
      },
    });

    const preview = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
    });

    expect(preview.slideCount).toBe(2);
    expect(preview.renderStatus).toBe("text_only");
    expect(preview.slides[0].title).toContain("Intro");
    expect(preview.slides[0].notes).toContain("Presenter note A");
    expect(preview.slides[1].text).toContain("First point");
  });

  it("allows preview when the viewer passes a real file path for a symlinked workspace root", async () => {
    const realWorkspace = path.join(tempRoot, "workspace-real");
    const workspaceAlias = path.join(tempRoot, "workspace-alias");
    await fs.mkdir(realWorkspace, { recursive: true });
    try {
      await fs.symlink(realWorkspace, workspaceAlias, "dir");
    } catch {
      return;
    }
    const deckPath = path.join(realWorkspace, "deck.pptx");
    await createDeck(deckPath);
    const realDeckPath = await fs.realpath(deckPath);

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async () => {
        throw new Error("converter unavailable");
      },
    });

    const preview = await service.buildPreview({
      filePath: realDeckPath,
      workspaceRoot: workspaceAlias,
    });

    expect(preview.slideCount).toBe(2);
    expect(preview.renderStatus).toBe("text_only");
  });

  it("renders images once and reuses the preview cache", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);
    const calls: string[] = [];

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async (command, args) => {
        calls.push(command);
        if (command === "soffice") {
          const outDir = String(args[args.indexOf("--outdir") + 1]);
          await fs.writeFile(path.join(outDir, "deck.pdf"), "%PDF");
          return;
        }
        if (command === "pdftoppm") {
          const outputPrefix = String(args[args.length - 1]);
          await fs.writeFile(`${outputPrefix}-1.png`, PNG_BYTES);
          await fs.writeFile(`${outputPrefix}-2.png`, PNG_BYTES);
          return;
        }
      },
    });

    const first = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
    });
    const second = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
    });

    expect(first.renderStatus).toBe("rendered");
    expect(first.slides[0].imageDataUrl).toContain("data:image/png;base64,");
    expect(second.renderStatus).toBe("rendered");
    expect(calls).toEqual(["soffice", "pdftoppm"]);
  });

  it("returns cached images during fast preview when render cache exists", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);
    const calls: string[] = [];

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: async ({ outputDir }) => {
        calls.push("artifact-tool");
        await fs.writeFile(path.join(outputDir, "slide-1.png"), PNG_BYTES);
        await fs.writeFile(path.join(outputDir, "slide-2.png"), PNG_BYTES);
      },
      commandRunner: async (command) => {
        calls.push(command);
      },
    });

    await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
      renderMode: "full",
    });
    const fast = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
      renderMode: "fast",
    });

    expect(fast.renderStatus).toBe("cached");
    expect(fast.slides[0].imageDataUrl).toContain("data:image/png;base64,");
    expect(calls).toEqual(["soffice", "artifact-tool"]);
  });

  it("shares concurrent full render work for the same deck", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);
    const calls: string[] = [];

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: async ({ outputDir }) => {
        calls.push("artifact-tool");
        await new Promise((resolve) => setTimeout(resolve, 20));
        await fs.writeFile(path.join(outputDir, "slide-1.png"), PNG_BYTES);
        await fs.writeFile(path.join(outputDir, "slide-2.png"), PNG_BYTES);
      },
      commandRunner: async (command) => {
        calls.push(command);
      },
    });

    const [first, second] = await Promise.all([
      service.buildPreview({
        filePath: deckPath,
        workspaceRoot: workspace,
        renderMode: "full",
      }),
      service.buildPreview({
        filePath: deckPath,
        workspaceRoot: workspace,
        renderMode: "full",
      }),
    ]);

    expect(first.renderStatus).toBe("rendered");
    expect(second.renderStatus).toBe("rendered");
    expect(calls).toEqual(["soffice", "artifact-tool"]);
  });

  it("prefers the faster LibreOffice renderer when available", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);
    const calls: string[] = [];

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: async ({ outputDir }) => {
        calls.push("artifact-tool");
        await fs.writeFile(path.join(outputDir, "slide-1.png"), PNG_BYTES);
        await fs.writeFile(path.join(outputDir, "slide-2.png"), PNG_BYTES);
      },
      commandRunner: async (command, args) => {
        calls.push(command);
        if (command === "soffice") {
          const outDir = String(args[args.indexOf("--outdir") + 1]);
          await fs.writeFile(path.join(outDir, "deck.pdf"), "%PDF");
          return;
        }
        if (command === "pdftoppm") {
          const outputPrefix = String(args[args.length - 1]);
          await fs.writeFile(`${outputPrefix}-1.png`, PNG_BYTES);
          await fs.writeFile(`${outputPrefix}-2.png`, PNG_BYTES);
        }
      },
    });

    const preview = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
    });

    expect(preview.renderStatus).toBe("rendered");
    expect(preview.slides[0].imageDataUrl).toContain("data:image/png;base64,");
    expect(calls).toEqual(["soffice", "pdftoppm"]);
  });

  it("gives LibreOffice a private profile and a CJK-aware fontconfig", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "中文预览.pptx");
    await createDeck(deckPath);
    let sofficeArgs: string[] = [];
    let sofficeEnvironment: NodeJS.ProcessEnv | undefined;

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async (command, args, options) => {
        if (command === "soffice") {
          sofficeArgs = args;
          sofficeEnvironment = options.env;
          const outDir = String(args[args.indexOf("--outdir") + 1]);
          await fs.writeFile(path.join(outDir, "中文预览.pdf"), "%PDF");
          return;
        }
        if (command === "pdftoppm") {
          const outputPrefix = String(args[args.length - 1]);
          await fs.writeFile(`${outputPrefix}-1.png`, PNG_BYTES);
          await fs.writeFile(`${outputPrefix}-2.png`, PNG_BYTES);
        }
      },
    });

    await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
      renderMode: "full",
    });

    expect(sofficeArgs[0]).toMatch(/^-env:UserInstallation=file:\/\//);
    expect(sofficeEnvironment?.FONTCONFIG_FILE).toContain("fonts.conf");
    const fontconfig = await fs.readFile(
      String(sofficeEnvironment?.FONTCONFIG_FILE),
      "utf-8",
    );
    expect(fontconfig).toContain("PingFang SC");
    expect(fontconfig).toContain("Hiragino Sans GB");
    expect(fontconfig).toContain("Microsoft YaHei");
  });

  it("falls back to text-only preview when converters fail", async () => {
    const workspace = path.join(tempRoot, "workspace");
    await fs.mkdir(workspace, { recursive: true });
    const deckPath = path.join(workspace, "deck.pptx");
    await createDeck(deckPath);

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async () => {
        throw new Error("soffice missing");
      },
    });

    const preview = await service.buildPreview({
      filePath: deckPath,
      workspaceRoot: workspace,
    });

    expect(preview.renderStatus).toBe("text_only");
    expect(preview.renderMessage).toContain("soffice missing");
    expect(preview.slides[0].text).toContain("Intro");
  });

  it("rejects files outside the workspace", async () => {
    const workspace = path.join(tempRoot, "workspace");
    const outside = path.join(tempRoot, "outside");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    const deckPath = path.join(outside, "deck.pptx");
    await createDeck(deckPath);

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
    });

    await expect(
      service.buildPreview({
        filePath: deckPath,
        workspaceRoot: workspace,
      }),
    ).rejects.toThrow(/outside the workspace/);
  });

  it("allows a PPTX from the workspace's controlled durable mirror", async () => {
    const workspace = path.join(tempRoot, "workspace");
    const durableRoot = path.join(tempRoot, "durable", "workspace-identity");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(durableRoot, { recursive: true });
    const deckPath = path.join(durableRoot, "artifacts", "deck.pptx");
    await fs.mkdir(path.dirname(deckPath), { recursive: true });
    await createDeck(deckPath);

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
      commandRunner: async () => {
        throw new Error("soffice missing");
      },
    });

    await expect(
      service.buildPreview({
        filePath: deckPath,
        workspaceRoot: workspace,
        allowedRoots: [durableRoot],
      }),
    ).resolves.toMatchObject({ slideCount: 2 });
  });

  it("rejects symlinked PPTX files that resolve outside the workspace", async () => {
    const workspace = path.join(tempRoot, "workspace");
    const outside = path.join(tempRoot, "outside");
    await fs.mkdir(workspace, { recursive: true });
    await fs.mkdir(outside, { recursive: true });
    const deckPath = path.join(outside, "deck.pptx");
    await createDeck(deckPath);
    const linkPath = path.join(workspace, "linked.pptx");
    try {
      await fs.symlink(deckPath, linkPath);
    } catch {
      return;
    }

    const service = new PptxPreviewService({
      cacheRoot: path.join(tempRoot, "cache"),
      artifactToolRunner: null,
    });

    await expect(
      service.buildPreview({
        filePath: linkPath,
        workspaceRoot: workspace,
      }),
    ).rejects.toThrow(/outside the workspace/);
  });
});
