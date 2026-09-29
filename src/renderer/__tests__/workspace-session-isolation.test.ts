import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("App.tsx", readFileSync(new URL("../App.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function loadFunction(name: string, environment: Record<string, unknown>) {
  let initializer = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer!.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!initializer) throw new Error(`Missing App function ${name}`);
  const code = ts.transpileModule(`const run = ${initializer};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(environment), `${code}\nreturn run;`)(...Object.values(environment));
}
function environment() {
  return {
    workspaceOpenSequenceRef: { current: 0 },
    setCurrentWorkspace: vi.fn(), setCurrentView: vi.fn(), setCurrentProjectId: vi.fn(),
    setSelectedTaskId: vi.fn(), setEvents: vi.fn(), clearRemoteTaskView: vi.fn(),
    console: { error: vi.fn() },
    window: { electronAPI: { getTempWorkspace: vi.fn() } },
  };
}

describe("new session workspace isolation", () => {
  it("allocates a new folder for each session and immediately disconnects the previous folder", async () => {
    const env = environment();
    env.window.electronAPI.getTempWorkspace.mockResolvedValueOnce({ id: "new-one" }).mockResolvedValueOnce({ id: "new-two" });
    const start = loadFunction("handleNewSession", env);
    await start(); await start();
    expect(env.window.electronAPI.getTempWorkspace.mock.calls).toEqual([[{ createNew: true }], [{ createNew: true }]]);
    expect(env.setCurrentWorkspace.mock.calls).toEqual([[null], [{ id: "new-one" }], [null], [{ id: "new-two" }]]);
    expect(env.setSelectedTaskId).toHaveBeenCalledWith(null);
  });
  it("does not let an older allocation replace a newer session", async () => {
    const env = environment();
    let resolveFirst!: (value: unknown) => void;
    env.window.electronAPI.getTempWorkspace.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ id: "latest" });
    const start = loadFunction("handleNewSession", env);
    const first = start(); await start(); resolveFirst({ id: "stale" }); await first;
    expect(env.setCurrentWorkspace).not.toHaveBeenCalledWith({ id: "stale" });
    expect(env.setCurrentWorkspace).toHaveBeenLastCalledWith({ id: "latest" });
  });
  it("routes clear through new-session allocation", () => {
    const start = vi.fn();
    loadFunction("handleClearTaskView", { handleNewSession: start })();
    expect(start).toHaveBeenCalledOnce();
  });
  it("startup requests a fresh folder instead of reusing an existing temporary folder", async () => {
    const env = environment();
    env.window.electronAPI.getTempWorkspace.mockResolvedValue({ id: "startup-new" });
    await loadFunction("initWorkspace", { ...env, currentWorkspace: null })();
    expect(env.window.electronAPI.getTempWorkspace).toHaveBeenCalledWith({ createNew: true });
  });
  it("does not reassign a conversation when only its workspace name changes", async () => {
    const env = environment();
    const renamed = { id: "existing", name: "年度规划" };
    const updateTaskWorkspace = vi.fn();
    const select = loadFunction("handleSelectWorkspace", {
      ...env, useCallback: (callback: unknown) => callback,
      selectedTaskId: "one", selectedTaskIdRef: { current: "one" },
      tasksRef: { current: [{ id: "one", workspaceId: "existing" }] },
      currentProjectId: null, remoteTaskView: null, addToast: vi.fn(),
      window: { electronAPI: { selectWorkspace: vi.fn().mockResolvedValue(renamed), updateTaskWorkspace } },
    });
    await select(renamed);
    expect(updateTaskWorkspace).not.toHaveBeenCalled();
    expect(env.setCurrentWorkspace).toHaveBeenCalledWith(renamed);
  });
  it("ignores workspace selection returned after navigating to a different conversation", async () => {
    const env = environment();
    let finish!: (value: unknown) => void;
    const selectedTaskIdRef = { current: "one" };
    const updateTaskWorkspace = vi.fn();
    const select = loadFunction("handleSelectWorkspace", {
      ...env, useCallback: (callback: unknown) => callback,
      selectedTaskId: "one", selectedTaskIdRef,
      currentProjectId: null, remoteTaskView: null, addToast: vi.fn(),
      window: { electronAPI: { selectWorkspace: () => new Promise(resolve => { finish = resolve; }), updateTaskWorkspace } },
    });
    const pending = select({ id: "shared" });
    selectedTaskIdRef.current = "two";
    finish({ id: "shared" });
    await pending;
    expect(updateTaskWorkspace).not.toHaveBeenCalled();
    expect(env.setCurrentWorkspace).not.toHaveBeenCalled();
  });
});
