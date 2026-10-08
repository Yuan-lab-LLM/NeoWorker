import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectContextPanel } from "../ProjectContextPanel";
import { WorkspaceIdentity } from "../WorkspaceIdentity";
import { workspaceDisplayName } from "../../utils/workspace-identity";
import { translate } from "../../i18n";
import type { Task, Workspace } from "../../../shared/types";

const workspace = { id: "__temp_workspace__:ui-one", name: "Temporary Workspace", path: "/tmp/one", isTemp: true } as Workspace;
const task = { id: "one", title: "会议纪要", workspaceId: workspace.id, status: "executing", createdAt: 1 } as Task;
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
function setup(api: Record<string, unknown>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    requestAnimationFrame: () => 0, cancelAnimationFrame: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    electronAPI: api,
  });
}

describe("workspace ownership UI", () => {
  it("uses the session title for default temporary names and preserves custom names", () => {
    expect(workspaceDisplayName(workspace, "会议纪要")).toBe("会议纪要");
    expect(workspaceDisplayName({ ...workspace, name: "年度规划" }, "会议纪要")).toBe("年度规划");
  });
  it("marks a shared workspace and saves a name without moving its folder", async () => {
    const onSelectWorkspace = vi.fn();
    const renameWorkspace = vi.fn(async (_id, name) => ({ ...workspace, name }));
    setup({ renameWorkspace });
    await act(async () => { renderer = create(React.createElement(WorkspaceIdentity, {
      workspace, task, context: { workspaceId: workspace.id, sessionCount: 2, sessions: [{ id: "one", title: "会议纪要" }], fileOrigins: [] }, onSelectWorkspace,
    })); });
    expect(JSON.stringify(renderer!.toJSON())).toContain("关联 2 个会话");
    await act(async () => renderer!.root.findByProps({ "aria-label": "重命名工作区" }).props.onClick());
    await act(async () => renderer!.root.findByType("input").props.onChange({ target: { value: "年度规划" } }));
    await act(async () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(renameWorkspace).toHaveBeenCalledWith(workspace.id, "年度规划");
    expect(onSelectWorkspace).toHaveBeenCalledWith({ ...workspace, name: "年度规划" });
  });
  it("does not show a previous workspace while the selected task is switching", async () => {
    setup({});
    await act(async () => { renderer = create(React.createElement(ProjectContextPanel, {
      workspace, task: { ...task, workspaceId: "another" }, events: [],
    })); });
    const html = JSON.stringify(renderer!.toJSON());
    expect(html).toContain("正在加载工作区");
    expect(html).not.toContain("Temporary Workspace");
    expect(html).not.toContain("/tmp/one");
  });
  it("keeps the panel close button available while a workspace is loading", async () => {
    setup({});
    const onCollapse = vi.fn();
    await act(async () => { renderer = create(React.createElement(ProjectContextPanel, {
      workspace: null, task, events: [], onCollapse,
    })); });
    expect(JSON.stringify(renderer!.toJSON())).toContain("正在加载工作区");
    await act(async () => renderer!.root.findByProps({ "aria-label": translate("workspaceContext.panel.close", "Close workspace panel") }).props.onClick());
    expect(onCollapse).toHaveBeenCalledOnce();
  });
  it("shows a missing-folder error with working recovery actions, without leaking the previous folder", async () => {
    setup({});
    const onRetryWorkspace = vi.fn();
    const onChangeWorkspace = vi.fn();
    await act(async () => { renderer = create(React.createElement(ProjectContextPanel, {
      workspace, task: { ...task, workspaceId: "missing" }, events: [],
      workspaceError: "missing", onRetryWorkspace, onChangeWorkspace,
    })); });
    const html = JSON.stringify(renderer!.toJSON());
    expect(html).toContain("未找到这个会话原来使用的工作区文件夹");
    expect(html).not.toContain("正在加载工作区");
    expect(html).not.toContain("/tmp/one");
    expect(renderer!.root.findByProps({ role: "alert" })).toBeTruthy();
    const button = (label: string) => renderer!.root.findAllByType("button").find(node => node.children.includes(label))!;
    await act(async () => button("重新加载").props.onClick());
    await act(async () => button("选择工作文件夹").props.onClick());
    expect(onRetryWorkspace).toHaveBeenCalledOnce();
    expect(onChangeWorkspace).toHaveBeenCalledOnce();
  });
  it("discards a late file response and defaults to outputs after switching tasks", async () => {
    let resolveOld!: (value: unknown[]) => void;
    const pending = new Promise<unknown[]>(resolve => { resolveOld = resolve; });
    const listHubFiles = vi.fn(() => pending);
    setup({ listHubFiles, getWorkspaceContext: async (id: string) => ({ workspaceId: id, sessionCount: 1, sessions: [], fileOrigins: [] }) });
    await act(async () => { renderer = create(React.createElement(ProjectContextPanel, { workspace, task, events: [] })); });
    const filesTab = () => renderer!.root.findAllByType("button").find(button => button.findAllByType("span").some(span => span.children.includes("全部文件")))!;
    await act(async () => filesTab().props.onClick());
    expect(listHubFiles).toHaveBeenCalled();
    const otherWorkspace = { ...workspace, id: "__temp_workspace__:ui-two", path: "/tmp/two" };
    const otherTask = { ...task, id: "two", title: "新会话", workspaceId: otherWorkspace.id };
    await act(async () => renderer!.update(React.createElement(ProjectContextPanel, { workspace: otherWorkspace, task: otherTask, events: [] })));
    await act(async () => resolveOld([{ id: "old-file", name: "old-secret.docx", path: "/tmp/one/old-secret.docx" }]));
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("old-secret.docx");
    expect(filesTab().props["aria-current"]).toBeUndefined();
  });
});
