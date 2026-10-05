/**
 * Tests for the Skill and set_user_name tool functionality in ToolRegistry
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { CustomSkill } from "../../../../shared/types";
import * as path from "path";

// Mock settings storage for personality manager
let mockPersonalitySettings: Any = {};

// Mock personality manager
vi.mock("../../../settings/personality-manager", () => ({
  PersonalityManager: {
    loadSettings: vi.fn().mockImplementation(() => mockPersonalitySettings),
    saveSettings: vi.fn().mockImplementation((settings: Any) => {
      mockPersonalitySettings = { ...mockPersonalitySettings, ...settings };
    }),
    setUserName: vi.fn().mockImplementation((name: string) => {
      mockPersonalitySettings.relationship = {
        ...mockPersonalitySettings.relationship,
        userName: name,
      };
    }),
    getUserName: vi.fn().mockImplementation(() => mockPersonalitySettings.relationship?.userName),
    getAgentName: vi.fn().mockReturnValue("NeoWorker"),
    setActivePersona: vi.fn().mockImplementation((personaId: string) => {
      mockPersonalitySettings.activePersona = personaId;
    }),
    setResponseStyle: vi.fn().mockImplementation((style: Any) => {
      mockPersonalitySettings.responseStyle = {
        ...mockPersonalitySettings.responseStyle,
        ...style,
      };
    }),
    setQuirks: vi.fn().mockImplementation((quirks: Any) => {
      mockPersonalitySettings.quirks = {
        ...mockPersonalitySettings.quirks,
        ...quirks,
      };
    }),
    clearCache: vi.fn(),
  },
}));

// Mock skills storage
let mockSkills: Map<string, CustomSkill> = new Map();

function toRuntimeDescriptor(skill: CustomSkill) {
  return {
    name: skill.id,
    description: skill.description,
    whenToUse: skill.metadata?.routing?.useWhen || skill.description,
    allowedTools: Array.isArray((skill.requires as Any)?.tools)
      ? ((skill.requires as Any).tools as string[])
      : undefined,
    disableModelInvocation: skill.invocation?.disableModelInvocation === true,
    userInvocable: skill.invocation?.userInvocable !== false,
    skill,
  };
}

function matchesSkillRoutingQuery(skill: CustomSkill, query: string): boolean {
  const normalizedQuery = String(query || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/(^|\n)\s*>\s.*$/gm, " ")
    .replace(/["“”'‘’][^"“”'‘’]{1,160}["“”'‘’]/g, " ")
    .toLowerCase()
    .replace(/[-_\s]+/g, " ")
    .trim();

  if (skill.id === "codex-cli") {
    if (!normalizedQuery) return false;

    const activationCue =
      /\b(?:use|run|call|invoke|activate|apply|launch|start|enable|turn on|work on|help with|help me with)\b/;
    const skillCue = /\bskill\b/;
    if (!activationCue.test(normalizedQuery) && !skillCue.test(normalizedQuery)) {
      return false;
    }

    const targets = [skill.id, skill.name]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.toLowerCase().replace(/[-_\s]+/g, " ").trim());

    return targets.some((target) => {
      const escaped = target
        .split(" ")
        .filter(Boolean)
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+");

      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedQuery);
    });
  }

  const explicitMatch = [skill.id, skill.name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLowerCase().replace(/[-_\s]+/g, " ").trim())
    .some((target) => {
      const escaped = target
        .split(" ")
        .filter(Boolean)
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s+");

      return (
        /\b(?:use|run|call|invoke|activate|apply|launch|start|enable|turn on|work on|help with|help me with)\b/.test(
          normalizedQuery,
        ) || /\bskill\b/.test(normalizedQuery)
      ) && new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedQuery);
    });
  if (explicitMatch) return true;

  const routing = skill.metadata?.routing;
  const hasRoutingMetadata =
    Boolean(routing?.useWhen) ||
    Boolean(routing?.dontUseWhen) ||
    Boolean(routing?.outputs) ||
    Boolean(routing?.successCriteria) ||
    (Array.isArray(routing?.expectedArtifacts) && routing.expectedArtifacts.length > 0) ||
    (Array.isArray(routing?.keywords) && routing.keywords.length > 0) ||
    (Array.isArray(routing?.examples?.positive) && routing.examples.positive.length > 0) ||
    (Array.isArray(routing?.examples?.negative) && routing.examples.negative.length > 0);
  if (!hasRoutingMetadata) return false;

  const keywords = routing?.keywords;
  if (!Array.isArray(keywords) || keywords.length === 0) return true;

  if (!normalizedQuery) return false;

  return keywords.some((keyword) => {
    if (typeof keyword !== "string") return false;
    const normalizedKeyword = keyword
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    if (!normalizedKeyword) return false;

    const escaped = normalizedKeyword
      .split(" ")
      .filter(Boolean)
      .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");

    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(normalizedQuery);
  });
}

// Mock the custom skill loader
vi.mock("../../custom-skill-loader", () => ({
  getCustomSkillLoader: vi.fn().mockImplementation(() => ({
    getSkill: vi.fn().mockImplementation((id: string) => mockSkills.get(id)),
    listModelInvocableSkills: vi.fn().mockImplementation(() => Array.from(mockSkills.values())),
    listRuntimeSkillDescriptors: vi
      .fn()
      .mockImplementation(() => Array.from(mockSkills.values()).map((skill) => toRuntimeDescriptor(skill))),
    getRuntimeSkillDescriptor: vi.fn().mockImplementation((skill: CustomSkill) => toRuntimeDescriptor(skill)),
    getSkillStatusEntry: vi.fn().mockResolvedValue(null),
    matchesSkillRoutingQuery: vi
      .fn()
      .mockImplementation((skill: CustomSkill, query: string) => matchesSkillRoutingQuery(skill, query)),
    expandPrompt: vi.fn().mockImplementation((
      skill: CustomSkill,
      params: Record<string, Any>,
      context: { artifactDir?: string; workspaceArtifactDir?: string } = {},
    ) => {
      let prompt = skill.prompt;
      const fileDir = skill.filePath ? path.dirname(skill.filePath) : "/mock/resources/skills";
      const scopedBaseDir = skill.filePath ? path.join(fileDir, skill.id) : fileDir;
      prompt = prompt.replace(/\{baseDir\}/g, scopedBaseDir);
      if (context.artifactDir) {
        prompt = prompt.replace(/\{artifactDir\}/g, context.artifactDir);
      }
      if (context.workspaceArtifactDir) {
        prompt = prompt.replace(/\{workspaceArtifactDir\}/g, context.workspaceArtifactDir);
      }
      if (skill.parameters) {
        for (const param of skill.parameters) {
          const value = params[param.name] ?? param.default ?? "";
          const placeholder = new RegExp(`\\{\\{${param.name}\\}\\}`, "g");
          prompt = prompt.replace(placeholder, String(value));
        }
      }
      return prompt.replace(/\{\{[^}]+\}\}/g, "").trim();
    }),
    getSkillDescriptionsForModel: vi.fn().mockReturnValue(""),
  })),
}));

// Mock electron
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/mock/user/data"),
  },
}));

// Mock fs
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue("{}"),
    readdirSync: vi.fn().mockReturnValue([]),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  realpathSync: { native: vi.fn((value: string) => value) },
  readFileSync: vi.fn().mockReturnValue("{}"),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    readdir: vi.fn().mockRejectedValue(new Error("not found")),
    stat: vi.fn().mockResolvedValue({ isFile: () => true }),
    writeFile: vi.fn(),
  },
  mkdir: vi.fn(),
  readdir: vi.fn().mockRejectedValue(new Error("not found")),
  stat: vi.fn().mockResolvedValue({ isFile: () => true }),
  realpath: vi.fn(async (value: string) => value),
  readFile: vi.fn().mockResolvedValue(Buffer.from("template bytes")),
  writeFile: vi.fn(),
}));

// Mock other dependencies
vi.mock("../../daemon", () => ({
  AgentDaemon: vi.fn().mockImplementation(() => ({
    logEvent: vi.fn(),
    registerArtifact: vi.fn(),
  })),
}));

vi.mock("../../../mcp/client/MCPClientManager", () => ({
  MCPClientManager: {
    getInstance: vi.fn().mockImplementation(() => {
      throw new Error("MCP not initialized");
    }),
  },
}));

vi.mock("../../../mcp/settings", () => ({
  MCPSettingsManager: {
    initialize: vi.fn(),
    loadSettings: vi.fn().mockReturnValue({ toolNamePrefix: "mcp_" }),
    updateServer: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../../mcp/registry/MCPRegistryManager", () => ({
  MCPRegistryManager: {
    installServer: vi.fn(),
  },
}));

vi.mock("../../../hooks/settings", () => ({
  HooksSettingsManager: {
    initialize: vi.fn(),
    loadSettings: vi.fn().mockReturnValue({
      enabled: false,
      token: "",
      path: "/hooks",
      maxBodyBytes: 256 * 1024,
      presets: [],
      mappings: [],
    }),
    enableHooks: vi.fn().mockReturnValue({
      enabled: true,
      token: "token",
      path: "/hooks",
      maxBodyBytes: 256 * 1024,
      presets: [],
      mappings: [],
    }),
    updateConfig: vi.fn().mockImplementation((cfg: Any) => cfg),
  },
}));

vi.mock("../../../security/policy-manager", () => ({
  isToolAllowedQuick: vi.fn().mockReturnValue(true),
}));

vi.mock("../builtin-settings", () => ({
  BuiltinToolsSettingsManager: {
    loadSettings: vi.fn().mockReturnValue({}),
    isToolEnabled: vi.fn().mockReturnValue(true),
    getToolCategory: vi.fn().mockReturnValue("skills"),
    getToolPriority: vi.fn().mockReturnValue("normal"),
    getCodexRuntimeMode: vi.fn().mockReturnValue("native"),
  },
}));

vi.mock("../../search", () => ({
  SearchProviderFactory: {
    isAnyProviderConfigured: vi.fn().mockReturnValue(false),
    getAvailableProviders: vi.fn().mockReturnValue([]),
  },
}));

// Mock MentionTools to avoid DatabaseManager dependency
vi.mock("../mention-tools", () => {
  return {
    MentionTools: class MockMentionTools {
      getTools() {
        return [];
      }
      static getToolDefinitions() {
        return [];
      }
    },
  };
});

// Import after mocking
import { ToolRegistry } from "../registry";
import { BuiltinToolsSettingsManager } from "../builtin-settings";
import type { Workspace } from "../../../../shared/types";

// Helper to create a test skill
function createTestSkill(overrides: Partial<CustomSkill> = {}): CustomSkill {
  return {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill for unit testing",
    icon: "🧪",
    category: "Testing",
    prompt: "This is a test prompt with {{param1}} and {{param2}}",
    parameters: [
      { name: "param1", type: "string", description: "First param", required: true },
      {
        name: "param2",
        type: "string",
        description: "Second param",
        required: false,
        default: "default-value",
      },
    ],
    enabled: true,
    metadata: {
      routing: {
        useWhen: "Use when testing skill application behavior.",
      },
    },
    ...overrides,
  };
}

// Create mock workspace and daemon
function createMockWorkspace(): Workspace {
  return {
    id: "test-workspace",
    name: "Test Workspace",
    path: "/mock/workspace",
    permissions: {
      read: true,
      write: true,
      shell: false,
      network: true,
    },
    model: "claude-sonnet-4-20250514",
    createdAt: new Date().toISOString(),
  };
}

describe("Skill tool", () => {
  let registry: ToolRegistry;
  let mockDaemon: Any;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSkills.clear();
    mockPersonalitySettings = {};

    mockWorkspace = createMockWorkspace();
    mockDaemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
      getTaskById: vi.fn().mockResolvedValue({
        id: "test-task-123",
        title: "Generic task",
        prompt: "Generic prompt",
        rawPrompt: "Generic prompt",
        userPrompt: "Generic prompt",
      }),
    };

    registry = new ToolRegistry(mockWorkspace, mockDaemon, "test-task-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function takeResolvedSkill(result: Any) {
    expect(result.skill_invocation_id).toBeDefined();
    return registry.takeResolvedSkillInvocation(result.skill_invocation_id);
  }

  it("expands the same stored writing rules identically for UI and slash parameters", async () => {
    mockSkills.set("writing-standard", {
      id: "writing-standard", name: "服务器产品资料写作规范", description: "编写与审校规范", enabled: true,
      icon: "file-text", category: "Writing",
      invocation: { disableModelInvocation: true, userInvocable: true },
      prompt: "固定规范 V1.1\n资料类型：{{docType}}\n品牌：{{brand}}\n语言：{{docLanguage}}\n逐条标注依据。",
      parameters: [
        { name: "docType", type: "string", default: "服务器产品资料" },
        { name: "brand", type: "select", required: true, default: "I", options: ["I", "Q"] },
        { name: "docLanguage", type: "select", required: true, default: "中文", options: ["中文", "英文"] },
      ],
    });
    const parameters = { docType: "安装指南", brand: "Q", docLanguage: "英文" };
    // The host treats the explicit form selection as a manual invocation too.
    const ui = await registry.executeTool("Skill", { skill: "writing-standard", args: JSON.stringify(parameters), trigger: "slash" });
    const slash = await registry.executeTool("Skill", { skill: "writing-standard", args: JSON.stringify(parameters) + "\n审校附件并输出修订版 Word", trigger: "slash" });
    expect(ui.success).toBe(true);
    expect(slash.success).toBe(true);
    const a = takeResolvedSkill(ui), b = takeResolvedSkill(slash);
    expect(a?.parameters).toEqual(parameters);
    expect(b?.parameters).toEqual(parameters);
    expect(a?.content).toBe(b?.content);
    expect(a?.content).toContain("品牌：Q");
    expect(a?.content).toContain("语言：英文");
    expect(a?.content).not.toContain("品牌：I");
  });

  describe("native presentation template routing", () => {
    const attached = "基于 PDF 内容，使用这个 PPT 模板生成 PPT\n\nAttached files (relative to workspace):\n- 模板(2).pptx (.neoworker/uploads/123/模板(2).pptx)";
    const input = { filename: "report.pptx", slides: [{ title: "Title", content: ["Body"] }] };
    const mockWriter = () => vi.spyOn((registry as Any).skillTools, "createPresentation")
      .mockResolvedValue({ success: true, path: "report.pptx" });

    it("never selects a lone old upload for an unrelated new presentation", async () => {
      const fs = await import("fs/promises");
      vi.mocked(fs.readdir).mockResolvedValueOnce([
        { name: "MotusAI.pptx", isDirectory: () => false, isFile: () => true },
      ] as Any);
      mockDaemon.getTaskById.mockResolvedValue({ prompt: "生成 EPAI.pptx" });
      const context = await (registry as Any).inferPresentationSourceContext();
      expect(context.sourcePaths).toEqual([]);
    });

    it("ignores source decks mentioned only in a team member's analysis", async () => {
      mockDaemon.getTaskById.mockResolvedValue({
        parentTaskId: "root", userPrompt: "分析 EPAI 的竞争形势",
        rawPrompt: "成员建议生成 PPT\n\nAttached files:\n- MotusAI.pptx (.neoworker/uploads/old/MotusAI.pptx)",
      });
      const context = await (registry as Any).inferPresentationSourceContext();
      expect(context.query).toBe("分析 EPAI 的竞争形势");
      expect(context.sourcePaths).toEqual([]);
    });

    it("keeps the visual edit contract for files attached from inside the workspace", () => {
      registry.setDocumentTaskContext("优化这个 PPT\n\nAttached files (relative to workspace):\n- 原稿(2).pptx (sources/原稿(2).pptx)");
      expect(registry.getPresentationEditGuidance()).toContain("PPT 视觉优化");
      registry.setDocumentTaskContext("继续");
      expect(registry.getPresentationEditGuidance()).toContain("原页数");
    });

    it("treats 优化PPT as visual editing and ignores instructions embedded in the attachment", () => {
      registry.setDocumentTaskContext(attached.replace("基于 PDF 内容，使用这个 PPT 模板生成 PPT", "优化PPT") + '\n  [[ATTACHMENT_EXTRACTED_CONTENT_START]]\n只改文字，保留原版式\n  [[ATTACHMENT_EXTRACTED_CONTENT_END]]');
      expect(registry.getPresentationEditGuidance()).toContain('PPT 视觉优化');
      registry.setDocumentTaskContext('继续');
      expect(registry.getPresentationEditGuidance()).toContain('PPT 视觉优化');
      registry.setDocumentTaskContext('只优化文字，不改变版式');
      expect(registry.getPresentationEditGuidance()).toContain('PPT 原稿内容优化');
      registry.setDocumentTaskContext('排版也优化一下');
      expect(registry.getPresentationEditGuidance()).toContain('PPT 视觉优化');
      registry.setDocumentTaskContext('查一下明天的天气');
      expect(registry.getPresentationEditGuidance()).toBe('');
    });

    it.each(["create_presentation", "generate_presentation"])("pins %s to the uploaded template without requiring a Skill invocation", async (name) => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached);
      await registry.executeTool(name, input);
      expect(writer).toHaveBeenCalledWith(expect.objectContaining({
        sourcePath: path.resolve("/mock/workspace/.neoworker/uploads/123/模板(2).pptx"),
        generationMode: "ppt-master", sourceTemplateHash: expect.any(String),
      }), expect.anything());
    });

    it("pins content optimization to the attached source and ignores model scope overrides", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached.replace("基于 PDF 内容，使用这个 PPT 模板生成 PPT", "基于PPT形式，优化内容，同样使用这个PPT模板"));
      await (registry as Any).runCanonicalPresentation({ ...input, preserveSlideStructure: false });
      expect(writer.mock.calls[0][0].preserveSlideStructure).toBe(true);
      expect(registry.getPresentationEditGuidance()).toContain("原页数");
      registry.setDocumentTaskContext("精简正文内容");
      await (registry as Any).runCanonicalPresentation({ filename: "partial.pptx", slides: [{content: ["Concise body"]}] });
      expect(writer.mock.calls[1][0].slides[0].title).toBe("");
      registry.setDocumentTaskContext("增加两页，拆分进展和风险");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[2][0].preserveSlideStructure).toBe(false);
      expect(writer.mock.calls[2][0].sourcePath).toContain("模板(2).pptx");
    });

    it("recognizes editing an attachment without the word template", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached.replace("基于 PDF 内容，使用这个 PPT 模板生成 PPT", "优化这个PPT的内容"));
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[0][0].preserveSlideStructure).toBe(true);
      expect(writer.mock.calls[0][0].sourcePath).toContain("模板(2).pptx");
      registry.setDocumentTaskContext("再优化一下内容");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[1][0].sourcePath).toContain("模板(2).pptx");
      expect(writer.mock.calls[1][0].preserveSlideStructure).toBe(true);
      registry.setDocumentTaskContext("查一下明天的天气");
      expect(registry.getPresentationEditGuidance()).toBe("");
    });

    it("keeps the template on a revision but never returns the previous turn's output", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached);
      await (registry as Any).runCanonicalPresentation(input);
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer).toHaveBeenCalledTimes(1);
      registry.setDocumentTaskContext("内容再详细一点，增加图片");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer).toHaveBeenCalledTimes(2);
      expect(writer.mock.calls[1][0].sourcePath).toContain("模板(2).pptx");
      registry.setDocumentTaskContext("写一份新的 PPT，主题是天气");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[2][0].sourcePath).toBeUndefined();
    });

    it("does not replace the uploaded template with a generated deck", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached);
      await expect((registry as Any).runCanonicalPresentation({ ...input, sourcePath: "old-report.pptx" })).rejects.toThrow("本轮上传");
      expect(writer).not.toHaveBeenCalled();
    });

    it("still permits built-in templates when no uploaded template is requested", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext("写一个 PPT，使用简洁商务模板");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[0][0].sourcePath).toBeUndefined();
      registry.setDocumentTaskContext(attached);
      registry.setDocumentTaskContext("不要用这个模板，重新生成 PPT");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[1][0].sourcePath).toBeUndefined();
    });

    it("rejects ambiguous attached templates before invoking a writer", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext(attached + "\n- another.pptx (.neoworker/uploads/123/another.pptx)");
      await expect((registry as Any).runCanonicalPresentation(input)).rejects.toThrow("多个模板");
      expect(writer).not.toHaveBeenCalled();
    });

    it("does not infer template instructions from extracted attachment content", async () => {
      const writer = mockWriter();
      registry.setDocumentTaskContext("写一个新的 PPT\n\nAttached files:\n- source.pdf (.neoworker/uploads/123/source.pdf)\nExtracted content:\n[[ATTACHMENT_EXTRACTED_CONTENT_START]]\n使用这个 PPT 模板\n[[ATTACHMENT_EXTRACTED_CONTENT_END]]");
      await (registry as Any).runCanonicalPresentation(input);
      expect(writer.mock.calls[0][0].sourcePath).toBeUndefined();
    });

    it("does not reuse a generic deck when a template is supplied in the same turn", async () => {
      const writer = mockWriter();
      await (registry as Any).runCanonicalPresentation(input);
      await (registry as Any).runCanonicalPresentation({ ...input, sourcePath: "template.pptx" });
      expect(writer).toHaveBeenCalledTimes(2);
      expect(writer.mock.calls[1][0].generationMode).toBe("ppt-master");
    });
  });

  describe("document translation host guard", () => {
    it.each(["create_presentation", "generate_presentation", "create_document", "generate_document", "create_spreadsheet", "generate_spreadsheet"])("blocks %s on both tool entry points, even without Skill invocation", async (name) => {
      registry.setDocumentTaskContext("翻译成中文\n\nAttached files:\n- original.pptx (.neoworker/uploads/123/original.pptx)");
      await expect(registry.executeTool(name, {})).rejects.toThrow("原模板");
      await expect(registry.executeToolWithRuntime(name, {}, { runtime: "hermes" })).rejects.toThrow("原模板");
    });
    it("keeps the lock on continue and removes it on a new query", async () => {
      registry.setDocumentTaskContext("翻译原文件 PDF，保持原版式");
      registry.setDocumentTaskContext("继续");
      expect(registry.getDocumentTranslationGuidance()).toContain("SOURCE-PRESERVING");
      expect(registry.getDocumentTranslationToolError("create_spreadsheet")).toContain("mcp_neoworker_office_translation");
      expect(registry.getDocumentTranslationToolError("office_translation")).toBeNull();
      await expect(registry.executeTool("generate_document", {})).rejects.toThrow("原模板");
      registry.setDocumentTaskContext("写一份新的报告");
      expect(registry.getDocumentTranslationGuidance()).toBe("");
      expect(registry.getDocumentTranslationToolError("create_spreadsheet")).toBeNull();
      expect(registry.getDocumentTranslationDeliveryError(["old.pdf"])).toBeNull();
    });
    it("does not accept rebuilt shell outputs as successful translation evidence", () => {
      registry.setDocumentTaskContext("翻译 PDF，保持原版式");
      expect(registry.getDocumentTranslationDeliveryError(["rebuilt.pdf"])).toContain("保真校验");
    });
    it("rejects JSON-only completion even when the source came from workspace context", () => {
      registry.setDocumentTaskContext("翻译这个 Word 文档，保持原有格式");
      expect(registry.getDocumentTranslationDeliveryError([".neoworker/tmp/translated-en.json"])).toContain("任务未完成");
      expect(registry.getDocumentTranslationDeliveryError([])).toContain("不能作为最终交付");
    });
    it("does not allow a newly created file to masquerade as the source attachment", async () => {
      registry.setDocumentTaskContext("翻译成中文\n\nAttached files:\n- original.pptx (.neoworker/uploads/123/original.pptx)");
      await expect((registry as Any).runOfficeTranslation({ action: "inspect", sourcePath: "test_min.pptx" })).rejects.toThrow("本轮指定的原附件");
    });
    it.each(["翻译成英文，输出pdf", "翻译成中文，保留原始图片，输出PDF文档"])("does not stop ordinary PDF translation: %s", (instruction) => {
      registry.setDocumentTaskContext(`${instruction}\n\nAttached files:\n- original.pdf (.neoworker/uploads/123/original.pdf)`);
      expect(registry.getDocumentTranslationCapabilityError()).toBeNull();
      expect(registry.getDocumentTranslationToolError("generate_document")).toBeNull();
      expect(registry.getDocumentTranslationDeliveryError(["translated.pdf"])).toBeNull();
      expect(registry.getDocumentTranslationGuidance()).toContain("Read all source pages");
      expect(registry.getDocumentTranslationGuidance()).toContain("Preserve all source content");
      registry.setDocumentTaskContext("继续翻译");
      expect(registry.getDocumentTranslationCapabilityError()).toBeNull();
      expect(registry.getDocumentTranslationGuidance()).toContain("PDF TRANSLATION WITH TEXT REFLOW");
    });
    it("requires a separately verified copy for every source and reports PDF limitations", () => {
      registry.setDocumentTaskContext("翻译附件\n\nAttached files:\n- one.pptx (.neoworker/uploads/1/one.pptx)\n- two.pptx (.neoworker/uploads/1/two.pptx)");
      expect(registry.getDocumentTranslationDeliveryError([])).toContain("还有原附件");
      registry.setDocumentTaskContext("翻译 PDF 成阿拉伯语，保持原版式");
      expect(registry.getDocumentTranslationCapabilityError()).toContain("尚不能可靠完成");
      registry.setDocumentTaskContext("翻译 PDF 成韩文，保持原版式");
      expect(registry.getDocumentTranslationCapabilityError()).not.toContain("阿拉伯");
      registry.setDocumentTaskContext("翻译并重新排版 PDF");
      expect(registry.getDocumentTranslationCapabilityError()).toBeNull();
    });
  });

  describe("tool definition", () => {
    it("should expose Skill and remove legacy model-facing skill tools", () => {
      const tools = registry.getTools();
      const skillTool = tools.find((t) => t.name === "Skill");

      expect(skillTool).toBeDefined();
      expect(skillTool?.description).toContain("Invoke a skill");
      expect(tools.find((t) => t.name === "use_skill")).toBeUndefined();
      expect(tools.find((t) => t.name === "skill_list")).toBeUndefined();
      expect(tools.find((t) => t.name === "skill_get")).toBeUndefined();
    });

    it("should have correct input schema", () => {
      const tools = registry.getTools();
      const skillTool = tools.find((t) => t.name === "Skill");

      expect(skillTool?.input_schema.properties.skill).toBeDefined();
      expect(skillTool?.input_schema.properties.args).toBeDefined();
      expect(skillTool?.input_schema.required).toContain("skill");
    });
  });

  describe("skill execution", () => {
    it("should return error for non-existent skill", async () => {
      const result = await registry.executeTool("Skill", {
        skill: "non-existent",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.available_skills).toBeDefined();
    });

    it("should execute a valid skill and store hidden invocation context", async () => {
      const skill = createTestSkill({ id: "my-skill" });
      mockSkills.set("my-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "my-skill",
        args: "value1",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(result.skill).toBe("my-skill");
      expect(result.message).toContain("Loaded skill");
      expect(result.application_summary).toContain("hidden context");
      expect(resolved).toEqual(
        expect.objectContaining({
          skillId: "my-skill",
          args: "value1",
          content: "This is a test prompt with value1 and default-value",
          trigger: "model",
        }),
      );
    });

    it("should parse JSON args for multi-parameter skills", async () => {
      const skill = createTestSkill({
        id: "parameterized-skill",
        prompt: "Process {{path}} to {{language}}",
        parameters: [
          { name: "path", type: "string", description: "File path", required: true },
          { name: "language", type: "string", description: "Target language", required: true },
        ],
      });
      mockSkills.set("parameterized-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "parameterized-skill",
        args: JSON.stringify({ path: "test.txt", language: "Spanish" }),
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(resolved?.content).toBe("Process test.txt to Spanish");
      expect(resolved?.parameters).toEqual({ path: "test.txt", language: "Spanish" });
    });

    it("should use default values for optional parameters", async () => {
      const skill = createTestSkill({
        id: "default-params-skill",
        prompt: "Hello {{name}} with {{greeting}}",
        parameters: [
          { name: "name", type: "string", description: "Name", required: true },
          {
            name: "greeting",
            type: "string",
            description: "Greeting",
            required: false,
            default: "Good day",
          },
        ],
      });
      mockSkills.set("default-params-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "default-params-skill",
        args: "World",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(resolved?.content).toBe("Hello World with Good day");
    });

    it("locks attached PPTX translation to native edit mode", async () => {
      const skill = createTestSkill({
        id: "presentation-studio",
        prompt: "Presentation mode={{mode}} source={{source_path}}",
        parameters: [
          {
            name: "mode",
            type: "select",
            description: "Presentation mode",
            default: "auto",
            options: ["auto", "create", "edit"],
          },
          {
            name: "source_path",
            type: "string",
            description: "Source deck",
            default: "",
          },
        ],
      });
      mockSkills.set("presentation-studio", skill);
      mockDaemon.getTaskById.mockResolvedValue({
        id: "test-task-123",
        title: "翻译 PPT",
        prompt: `帮我把这几个 PPT 翻译成中文

Attached files (relative to workspace):
- one.pptx (.neoworker/uploads/123/one.pptx)
- two.pptx (.neoworker/uploads/123/two.pptx)`,
        rawPrompt: "帮我把这几个 PPT 翻译成中文",
        userPrompt: "帮我把这几个 PPT 翻译成中文",
      });

      const result = await registry.executeTool("Skill", {
        skill: "presentation-studio",
      });
      const resolved = takeResolvedSkill(result);

      expect(resolved?.parameters).toEqual(
        expect.objectContaining({
          mode: "edit",
          preserve_source_design: true,
          source_path: "",
        }),
      );
      expect(JSON.parse(String(resolved?.parameters?.source_paths))).toEqual([
        path.resolve("/mock/workspace/.neoworker/uploads/123/one.pptx"),
        path.resolve("/mock/workspace/.neoworker/uploads/123/two.pptx"),
      ]);
      expect(resolved?.content).toContain("Native PPTX translation lock");
      expect(resolved?.content).toContain("never a deck-creation operation");
      expect(resolved?.content).toContain("Do not bootstrap a blank Presentation Studio project");
    });

    it("should return error for missing required parameters", async () => {
      const skill = createTestSkill({
        id: "required-params-skill",
        parameters: [
          { name: "required_param", type: "string", description: "Required", required: true },
        ],
      });
      mockSkills.set("required-params-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "required-params-skill",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required parameters");
      expect(result.error).toContain("required_param");
    });

    it("returns a pending parameter collection for slash-invoked skills with missing required parameters", async () => {
      const skill = createTestSkill({
        id: "pending-slash-skill",
        name: "Pending Slash Skill",
        parameters: [
          { name: "required_param", type: "string", description: "Required", required: true },
          {
            name: "flavor",
            type: "select",
            description: "Optional flavor",
            required: false,
            default: "vanilla",
            options: ["vanilla", "chocolate"],
          },
        ],
      });
      mockSkills.set("pending-slash-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "pending-slash-skill",
        trigger: "slash",
      });

      expect(result.success).toBe(true);
      expect(result.pending_skill_parameter_collection).toEqual(
        expect.objectContaining({
          skillId: "pending-slash-skill",
          trigger: "slash",
          parameters: {
            flavor: "vanilla",
          },
          requiredParameterNames: ["required_param"],
          currentParameterIndex: 0,
        }),
      );
    });

    it("should reject skills with disableModelInvocation", async () => {
      const skill = createTestSkill({
        id: "manual-only-skill",
        invocation: { disableModelInvocation: true },
      });
      mockSkills.set("manual-only-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "manual-only-skill",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot be invoked automatically");
    });

    it("should reject automatic invocation for skills without routing metadata", async () => {
      const skill = createTestSkill({
        id: "manual-routing-skill",
        metadata: undefined,
      });
      mockSkills.set("manual-routing-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "manual-routing-skill",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available for this task");
    });

    it("should allow manual slash invocation for a model-disabled skill", async () => {
      const skill = createTestSkill({
        id: "manual-only-skill",
        invocation: { disableModelInvocation: true },
      });
      mockSkills.set("manual-only-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "manual-only-skill",
        args: "value1",
        trigger: "slash",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(resolved).toEqual(
        expect.objectContaining({
          skillId: "manual-only-skill",
          args: "value1",
          trigger: "slash",
        }),
      );
    });

    it("should log skill invocation event", async () => {
      const skill = createTestSkill({ id: "logged-skill" });
      mockSkills.set("logged-skill", skill);

      await registry.executeTool("Skill", {
        skill: "logged-skill",
        args: "test",
      });

      expect(mockDaemon.logEvent).toHaveBeenCalledWith(
        "test-task-123",
        "log",
        expect.objectContaining({
          message: expect.stringContaining("Using skill"),
          skillId: "logged-skill",
        }),
      );
    });

    it("should handle skills without parameters", async () => {
      const skill = createTestSkill({
        id: "no-params-skill",
        prompt: "A simple prompt without parameters",
        parameters: [],
      });
      mockSkills.set("no-params-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "no-params-skill",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(resolved?.content).toBe("A simple prompt without parameters");
    });

    it("should resolve {baseDir} and {artifactDir} placeholders in expanded prompt", async () => {
      const skill = createTestSkill({
        id: "script-skill",
        filePath: "/mock/resources/skills/script-skill.json",
        prompt:
          "Run {baseDir}/scripts/run.sh > {artifactDir}/result.txt and sync into {workspaceArtifactDir}/result.txt",
        parameters: [],
      });
      mockSkills.set("script-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "script-skill",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(resolved?.content?.replace(/\\/g, "/")).toContain(
        "/mock/resources/skills/script-skill/scripts/run.sh",
      );
      expect(resolved?.content?.replace(/\\/g, "/")).toContain(
        "/mock/workspace/artifacts/skills/test-task-123/script-skill/result.txt",
      );
      expect(resolved?.content?.replace(/\\/g, "/")).toContain("/mock/workspace/artifacts/result.txt");
      expect(resolved?.contextDirectives).toEqual(
        expect.objectContaining({
          artifactDirectories: expect.any(Array),
        }),
      );
    });

    it("should return skill metadata in response", async () => {
      const skill = createTestSkill({
        id: "metadata-skill",
        name: "Metadata Test Skill",
        description: "A skill with metadata",
      });
      mockSkills.set("metadata-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "metadata-skill",
        args: "test",
      });

      expect(result.skill_name).toBe("Metadata Test Skill");
    });

    it("should reject skill when required tool is unavailable", async () => {
      const skill = createTestSkill({
        id: "cli-skill",
        requires: { tools: ["run_command"] } as Any,
      });
      mockSkills.set("cli-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "cli-skill",
        args: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not currently executable");
      expect(result.reason).toContain("run_command");
      expect(result.missing_tools).toContain("run_command");
    });

    it("should reject codex-cli unless the task explicitly invokes the skill", async () => {
      const skill = createTestSkill({
        id: "codex-cli",
        name: "Codex CLI Agent",
        parameters: [],
        metadata: {
          routing: {
            keywords: ["codex"],
          },
        },
      });
      mockSkills.set("codex-cli", skill);
      mockDaemon.getTaskById.mockResolvedValue({
        id: "test-task-123",
        title: "Review this repo",
        prompt: "Run a generic agent on this issue",
      });

      const result = await registry.executeTool("Skill", {
        skill: "codex-cli",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not available for this task");
      expect(result.reason).toContain("auto-routable");
    });

    it("rejects presentation routing suggested only by another team member", async () => {
      mockSkills.set("presentation-studio", createTestSkill({
        id: "presentation-studio", name: "Presentation Studio", parameters: [],
        metadata: { routing: { keywords: ["PPT", "presentation"] } },
      }));
      mockDaemon.getTaskById.mockResolvedValue({ id: "test-task-123", parentTaskId: "root",
        title: "Synthesis", userPrompt: "分析 EPAI 平台的竞争形式",
        rawPrompt: "Member findings: 我可以生成 PPT 汇报。",
      });
      const result = await registry.executeTool("Skill", { skill: "presentation-studio" });
      expect(result.success).toBe(false);
      expect(result.reason).toContain("canonical task intent");
    });

    it("should allow codex-cli when the task explicitly invokes the skill", async () => {
      const skill = createTestSkill({
        id: "codex-cli",
        name: "Codex CLI Agent",
        prompt: "Use codex for this task",
        parameters: [],
        metadata: {
          routing: {
            keywords: ["codex"],
          },
        },
      });
      mockSkills.set("codex-cli", skill);
      mockDaemon.getTaskById.mockResolvedValue({
        id: "test-task-123",
        title: "Use the Codex CLI Agent skill",
        prompt: "Use the Codex CLI Agent skill to review this change",
      });

      const result = await registry.executeTool("Skill", {
        skill: "codex-cli",
      });
      const resolved = takeResolvedSkill(result);

      expect(result.success).toBe(true);
      expect(result.skill).toBe("codex-cli");
      expect(resolved?.content).toContain("codex");
      expect(resolved).toEqual(
        expect.objectContaining({
          skillId: "codex-cli",
          trigger: "model",
        }),
      );
    });

    it("should expand codex-cli into an acpx-backed child task when the setting prefers acpx", async () => {
      const runtimeSpy = vi
        .spyOn(BuiltinToolsSettingsManager, "getCodexRuntimeMode")
        .mockReturnValue("acpx");
      const skill = createTestSkill({
        id: "codex-cli",
        name: "Codex CLI Agent",
        prompt: "legacy prompt should be bypassed",
        parameters: [],
        metadata: {
          routing: {
            keywords: ["codex"],
          },
        },
      });
      mockSkills.set("codex-cli", skill);
      mockDaemon.getTaskById.mockResolvedValue({
        id: "test-task-123",
        title: "Use the Codex CLI Agent skill for review",
        prompt:
          'Use the Codex CLI Agent skill to review the current workspace changes by spawning a child agent titled "Codex review" and have it inspect the diff.',
      });

      try {
        const result = await registry.executeTool("Skill", {
          skill: "codex-cli",
        });
        const resolved = takeResolvedSkill(result);

        expect(result.success).toBe(true);
        expect(resolved?.content).toContain("spawn_agent");
        expect(resolved?.content).toContain('`runtime`: `"acpx"`');
        expect(resolved?.content).toContain('`runtime_agent`: `"codex"`');
        expect(resolved?.content).toContain("review the current workspace changes and inspect the diff.");
        expect(resolved?.content).not.toContain("legacy prompt should be bypassed");
        expect(resolved?.content).not.toContain("Phase 0");
        expect(resolved?.content).not.toContain("Read `{baseDir}/SKILL.md`");
      } finally {
        runtimeSpy.mockRestore();
      }
    });

    it("should expand codex-cli into a native child task when the setting prefers native", async () => {
      const runtimeSpy = vi
        .spyOn(BuiltinToolsSettingsManager, "getCodexRuntimeMode")
        .mockReturnValue("native");
      const skill = createTestSkill({
        id: "codex-cli",
        name: "Codex CLI Agent",
        prompt: "legacy prompt should be bypassed",
        parameters: [],
        metadata: {
          routing: {
            keywords: ["codex"],
          },
        },
      });
      mockSkills.set("codex-cli", skill);
      mockDaemon.getTaskById.mockResolvedValue({
        id: "test-task-123",
        title: "Use the Codex CLI Agent skill to fix the failing test",
        prompt: "Use the Codex CLI Agent skill to fix the failing test in the current workspace",
      });

      try {
        const result = await registry.executeTool("Skill", {
          skill: "codex-cli",
        });
        const resolved = takeResolvedSkill(result);

        expect(result.success).toBe(true);
        expect(resolved?.content).toContain("spawn_agent");
        expect(resolved?.content).toContain("Omit `runtime` so the child uses the native Codex CLI path.");
        expect(resolved?.content).not.toContain('`runtime`: `"acpx"`');
        expect(resolved?.content).toContain("fix the failing test in the current workspace.");
      } finally {
        runtimeSpy.mockRestore();
      }
    });
  });

  describe("error handling", () => {
    it("should list available skills when skill not found", async () => {
      const skill1 = createTestSkill({ id: "skill-1" });
      const skill2 = createTestSkill({ id: "skill-2" });
      mockSkills.set("skill-1", skill1);
      mockSkills.set("skill-2", skill2);

      const result = await registry.executeTool("Skill", {
        skill: "unknown-skill",
      });

      expect(result.success).toBe(false);
      expect(result.available_skills).toContain("skill-1");
      expect(result.available_skills).toContain("skill-2");
    });

    it("should provide parameter info when required params missing", async () => {
      const skill = createTestSkill({
        id: "info-skill",
        parameters: [
          { name: "file", type: "string", description: "File to process", required: true },
          {
            name: "format",
            type: "select",
            description: "Output format",
            required: false,
            options: ["json", "xml"],
          },
        ],
      });
      mockSkills.set("info-skill", skill);

      const result = await registry.executeTool("Skill", {
        skill: "info-skill",
      });

      expect(result.success).toBe(false);
      expect(result.parameters).toBeDefined();
      expect(result.parameters).toHaveLength(2);
      expect(result.parameters[0].name).toBe("file");
      expect(result.parameters[0].required).toBe(true);
    });
  });
});

describe("set_user_name tool", () => {
  let registry: ToolRegistry;
  let mockDaemon: Any;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonalitySettings = {};

    mockWorkspace = createMockWorkspace();
    mockDaemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };

    registry = new ToolRegistry(mockWorkspace, mockDaemon, "test-task-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool definition", () => {
    it("should include set_user_name in available tools", () => {
      const tools = registry.getTools();
      const setUserNameTool = tools.find((t) => t.name === "set_user_name");

      expect(setUserNameTool).toBeDefined();
      expect(setUserNameTool?.description).toContain("user's name");
    });

    it("should have correct input schema", () => {
      const tools = registry.getTools();
      const setUserNameTool = tools.find((t) => t.name === "set_user_name");

      expect(setUserNameTool?.input_schema.properties.name).toBeDefined();
      expect(setUserNameTool?.input_schema.required).toContain("name");
    });

    it("should always be enabled regardless of builtin settings", () => {
      // The tool should be in the filtered tools list
      const tools = registry.getTools();
      const setUserNameTool = tools.find((t) => t.name === "set_user_name");
      expect(setUserNameTool).toBeDefined();
    });
  });

  describe("user name storage", () => {
    it("should store user name successfully", async () => {
      const { PersonalityManager } = await import("../../../settings/personality-manager");

      const result = await registry.executeTool("set_user_name", {
        name: "Alice",
      });

      expect(result.success).toBe(true);
      expect(result.name).toBe("Alice");
      expect(result.message).toContain("Alice");
      expect(PersonalityManager.setUserName).toHaveBeenCalledWith("Alice");
    });

    it("should include agent name in response message", async () => {
      const result = await registry.executeTool("set_user_name", {
        name: "Bob",
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Bob");
      expect(result.message).toContain("NeoWorker");
    });

    it("should trim whitespace from name", async () => {
      const { PersonalityManager } = await import("../../../settings/personality-manager");

      const result = await registry.executeTool("set_user_name", {
        name: "  Charlie  ",
      });

      expect(result.success).toBe(true);
      expect(result.name).toBe("Charlie");
      expect(PersonalityManager.setUserName).toHaveBeenCalledWith("Charlie");
    });

    it("should reject empty name", async () => {
      await expect(registry.executeTool("set_user_name", { name: "" })).rejects.toThrow(
        "Name cannot be empty",
      );
    });

    it("should reject whitespace-only name", async () => {
      await expect(registry.executeTool("set_user_name", { name: "   " })).rejects.toThrow(
        "Name cannot be empty",
      );
    });

    it("should reject very long names", async () => {
      const longName = "A".repeat(101);
      await expect(registry.executeTool("set_user_name", { name: longName })).rejects.toThrow(
        "Name is too long",
      );
    });

    it("should accept names up to 100 characters", async () => {
      const maxName = "A".repeat(100);
      const result = await registry.executeTool("set_user_name", {
        name: maxName,
      });

      expect(result.success).toBe(true);
      expect(result.name).toBe(maxName);
    });
  });

  describe("response format", () => {
    it("should return success status", async () => {
      const result = await registry.executeTool("set_user_name", {
        name: "Diana",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("name", "Diana");
      expect(result).toHaveProperty("message");
    });

    it("should include friendly greeting in message", async () => {
      const result = await registry.executeTool("set_user_name", {
        name: "Eve",
      });

      expect(result.message).toContain("Nice to meet you");
      expect(result.message).toContain("remember");
    });
  });
});

describe("set_persona tool", () => {
  let registry: ToolRegistry;
  let mockDaemon: Any;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonalitySettings = {};

    mockWorkspace = createMockWorkspace();
    mockDaemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };

    registry = new ToolRegistry(mockWorkspace, mockDaemon, "test-task-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool definition", () => {
    it("should include set_persona in available tools", () => {
      const tools = registry.getTools();
      const setPersonaTool = tools.find((t) => t.name === "set_persona");

      expect(setPersonaTool).toBeDefined();
      expect(setPersonaTool?.description).toContain("persona");
    });

    it("should have correct input schema with all persona options", () => {
      const tools = registry.getTools();
      const setPersonaTool = tools.find((t) => t.name === "set_persona");

      expect(setPersonaTool?.input_schema.properties.persona).toBeDefined();
      expect(setPersonaTool?.input_schema.properties.persona.enum).toContain("jarvis");
      expect(setPersonaTool?.input_schema.properties.persona.enum).toContain("friday");
      expect(setPersonaTool?.input_schema.properties.persona.enum).toContain("none");
      expect(setPersonaTool?.input_schema.required).toContain("persona");
    });

    it("should always be enabled regardless of builtin settings", () => {
      const tools = registry.getTools();
      const setPersonaTool = tools.find((t) => t.name === "set_persona");
      expect(setPersonaTool).toBeDefined();
    });
  });

  describe("persona selection", () => {
    it("should set jarvis persona successfully", async () => {
      const { PersonalityManager } = await import("../../../settings/personality-manager");

      const result = await registry.executeTool("set_persona", {
        persona: "jarvis",
      });

      expect(result.success).toBe(true);
      expect(result.persona).toBe("jarvis");
      expect(result.name).toBe("Jarvis");
      expect(PersonalityManager.setActivePersona).toHaveBeenCalledWith("jarvis");
    });

    it("should set friday persona successfully", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "friday",
      });

      expect(result.success).toBe(true);
      expect(result.persona).toBe("friday");
      expect(result.name).toBe("Friday");
    });

    it("should set pirate persona successfully", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "pirate",
      });

      expect(result.success).toBe(true);
      expect(result.persona).toBe("pirate");
      expect(result.name).toBe("Pirate");
    });

    it("should clear persona with none", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "none",
      });

      expect(result.success).toBe(true);
      expect(result.persona).toBe("none");
      expect(result.message).toContain("cleared");
    });

    it("should reject invalid persona", async () => {
      await expect(
        registry.executeTool("set_persona", { persona: "invalid-persona" }),
      ).rejects.toThrow("Invalid persona");
    });

    it("should include valid personas in error message", async () => {
      try {
        await registry.executeTool("set_persona", { persona: "unknown" });
      } catch (error: Any) {
        expect(error.message).toContain("jarvis");
        expect(error.message).toContain("friday");
        expect(error.message).toContain("none");
      }
    });
  });

  describe("response format", () => {
    it("should return success status and persona details", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "hal",
      });

      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("persona", "hal");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("message");
    });

    it("should include informative message for active persona", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "sensei",
      });

      expect(result.message).toContain("Sensei");
      expect(result.message).toContain("character style");
    });

    it("should include different message for none persona", async () => {
      const result = await registry.executeTool("set_persona", {
        persona: "none",
      });

      expect(result.message).toContain("cleared");
      expect(result.message).not.toContain("character style");
    });
  });
});

describe("set_response_style tool", () => {
  let registry: ToolRegistry;
  let mockDaemon: Any;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonalitySettings = {};

    mockWorkspace = createMockWorkspace();
    mockDaemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };

    registry = new ToolRegistry(mockWorkspace, mockDaemon, "test-task-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool definition", () => {
    it("should include set_response_style in available tools", () => {
      const tools = registry.getTools();
      const tool = tools.find((t) => t.name === "set_response_style");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("response");
    });

    it("should have all style options in schema", () => {
      const tools = registry.getTools();
      const tool = tools.find((t) => t.name === "set_response_style");

      expect(tool?.input_schema.properties.emoji_usage).toBeDefined();
      expect(tool?.input_schema.properties.response_length).toBeDefined();
      expect(tool?.input_schema.properties.code_comments).toBeDefined();
      expect(tool?.input_schema.properties.explanation_depth).toBeDefined();
    });
  });

  describe("style changes", () => {
    it("should set emoji usage", async () => {
      const { PersonalityManager } = await import("../../../settings/personality-manager");

      const result = await registry.executeTool("set_response_style", {
        emoji_usage: "expressive",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("emoji usage: expressive");
      expect(PersonalityManager.setResponseStyle).toHaveBeenCalledWith({
        emojiUsage: "expressive",
      });
    });

    it("should set response length", async () => {
      const result = await registry.executeTool("set_response_style", {
        response_length: "terse",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("response length: terse");
    });

    it("should set code comments style", async () => {
      const result = await registry.executeTool("set_response_style", {
        code_comments: "verbose",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("code comments: verbose");
    });

    it("should set explanation depth", async () => {
      const result = await registry.executeTool("set_response_style", {
        explanation_depth: "teaching",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("explanation depth: teaching");
    });

    it("should set multiple styles at once", async () => {
      const result = await registry.executeTool("set_response_style", {
        emoji_usage: "none",
        response_length: "detailed",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(2);
    });

    it("should reject invalid emoji usage", async () => {
      await expect(
        registry.executeTool("set_response_style", { emoji_usage: "invalid" }),
      ).rejects.toThrow("Invalid emoji_usage");
    });

    it("should reject invalid response length", async () => {
      await expect(
        registry.executeTool("set_response_style", { response_length: "invalid" }),
      ).rejects.toThrow("Invalid response_length");
    });

    it("should reject empty input", async () => {
      await expect(registry.executeTool("set_response_style", {})).rejects.toThrow(
        "No valid style options",
      );
    });
  });
});

describe("set_quirks tool", () => {
  let registry: ToolRegistry;
  let mockDaemon: Any;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonalitySettings = {};

    mockWorkspace = createMockWorkspace();
    mockDaemon = {
      logEvent: vi.fn(),
      registerArtifact: vi.fn(),
    };

    registry = new ToolRegistry(mockWorkspace, mockDaemon, "test-task-123");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("tool definition", () => {
    it("should include set_quirks in available tools", () => {
      const tools = registry.getTools();
      const tool = tools.find((t) => t.name === "set_quirks");

      expect(tool).toBeDefined();
      expect(tool?.description).toContain("quirks");
    });

    it("should have all quirk options in schema", () => {
      const tools = registry.getTools();
      const tool = tools.find((t) => t.name === "set_quirks");

      expect(tool?.input_schema.properties.catchphrase).toBeDefined();
      expect(tool?.input_schema.properties.sign_off).toBeDefined();
      expect(tool?.input_schema.properties.analogy_domain).toBeDefined();
    });
  });

  describe("quirk changes", () => {
    it("should set catchphrase", async () => {
      const { PersonalityManager } = await import("../../../settings/personality-manager");

      const result = await registry.executeTool("set_quirks", {
        catchphrase: "At your service!",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain('catchphrase: "At your service!"');
      expect(PersonalityManager.setQuirks).toHaveBeenCalledWith({
        catchphrase: "At your service!",
      });
    });

    it("should set sign-off", async () => {
      const result = await registry.executeTool("set_quirks", {
        sign_off: "Happy coding!",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain('sign-off: "Happy coding!"');
    });

    it("should set analogy domain", async () => {
      const result = await registry.executeTool("set_quirks", {
        analogy_domain: "space",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("analogy domain: space");
    });

    it("should clear catchphrase with empty string", async () => {
      const result = await registry.executeTool("set_quirks", {
        catchphrase: "",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("catchphrase cleared");
    });

    it("should clear analogy domain with none", async () => {
      const result = await registry.executeTool("set_quirks", {
        analogy_domain: "none",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toContain("analogy domain cleared");
    });

    it("should set multiple quirks at once", async () => {
      const result = await registry.executeTool("set_quirks", {
        catchphrase: "Hello!",
        sign_off: "Goodbye!",
      });

      expect(result.success).toBe(true);
      expect(result.changes).toHaveLength(2);
    });

    it("should reject invalid analogy domain", async () => {
      await expect(
        registry.executeTool("set_quirks", { analogy_domain: "invalid" }),
      ).rejects.toThrow("Invalid analogy_domain");
    });

    it("should reject empty input", async () => {
      await expect(registry.executeTool("set_quirks", {})).rejects.toThrow("No quirk options");
    });
  });
});
