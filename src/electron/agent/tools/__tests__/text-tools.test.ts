import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// Mock electron (FileTools imports electron.shell)
vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/test-neoworker"),
  },
}));

import { FileTools } from "../file-tools";
import { TextTools } from "../text-tools";

const mockDaemon = {
  logEvent: vi.fn(),
  registerArtifact: vi.fn(),
};

function mkWorkspace(tmpDir: string) {
  return {
    id: "ws-1",
    name: "Test Workspace",
    path: tmpDir,
    isTemp: false,
    permissions: {
      read: true,
      write: true,
      delete: false,
      network: false,
      shell: false,
      unrestrictedFileAccess: false,
      allowedPaths: [],
    },
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
  } as Any;
}

describe("TextTools", () => {
  let tmpDir: string;
  let tools: TextTools;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-text-tools-"));
    const workspace = mkWorkspace(tmpDir);
    const fileTools = new FileTools(workspace, mockDaemon as Any, "task-1");
    tools = new TextTools(workspace, mockDaemon as Any, "task-1", fileTools);
  });

  it("count_text counts exact characters by default", async () => {
    const result = await tools.countText({ text: "abc de" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.mode).toBe("characters");
      expect(result.count).toBe(6);
      expect(result.counts.characters_no_whitespace).toBe(5);
      expect(result.counts.words).toBe(2);
    }
  });

  it("count_text supports words/lines/paragraph modes", async () => {
    const text = "One two\nThree\n\nFour five.";
    const words = await tools.countText({ text, mode: "words" });
    const lines = await tools.countText({ text, mode: "lines" });
    const paragraphs = await tools.countText({ text, mode: "paragraphs" });

    expect(words.success && words.count).toBe(5);
    expect(lines.success && lines.count).toBe(4);
    expect(paragraphs.success && paragraphs.count).toBe(2);
  });

  it("text_metrics can analyze file input", async () => {
    const filePath = "sample.txt";
    await fs.writeFile(path.join(tmpDir, filePath), "Hello world.\nNext line!", "utf8");

    const result = await tools.textMetrics({ path: filePath });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.source).toBe("file");
      expect(result.path).toBe(filePath);
      expect(result.counts.words).toBe(4);
      expect(result.counts.lines).toBe(2);
      expect(result.counts.sentences).toBe(2);
    }
  });

  it("text_metrics supports top character frequencies", async () => {
    const result = await tools.textMetrics({
      text: "aaabbc\n",
      include_top_characters: true,
      top_character_limit: 3,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.top_characters).toEqual([
        { character: "a", count: 3 },
        { character: "b", count: 2 },
        { character: "\\n", count: 1 },
      ]);
    }
  });

  it("returns validation error when both text and path are provided", async () => {
    const result = await tools.countText({ text: "abc", path: "x.txt" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("either 'text' or 'path', not both");
    }
  });
});
