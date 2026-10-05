import { describe, expect, it, vi } from "vitest";
vi.mock("../../agent/llm/provider-factory", () => ({
  LLMProviderFactory: {
    createProvider: () => {
      throw new Error("offline");
    },
  },
}));
import { selectAgentsForTask } from "../capabilityMatcher";
import type { AgentRole } from "../../../shared/types";
const roles = [
  { id: "coder", name: "coder", capabilities: ["code"], sortOrder: 1 },
  { id: "architect", name: "architect", capabilities: ["code", "plan"], sortOrder: 2 },
  { id: "researcher", name: "researcher", capabilities: ["research", "analyze"], sortOrder: 10 },
  { id: "writer", name: "writer", capabilities: ["write", "document"], sortOrder: 11 },
  { id: "reviewer", name: "reviewer", capabilities: ["review"], sortOrder: 12 },
].map((r) => ({ ...r, displayName: r.name, isActive: true })) as AgentRole[];
describe("Chinese team fallback selection", () => {
  it("selects research, verification and writing roles when the provider is unavailable", async () => {
    const selected = await selectAgentsForTask(
      "调研企业级 AI 工作站市场，核对来源并给我一份可分享的报告。",
      roles,
    );
    expect(selected.members.map((r) => r.id).sort()).toEqual(["researcher", "reviewer", "writer"]);
    expect(selected.members).toContain(selected.leader);
  });
  it("does not pad a weather lookup with coders or architects", async () => {
    const selected = await selectAgentsForTask("帮我查一下明天东京的天气", roles);
    expect(selected.members.map((r) => r.id)).toEqual(["researcher"]);
  });
  it("still selects programmers for actual Chinese coding tasks", async () => {
    const selected = await selectAgentsForTask("修复代码中的接口问题并重构脚本", roles);
    expect(selected.members.map((r) => r.id)).toContain("coder");
  });
});
