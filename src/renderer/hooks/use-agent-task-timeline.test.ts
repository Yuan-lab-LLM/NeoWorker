import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskEvent, TaskTimelinePageRequest } from "../../shared/types";
import { useAgentTaskTimeline } from "./use-agent-task-timeline";

const task = (id: string) =>
  ({
    id,
    status: "executing",
    title: id,
    prompt: "研究",
    createdAt: 1,
    updatedAt: 1,
    workspaceId: "ws",
  }) as Task;
const event = (id: string, n: number) =>
  ({
    id: `${id}-${n}`,
    taskId: id,
    timestamp: n,
    type: "assistant_message",
    payload: { message: `${id} message ${n}` },
  }) as TaskEvent;
const page = (taskId: string, events: TaskEvent[], more = false) => ({
  taskId,
  events,
  hasMoreHistory: more,
  nextCursor: more
    ? { id: events[0]?.id, order: events[0]?.timestamp, timestamp: events[0]?.timestamp }
    : null,
  summary: {
    eventCount: events.length,
    payloadBytes: 0,
    truncatedEventCount: 0,
    largestEventPayloadBytes: 0,
  },
});
let view: ReactTestRenderer | undefined;
let result: ReturnType<typeof useAgentTaskTimeline>;
function Probe({ id, live = [] }: { id: string; live?: TaskEvent[] }) {
  result = useAgentTaskTimeline(task(id), live);
  return null;
}
afterEach(async () => {
  if (view) await act(async () => view!.unmount());
  view = undefined;
  vi.unstubAllGlobals();
});
function install(api: Record<string, unknown>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { electronAPI: { onTaskEvent: vi.fn(() => () => {}), ...api } });
}
describe("expert-specific history", () => {
  it("loads all 515 events over pages without the shared 300-event cap", async () => {
    const records = Array.from({ length: 515 }, (_, n) => event("ares", n + 1));
    const getPage = vi.fn(async (request: TaskTimelinePageRequest) => {
      const end = request.cursor ? request.cursor.order - 1 : records.length;
      const start = Math.max(0, end - 160);
      return page(request.taskId, records.slice(start, end), start > 0);
    });
    install({ getTaskTimelinePage: getPage });
    await act(async () => {
      view = create(React.createElement(Probe, { id: "ares", live: [event("apollo", 999)] }));
    });
    expect(result.events).toHaveLength(160);
    while (result.hasMore)
      await act(async () => {
        await result.loadMore();
      });
    expect(result.events.map((e) => e.id)).toEqual(records.map((e) => e.id));
    expect(getPage).toHaveBeenCalledTimes(4);
    expect(result.events.some((e) => e.taskId === "apollo")).toBe(false);
  });

  it("ignores the previous expert's in-flight page when switching tabs", async () => {
    let release!: (value: ReturnType<typeof page>) => void;
    install({
      getTaskTimelinePage: vi.fn((request) =>
        request.taskId === "ares"
          ? new Promise((resolve) => {
              release = resolve;
            })
          : Promise.resolve(page("apollo", [event("apollo", 1)])),
      ),
    });
    await act(async () => {
      view = create(React.createElement(Probe, { id: "ares" }));
    });
    await act(async () => {
      view!.update(React.createElement(Probe, { id: "apollo" }));
    });
    await act(async () => {
      release(page("ares", [event("ares", 1)]));
    });
    expect(result.events.map((e) => e.id)).toEqual(["apollo-1"]);
  });

  it("preserves live events that arrive while the initial page is loading", async () => {
    let release!: (value: ReturnType<typeof page>) => void;
    let emit!: (event: TaskEvent) => void;
    install({
      getTaskTimelinePage: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      onTaskEvent: (handler: (event: TaskEvent) => void) => {
        emit = handler;
        return () => {};
      },
    });
    await act(async () => {
      view = create(React.createElement(Probe, { id: "ares" }));
    });
    await act(async () => {
      emit(event("ares", 2));
      release(page("ares", [event("ares", 1)]));
    });
    expect(result.events.map((e) => e.id)).toEqual(["ares-1", "ares-2"]);
  });
});

it.runIf(Boolean(process.env.NEOWORKER_TEAM_REPLAY_FIXTURE))(
  "replays each real expert's event identities without loss or cross-task records",
  async () => {
    const { readFileSync } = await import("node:fs");
    const data = JSON.parse(
      readFileSync(process.env.NEOWORKER_TEAM_REPLAY_FIXTURE!, "utf8"),
    ) as Array<{ task: { id: string }; events: TaskEvent[] }>;
    install({
      getTaskTimelinePage: async (request: TaskTimelinePageRequest) => {
        const records = data.find((entry) => entry.task.id === request.taskId)!.events;
        const end = request.cursor?.id
          ? records.findIndex((entry) => entry.id === request.cursor!.id)
          : records.length;
        const start = Math.max(0, end - 160);
        return page(request.taskId, records.slice(start, end), start > 0);
      },
    });
    for (const entry of data) {
      await act(async () => {
        if (view) view.update(React.createElement(Probe, { id: entry.task.id }));
        else view = create(React.createElement(Probe, { id: entry.task.id }));
      });
      while (result.hasMore)
        await act(async () => {
          await result.loadMore();
        });
      expect(new Set(result.events.map((event) => event.id))).toEqual(
        new Set(entry.events.map((event) => event.id)),
      );
      expect(result.events.every((event) => event.taskId === entry.task.id)).toBe(true);
    }
  },
);
