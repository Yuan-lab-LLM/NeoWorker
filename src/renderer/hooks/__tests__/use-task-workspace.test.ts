import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, Workspace } from "../../../shared/types";
import { TASK_WORKSPACE_LOAD_TIMEOUT_MS, useTaskWorkspace } from "../use-task-workspace";

const task = { id: "expert", workspaceId: "original" };
const workspace = { id: "original", path: "/original" } as Workspace;
let renderer: ReactTestRenderer;
let state: ReturnType<typeof useTaskWorkspace>;
let selectWorkspace: ReturnType<typeof vi.fn>;
let setWorkspace = vi.fn<(value: React.SetStateAction<Workspace | null>) => void>();
let requestSequence: { current: number };
function Harness({ selected = task, current = null }: {
  selected?: Pick<Task, "id" | "workspaceId">;
  current?: Workspace | null;
}) {
  state = useTaskWorkspace({ task: selected, workspace: current, setWorkspace, requestSequence, remote: false });
  return null;
}
async function mount() {
  await act(async () => { renderer = create(React.createElement(Harness)); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  selectWorkspace = vi.fn();
  setWorkspace = vi.fn<(value: React.SetStateAction<Workspace | null>) => void>();
  requestSequence = { current: 0 };
  vi.stubGlobal("window", { electronAPI: { selectWorkspace } });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("selected task workspace loading", () => {
  it("reports a missing historical folder without substituting another workspace", async () => {
    selectWorkspace.mockRejectedValue(new Error("Error invoking remote method 'workspace:select': WORKSPACE_PATH_UNAVAILABLE:missing: /original"));
    await mount();
    expect(state.error).toBe("missing");
    expect(selectWorkspace).toHaveBeenCalledExactlyOnceWith("original");
    expect(setWorkspace).not.toHaveBeenCalled();
    // Task events recreate the task object; that must not restart a failed request.
    await act(async () => renderer.update(React.createElement(Harness, { selected: { ...task } })));
    expect(selectWorkspace).toHaveBeenCalledTimes(1);
    expect(state.error).toBe("missing");
  });

  it.each([
    ["WORKSPACE_PATH_UNAVAILABLE:unreadable: /original", "unavailable"],
    ["IPC disconnected", "failed"],
  ])("makes %s actionable instead of staying in loading", async (message, error) => {
    selectWorkspace.mockRejectedValue(new Error(message));
    await mount();
    expect(state.error).toBe(error);
    expect(setWorkspace).not.toHaveBeenCalled();
  });

  it("handles a removed workspace record and retries the same workspace after recovery", async () => {
    selectWorkspace.mockResolvedValueOnce(undefined).mockResolvedValueOnce(workspace);
    await mount();
    expect(state.error).toBe("missing");
    await act(async () => state.retry());
    expect(selectWorkspace.mock.calls).toEqual([["original"], ["original"]]);
    expect(setWorkspace).toHaveBeenCalledWith(workspace);
    expect(state.error).toBeNull();
  });

  it("does not repeatedly cancel a slow load as the expert's task updates", async () => {
    let finish!: (value: Workspace) => void;
    selectWorkspace.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount();
    await act(async () => renderer.update(React.createElement(Harness, { selected: { ...task } })));
    expect(selectWorkspace).toHaveBeenCalledTimes(1);
    await act(async () => finish(workspace));
    expect(setWorkspace).toHaveBeenCalledExactlyOnceWith(workspace);
  });

  it("discards a late error from the previous conversation", async () => {
    let fail!: (error: Error) => void;
    selectWorkspace.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }))
      .mockResolvedValueOnce({ id: "next-workspace" });
    await mount();
    await act(async () => renderer.update(React.createElement(Harness, { selected: { id: "next", workspaceId: "next-workspace" } })));
    await act(async () => fail(new Error("WORKSPACE_PATH_UNAVAILABLE:missing")));
    expect(state.error).toBeNull();
    expect(setWorkspace).toHaveBeenCalledExactlyOnceWith({ id: "next-workspace" });
  });

  it("bounds loading time and ignores a timed-out response after retry", async () => {
    vi.useFakeTimers();
    let finishOld!: (value: Workspace) => void;
    selectWorkspace.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(workspace);
    await mount();
    await act(async () => { vi.advanceTimersByTime(TASK_WORKSPACE_LOAD_TIMEOUT_MS); });
    expect(state.error).toBe("timeout");
    await act(async () => state.retry());
    await act(async () => finishOld({ ...workspace, path: "/stale" }));
    expect(setWorkspace).toHaveBeenCalledExactlyOnceWith(workspace);
    expect(state.error).toBeNull();
  });

  it("does not accept another conversation's folder or an invalid response", async () => {
    selectWorkspace.mockResolvedValue({ id: "other" });
    await mount();
    expect(state.error).toBe("failed");
    expect(setWorkspace).not.toHaveBeenCalled();
  });

  it("does not overwrite an explicit workspace selection with a pending response", async () => {
    let finish!: (value: Workspace) => void;
    selectWorkspace.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    await mount();
    requestSequence.current++;
    await act(async () => finish(workspace));
    expect(setWorkspace).not.toHaveBeenCalled();
    expect(state.error).toBeNull();
  });
});
