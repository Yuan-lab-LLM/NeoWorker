import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TaskEvent } from "../../../../shared/types";
import { applyPersistedLanguage } from "../../../i18n";
import { deriveLiveTaskProgress } from "../live-task-progress";
import { LiveTaskProgress } from "../LiveTaskProgress";

const event = (id: string, type: string, payload: Record<string, unknown> = {}, timestamp = 1000): TaskEvent =>
  ({ id, taskId: "t", type, payload, timestamp } as TaskEvent);
const derive = (events: TaskEvent[], now = 2000) => deriveLiveTaskProgress(events, "t", now);
afterEach(() => applyPersistedLanguage("zh-CN"));

describe("live execution progress", () => {
  it("reports waiting before tools run, without inventing completed stages", () => {
    const state = derive([event("u", "user_message")], 70000);
    expect(state.operations).toEqual([]);
    expect(state.status).toBe("正在等待模型的下一步响应");
    expect(state.silentSeconds).toBe(69);
  });

  it("shows the attached document name and changes state only after its result", () => {
    const events = [event("read", "tool_call", { runtime: "hermes", tool: "parse_document", toolCallId: "r", input: { path: "C:\\docs\\规范.docx" } })];
    expect(derive(events).operations).toEqual([{ id: "read", label: "读取 规范.docx", state: "active" }]);
    events.push(event("result", "tool_result", { runtime: "hermes", toolCallId: "r", result: { success: true } }));
    expect(derive(events).operations[0].state).toBe("completed");
    expect(derive(events).status).toBe("正在等待模型的下一步响应");
  });

  it("pairs parallel calls by identifier and keeps failures distinct", () => {
    const events = ["a", "b"].map(id => event(id, "tool_call", { tool: "read_file", toolUseId: id, input: { path: `${id}.txt` } }));
    events.push(event("b-error", "tool_error", { toolUseId: "b", error: "details" }));
    expect(derive(events).operations.map(op => [op.id, op.state])).toEqual([["b", "failed"], ["a", "active"]]);
    events.push(event("ambiguous", "tool_result", { tool: "read_file", toolCallId: "unrelated" }));
    expect(derive(events).operations.find(op => op.id === "a")?.state).toBe("active");
  });

  it("does not mark a failed result successful or guess ambiguous legacy pairing", () => {
    const events = [event("a", "tool_call", { tool: "write_file", toolUseId: "a" }), event("b", "tool_call", { tool: "write_file", toolUseId: "b" })];
    events.push(event("unknown", "tool_result", { tool: "write_file" }));
    expect(derive(events).operations.every(op => op.state === "active")).toBe(true);
    events.push(event("failed", "tool_result", { toolUseId: "a", result: { success: false } }));
    expect(derive(events).operations.find(op => op.id === "a")?.state).toBe("failed");
  });

  it("deduplicates projected calls and supports timeline-v2 events", () => {
    const payload = { legacyType: "tool_call", tool: "read_file", toolUseId: "read", input: { path: "rules.md" } };
    expect(derive([event("a", "timeline_step_updated", payload), event("b", "tool_call", payload)]).operations).toHaveLength(1);
  });

  it("does not leave nested id-less command events running after the wrapper finishes", () => {
    const events = [
      event("outer", "tool_call", { tool: "run_command", toolCallId: "c", input: { command: "node build_and_qa.mjs" } }),
      event("inner", "tool_call", { tool: "run_command", command: "node build_and_qa.mjs" }),
      event("inner-done", "tool_result", { tool: "run_command", success: true }),
      event("outer-done", "tool_result", { toolCallId: "c", result: { success: true } }),
    ];
    const state = derive(events);
    expect(state.activeCount).toBe(0);
    expect(state.operations).toEqual([{ id: "outer", label: "生成并检查幻灯片", state: "completed" }]);
  });

  it("pairs a legacy skill completion whose identifier exists only on the result", () => {
    const state = derive([event("start", "tool_call", { tool: "Skill", input: { skill: "presentation-studio" } }),
      event("result", "tool_result", { tool: "Skill", toolUseId: "Skill:123", result: { success: true } })]);
    expect(state.activeCount).toBe(0);
    expect(state.operations).toEqual([{ id: "start", label: "读取技能说明", state: "completed" }]);
  });

  it("bounds parallel operations and never displays command paths", () => {
    const state = derive(Array.from({ length: 43 }, (_, i) => event(String(i), "tool_call", {
      tool: "run_command", toolCallId: String(i), input: { command: "node /private/secret/build_and_qa.mjs" },
    })));
    expect(state.activeCount).toBe(43);
    expect(state.operations).toHaveLength(2);
    const html = renderToStaticMarkup(createElement(LiveTaskProgress, { state }));
    expect(html).toContain("43 项操作同时进行");
    expect(html.match(/生成并检查幻灯片/g)).toHaveLength(1);
    expect(html).not.toContain("/private");
  });

  it("uses structured batch progress and accepts runtime liveness without thought text", () => {
    const events = [event("vision", "tool_call", { tool: "read_pdf_visual", toolCallId: "v" }),
      event("progress", "progress_update", { runtime: "hermes", phase: "visual_review", completed: 3, total: 5 }),
      event("heartbeat", "progress_update", { runtime: "hermes", phase: "model_response", content: "PRIVATE REASONING" }, 9000)];
    const state = derive(events, 11000);
    expect(state.status).toBe("检查页面视觉效果 · 已检查 3/5 页");
    expect(state.silentSeconds).toBe(2);
    expect(JSON.stringify(state)).not.toContain("PRIVATE");
  });

  it("scopes progress to the current task and latest user turn", () => {
    const events = [event("old", "tool_call", { tool: "read_file" }), event("next", "user_message"), { ...event("foreign", "tool_call"), taskId: "other" }];
    expect(derive(events).operations).toEqual([]);
  });

  it("keeps recent operations visible while model heartbeats arrive without displaying reasoning", () => {
    const state = derive([event("read", "tool_call", { tool: "read_file", input: { path: "rules.docx" } }),
      event("done", "tool_result", { tool: "read_file", result: { success: true, content: "PRIVATE FILE CONTENT" } }),
      event("thought", "hermes_runtime_update", { sessionUpdate: "agent_thought_chunk", content: "PRIVATE REASONING" }),
      event("alive", "progress_update", { phase: "model_response", heartbeat: true }, 60000)], 62000);
    expect(state.operations[0].state).toBe("completed");
    expect(state.status).toContain("模型正在处理下一步");
    expect(state.silentSeconds).toBe(2);
    expect(JSON.stringify(state)).not.toContain("PRIVATE");
  });

  it("does not expose shell command arguments in the overview", () => {
    const state = derive([event("shell", "tool_call", { tool: "run_command", input: { command: "echo SECRET_TOKEN" } })]);
    expect(state.operations[0].label).toBe("运行命令");
    expect(JSON.stringify(state)).not.toContain("SECRET_TOKEN");
  });

  it("shows approval waiting and renders progress without needing the execution-record toggle", () => {
    const state = derive([event("read", "tool_call", { tool: "read_file", input: { path: "rules.docx" } }), event("approval", "approval_requested")]);
    const html = renderToStaticMarkup(createElement(LiveTaskProgress, { state }));
    expect(html).not.toContain("正在执行上面的操作");
    expect(html).toContain("等待你批准操作");
    expect(html).toContain('role="status"');
  });

  it("bounds settled history and localizes the overview", () => {
    applyPersistedLanguage("en");
    const events = Array.from({ length: 5 }, (_, i) => [event(`c${i}`, "tool_call", { tool: "read_file", toolUseId: String(i), input: { path: `file${i}.txt` } }), event(`r${i}`, "tool_result", { toolUseId: String(i) })]).flat();
    const state = derive(events);
    expect(state.operations.map(op => op.id)).toEqual(["c4"]);
    expect(state.operations[0].label).toBe("Read file4.txt");
    expect(renderToStaticMarkup(createElement(LiveTaskProgress, { state }))).toContain("Execution progress");
  });

  it("resolves approvals by id without clearing another pending request", () => {
    const events = [event("a", "approval_requested", { approval: { id: "a" } }), event("b", "approval_requested", { approval: { id: "b" } })];
    events.push(event("grant", "approval_granted", { approvalId: "a" }));
    expect(derive(events).status).toBe("等待你批准操作");
    events.push(event("deny", "approval_denied", { approvalId: "b" }));
    expect(derive(events).status).toBe("正在等待模型的下一步响应");
  });
});
