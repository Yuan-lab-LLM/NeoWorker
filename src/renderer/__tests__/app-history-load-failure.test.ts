import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { TaskEvent } from "../../shared/types";
import { loadTaskTimelineWithLegacyFallback } from "../utils/task-event-stream";

// Execute the actual App loader with controlled IPC timing. Mounting the whole
// desktop shell would require unrelated services and obscure this race.
const source = ts.createSourceFile(
  "App.tsx",
  readFileSync(new URL("../App.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
let loaderSource = "";
function visit(node: ts.Node): void {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "loadHistoricalEvents") {
    loaderSource = node.initializer!.getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!loaderSource) throw new Error("App history loader was not found");
const compiled = ts.transpileModule(`const load = ${loaderSource};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const createLoader = new Function("env", `
  const { performance, requestedTaskId, window, cancelled, console,
    loadTaskTimelineWithLegacyFallback, cachedTimeline, latestAttentionEvent, setEvents } = env;
  ${compiled}
  return load;
`) as (env: Record<string, unknown>) => () => Promise<void>;

describe("App history loading failure", () => {
  it.each([false, true])("retains incoming dialogue after both history APIs fail (attention=%s)", async (hasAttention) => {
    let rejectPage!: (error: Error) => void;
    const pendingPage = new Promise<never>((_, reject) => { rejectPage = reject; });
    const question = {
      id: "question", taskId: "task-1", type: "user_message", timestamp: 1,
      payload: { message: "请分析这份会议纪要" },
    } as TaskEvent;
    const reply = {
      ...question, id: "reply", type: "assistant_message", timestamp: 2,
      payload: { message: "会议决议与行动项如下……" },
    } as TaskEvent;
    let visible: TaskEvent[] = [];
    const setEvents = vi.fn((next: TaskEvent[] | ((prev: TaskEvent[]) => TaskEvent[])) => {
      visible = typeof next === "function" ? next(visible) : next;
    });
    const load = createLoader({
      performance, requestedTaskId: "task-1", cancelled: false,
      console: { error: vi.fn() }, cachedTimeline: undefined,
      latestAttentionEvent: hasAttention ? question : undefined,
      setEvents, loadTaskTimelineWithLegacyFallback,
      window: { electronAPI: {
        getTaskTimelinePage: () => pendingPage,
        getTaskEvents: async () => { throw new Error("legacy history unavailable"); },
      } },
    });
    const loading = load();
    // Live delivery happens while the initial uncached history request waits.
    visible = [question, reply];
    rejectPage(new Error("history unavailable"));
    await loading;
    expect(visible).toEqual([question, reply]);
  });
});
