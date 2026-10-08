import React from "react";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PersonalAssistantsPanel } from "../personal-assistants/PersonalAssistantsPanel";
import { PersonalAssistantContextBar } from "../personal-assistants/PersonalAssistantContextBar";
import { assistantConversations, assistantProjects } from "../personal-assistants/model";
import { applyPersistedLanguage } from "../../i18n";
import type { ManagedEnvironment, ManagedSession } from "../../../shared/types";

let renderer: ReactTestRenderer;
const agent = { id: "research", name: "Research assistant", status: "active", currentVersion: 1 };
const version = {
  agentId: "research",
  version: 1,
  systemPrompt: "Use sources",
  metadata: { studio: { personalAssistant: { kind: "research", preferences: ["Cite sources"] } } },
};
const project: ManagedEnvironment = {
  id: "project-epai",
  name: "EPAI",
  status: "active",
  kind: "neoworker_local",
  revision: 1,
  createdAt: 100,
  updatedAt: 100,
  config: { personalAssistantId: "research", workspaceId: "epai", filePaths: ["/epai/source.pdf"] },
};
const session: ManagedSession = {
  id: "conversation",
  agentId: "research",
  agentVersion: 1,
  workspaceId: "epai",
  createdAt: 100,
  environmentId: "project-epai",
  title: "EPAI comparison",
  backingTaskId: "original-task",
  status: "completed",
  updatedAt: 100,
};
const label = (node: ReactTestInstance): string =>
  node.children.map((child) => (typeof child === "string" ? child : label(child))).join("");
const button = (name: string) =>
  renderer.root.findAllByType("button").find((node) => label(node) === name)!;
function setup(overrides: Record<string, unknown> = {}) {
  applyPersistedLanguage("en");
  const api = {
    listManagedAgents: vi.fn(async () => [agent]),
    getManagedAgent: vi.fn(async () => ({ agent, currentVersion: version })),
    listManagedEnvironments: vi.fn(async () => [project]),
    listManagedSessions: vi.fn(async () => [session]),
    getManagedSessionWorkpaper: vi.fn(async () => ({ artifacts: [] })),
    createManagedSession: vi.fn(async () => ({
      ...session,
      id: "new-session",
      backingTaskId: "new-task",
    })),
    createPersonalAssistantProject: vi.fn(async () => ({ ...project, id: "new-project" })),
    createManagedAgent: vi.fn(async (data) => ({ agent: { ...agent, name: data.name }, version })),
    updateManagedAgent: vi.fn(),
    ...overrides,
  };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {
    electronAPI: api,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  return api;
}
const render = async (onOpenTask = vi.fn()) => {
  await act(async () => {
    renderer = create(React.createElement(PersonalAssistantsPanel, { onOpenTask }), {
      createNodeMock: () => ({ showModal() {}, close() {} }),
    });
  });
  return onOpenTask;
};
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("personal assistant conversation settings", () => {
  const context = {
    agentId: "research",
    agentName: "Research assistant",
    agentVersion: 1,
    environmentId: "project-epai",
    projectName: "EPAI",
    referenceFiles: ["/epai/source.pdf"],
    preferences: ["Cite sources"],
  };
  it("keeps the drawer open across task refreshes and saves future preferences without changing the current conversation", async () => {
    const api = setup();
    await act(async () => {
      renderer = create(React.createElement(PersonalAssistantContextBar, { context }));
    });
    await act(async () => button("Sources & preferences").props.onClick());
    await act(async () =>
      renderer.update(
        React.createElement(PersonalAssistantContextBar, { context: { ...context } }),
      ),
    );
    expect(renderer.root.findAllByType("aside")).toHaveLength(1);
    await act(async () => button("Edit assistant preferences").props.onClick());
    await act(async () =>
      renderer.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Use Chinese\nShow evidence" } }),
    );
    await act(async () => button("Save").props.onClick());
    expect(api.updateManagedAgent).toHaveBeenCalledWith({
      agentId: "research",
      metadata: {
        studio: {
          personalAssistant: { kind: "research", preferences: ["Use Chinese", "Show evidence"] },
        },
      },
    });
    expect(renderer.root.findByType("li").children).toEqual(["Cite sources"]);
    expect(renderer.root.findByProps({ role: "status" }).children).toEqual(["Preferences saved."]);
  });
  it("shows save failures and retains the user's draft for retry", async () => {
    setup({ updateManagedAgent: vi.fn().mockRejectedValue(new Error("Storage unavailable")) });
    await act(async () => {
      renderer = create(React.createElement(PersonalAssistantContextBar, { context }));
    });
    await act(async () => button("Sources & preferences").props.onClick());
    await act(async () => button("Edit assistant preferences").props.onClick());
    await act(async () =>
      renderer.root.findByType("textarea").props.onChange({ target: { value: "Use Chinese" } }),
    );
    await act(async () => button("Save").props.onClick());
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Storage unavailable",
    );
    expect(renderer.root.findByType("textarea").props.value).toBe("Use Chinese");
  });
});

describe("personal assistant conversations", () => {
  it("opens the exact existing task without creating or resuming an execution", async () => {
    const api = setup();
    const open = await render();
    await act(async () => button("Continue conversation").props.onClick());
    expect(open).toHaveBeenCalledWith("original-task");
    expect(api.createManagedSession).not.toHaveBeenCalled();
  });
  it("creates a new conversation only in the selected assistant project", async () => {
    const api = setup();
    const open = await render();
    await act(async () => button("Open assistant").props.onClick());
    await act(async () => button("New conversation").props.onClick());
    await act(async () =>
      renderer.root
        .findByType("textarea")
        .props.onChange({ target: { value: "Compare EPAI and PAI" } }),
    );
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(api.createManagedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "research",
        environmentId: "project-epai",
        initialEvent: {
          type: "user.message",
          content: [{ type: "text", text: "Compare EPAI and PAI" }],
        },
      }),
    );
    expect(open).toHaveBeenCalledWith("new-task");
  });
  it("lets an empty installation create a template assistant without starting any model request", async () => {
    const api = setup({
      listManagedAgents: vi.fn(async () => []),
      listManagedSessions: vi.fn(async () => []),
    });
    await render();
    await act(async () => button("Use this starter").props.onClick());
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(api.createManagedAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Research assistant",
        metadata: {
          studio: {
            personalAssistant: {
              kind: "research",
              preferences: ["Answer in English", "Cite original sources"],
            },
            memoryConfig: { mode: "disabled" },
          },
        },
      }),
    );
    expect(api.createManagedSession).not.toHaveBeenCalled();
  });
  it("keeps failed starts visible and allows another attempt", async () => {
    const api = setup({
      createManagedSession: vi
        .fn()
        .mockRejectedValueOnce(new Error("Model unavailable"))
        .mockResolvedValue({
          ...session,
          id: "recovered-session",
          backingTaskId: "recovered-task",
        }),
    });
    const open = await render();
    await act(async () => button("Open assistant").props.onClick());
    await act(async () => button("New conversation").props.onClick());
    await act(async () =>
      renderer.root.findByType("textarea").props.onChange({ target: { value: "Compare" } }),
    );
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(renderer.root.findByProps({ role: "alert" }).children).toContain("Model unavailable");
    await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(api.createManagedSession).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith("recovered-task");
  });
  it("never combines another assistant's project or another project's history", () => {
    expect(
      assistantProjects(
        [
          project,
          {
            ...project,
            id: "other",
            config: { ...project.config, personalAssistantId: "other-assistant" },
          },
        ],
        "research",
      ),
    ).toEqual([project]);
    expect(
      assistantConversations(
        [session, { ...session, id: "wrong", environmentId: "another-project" }],
        "research",
        project.id,
      ),
    ).toEqual([session]);
  });
});
