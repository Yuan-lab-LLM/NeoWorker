import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  getSidebarDateGroup,
  Sidebar,
  truncateSidebarTitleToFit,
} from "../Sidebar";

const stylesPath = fileURLToPath(
  new URL("../../styles/index.css", import.meta.url),
);
const sidebarPath = fileURLToPath(new URL("../Sidebar.tsx", import.meta.url));

describe("Sidebar top-level destinations", () => {
  it("groups sessions by their latest activity instead of their creation date", () => {
    const now = new Date("2026-07-28T12:00:00+08:00");

    expect(
      getSidebarDateGroup(
        {
          createdAt: new Date("2026-07-10T09:00:00+08:00").getTime(),
          updatedAt: new Date("2026-07-28T10:30:00+08:00").getTime(),
          pinned: false,
        },
        now,
      ),
    ).toBe("Today");
  });

  it("keeps failed sessions visible in the default conversation history", () => {
    const now = Date.now();
    const failedTitle = "Latest research report session";
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "failed-session",
            title: failedTitle,
            prompt: failedTitle,
            status: "failed",
            workspaceId: "ws-1",
            createdAt: now - 2_000,
            updatedAt: now - 2_000,
          },
          {
            id: "selected-completed-session",
            title: "Previously selected session",
            prompt: "Previously selected session",
            status: "completed",
            workspaceId: "ws-1",
            createdAt: now - 4_000,
            updatedAt: now,
          },
        ] as Any,
        selectedTaskId: "selected-completed-session",
        onSelectTask: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain(failedTitle);
    expect(markup).toContain("Previously selected session");
  });

  it("keeps the session list stationary when a session is selected", () => {
    const source = readFileSync(sidebarPath, "utf8");

    expect(source).toMatch(
      /<VirtualList[\s\S]*?onScrollNearEnd=\{onLoadMoreTasks\}[\s\S]*?suppressAutoScrollOnItemsChange/,
    );
    expect(source).not.toContain("scrollToIndex={selectedVirtualRowIndex}");
    expect(source).not.toContain("scrollRequestKey={selectedTaskId}");
    expect(source).not.toContain("selectedRow?.scrollIntoView");
  });

  it("truncates sidebar titles to the available width", () => {
    const measureByCharacters = (value: string) => value.length;

    expect(
      truncateSidebarTitleToFit(
        'check the "new country for onboarding',
        25,
        measureByCharacters,
      ),
    ).toBe('check the "new country...');

    expect(
      truncateSidebarTitleToFit(
        "I need to create a presentation",
        20,
        measureByCharacters,
      ),
    ).toBe("I need to create...");

    expect(
      truncateSidebarTitleToFit(
        "Check documentation please",
        18,
        measureByCharacters,
      ),
    ).toBe("Check documenta...");
  });

  it("keeps very narrow sidebar titles compact", () => {
    const measureByCharacters = (value: string) => value.length;

    expect(
      truncateSidebarTitleToFit("Presentation", 5, measureByCharacters),
    ).toBe("Pr...");
  });

  it("keeps Tools and Skills available as a primary destination in a new workspace", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain("new_session");
    expect(markup).toContain("everyday_agent");
    expect(markup).not.toContain("projects");
    expect(markup).not.toContain("sidebar-more-toggle");
    expect(markup).not.toContain("mission_control");
    expect(markup).toContain("automations");
    expect(markup).toContain("agent_team");
    expect(markup).not.toContain("capability_bundles");
    expect(markup).toContain("tools_and_skills");
    expect(markup).toContain("ideas");
    expect(markup).toContain('aria-label="工作"');
    expect(markup).not.toContain("sidebar-nav-group-label");
    expect(markup).not.toContain("sidebar-nav-divider");
    expect(markup).not.toContain('aria-label="团队配置"');
    expect(markup).not.toContain('aria-label="探索"');
  });

  it("shows one session search action next to the NeoWorker product name", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain('class="sidebar-brand-name">NeoWorker</span>');
    expect(markup).toContain('class="sidebar-brand-version">V0.1.2</span>');
    expect(markup).toContain('aria-label="NeoWorker V0.1.2"');
    expect(markup).not.toContain("sidebar-brand-search");
    expect(markup).toContain('class="sidebar-session-action');
    expect(markup.match(/aria-label="搜索会话"/g)).toHaveLength(1);
    expect(markup).not.toContain("sidebar-brand-menu");
    expect(markup).not.toContain('aria-haspopup="menu"');
    expect(markup).not.toContain("设置向导");
  });

  it("keeps Automation as the single run destination after work exists", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Existing task",
            prompt: "Existing task",
            status: "completed",
            workspaceId: "ws-1",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).not.toContain("mission_control");
    expect(markup).toContain("automations");
    expect(markup).not.toContain("projects");
    expect(markup).toContain("agent_team");
    expect(markup).toContain("ideas");
    expect(markup).toContain("tools_and_skills");
    expect(markup.indexOf("everyday_agent")).toBeLessThan(
      markup.indexOf("agent_team"),
    );
    expect(markup.indexOf("agent_team")).toBeLessThan(markup.indexOf("ideas"));
    expect(markup.indexOf("ideas")).toBeLessThan(markup.indexOf("automations"));
    expect(markup.indexOf("everyday_agent")).toBeLessThan(
      markup.indexOf("automations"),
    );
    expect(markup.indexOf("automations")).toBeLessThan(
      markup.indexOf("tools_and_skills"),
    );
  });

  it("marks Automation active without exposing a separate run-center destination", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [] as Any,
        selectedTaskId: null,
        isAutomationsActive: true,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).not.toContain("sidebar-more-toggle");
    expect(markup).not.toContain("mission_control");
    expect(markup).toContain("automations");
    expect(markup).toContain('aria-pressed="true"');
  });

  it("renders available app updates as a single Update button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [] as Any,
        selectedTaskId: null,
        updateInfo: {
          available: true,
          currentVersion: "0.5.45",
          latestVersion: "0.5.46",
          updateMode: "electron-updater",
        } as Any,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toMatch(/class="[^"]*\bupdate-banner\b[^"]*"/);
    expect(markup).toContain(">更新</button>");
    expect(markup).not.toContain("0.5.46");
    expect(markup).toContain('aria-label="关闭更新提示"');
  });

  it("prioritizes the session title over time while a session is awaiting response", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Investigate the onboarding session",
            prompt: "Investigate the onboarding session",
            status: "paused",
            workspaceId: "ws-1",
            createdAt: Date.now() - 13 * 60 * 1000,
            updatedAt: Date.now() - 13 * 60 * 1000,
          },
        ] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain("Investigate the onboarding session");
    expect(markup).toContain("cli-task-title-row-awaiting");
    expect(markup).toContain("等待中");
    expect(markup).not.toContain("cli-task-status awaiting");
    expect(markup).not.toContain("cli-session-indicator-awaiting");
    expect(markup).not.toContain("cli-task-time");
  });

  it("labels a new completion result and keeps completed status understandable", () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Heartbeat: Pending work from inbox",
            prompt: "Heartbeat: Pending work from inbox",
            status: "completed",
            source: "manual",
            workspaceId: "ws-1",
            createdAt: now - 60 * 1000,
            updatedAt: now - 60 * 1000,
          },
        ] as Any,
        completionAttentionTaskIds: ["task-1"],
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain("cli-task-time-wrap");
    expect(markup).not.toContain("lucide-circle-check");
    expect(markup).toContain("已完成");
    expect(markup).toContain("task-completion-dot");
    expect(markup).toContain('aria-label="新结果"');
    expect(markup).toContain("有新的完成结果，打开后标记为已查看");
    expect(markup.indexOf("task-completion-dot")).toBeLessThan(
      markup.indexOf('class="cli-task-time"'),
    );
  });

  it("keeps the completed marker after the new result has been viewed", () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Completed work",
            prompt: "Completed work",
            status: "completed",
            source: "manual",
            workspaceId: "ws-1",
            createdAt: now - 60 * 1000,
            updatedAt: now - 60 * 1000,
          },
        ] as Any,
        completionAttentionTaskIds: ["task-1"],
        selectedTaskId: "task-1",
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).not.toContain("lucide-circle-check");
    expect(markup).toContain("task-completion-dot");
    expect(markup).toContain('aria-label="已完成"');
    expect(markup).not.toContain("task-completion-unread");
  });

  it("keeps completion markers aligned in a stable trailing column", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.task-item-has-children\s+\.cli-collapse-btn-inline\s*\{[^}]*flex:\s*0 0 18px;[^}]*margin-left:\s*0;/s,
    );
    expect(source).toMatch(
      /\.cli-task-automation-slot\s*\{[\s\S]*?width:\s*14px;[\s\S]*?flex:\s*0 0 14px;/,
    );
    expect(source).toMatch(
      /\.cli-task-actions\s*\{[\s\S]*?width:\s*22px;[\s\S]*?flex:\s*0 0 22px;/,
    );
    expect(source).toMatch(
      /\.cli-task-actions\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?height:\s*22px;/,
    );
    expect(source).toMatch(
      /\.cli-more-btn\s+svg\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*16px;[\s\S]*?height:\s*16px;[\s\S]*?margin:\s*0;/,
    );
    expect(source).toMatch(
      /\.task-completion-dot\s*\{[\s\S]*?background:\s*color-mix\(\s*in srgb,\s*var\(--color-success/,
    );
  });

  it("marks automated task rows with a distinct icon before the session time", () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Manual parent",
            prompt: "Manual parent",
            status: "completed",
            source: "manual",
            workspaceId: "ws-1",
            createdAt: now - 5 * 60 * 1000,
            updatedAt: now - 5 * 60 * 1000,
          },
          {
            id: "task-2",
            parentTaskId: "task-1",
            title: "Update AGENTS.md",
            prompt: "Update AGENTS.md",
            status: "completed",
            source: "cron",
            workspaceId: "ws-1",
            createdAt: now - 7 * 60 * 60 * 1000,
            updatedAt: now - 7 * 60 * 60 * 1000,
          },
        ] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain("cli-task-automation-icon");
    expect(markup).toContain("自动化");
    const automatedIconIndex = markup.indexOf("cli-task-automation-icon");
    expect(automatedIconIndex).toBeGreaterThan(
      markup.indexOf("Update AGENTS.md"),
    );
    expect(automatedIconIndex).toBeLessThan(
      markup.indexOf('class="cli-task-time"', automatedIconIndex),
    );
  });

  it("keeps automated runs out of the default conversation list", () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "automated-task",
            title: "每日行业简报",
            prompt: "每日行业简报",
            status: "completed",
            source: "cron",
            workspaceId: "ws-1",
            createdAt: now,
            updatedAt: now,
          },
        ] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).not.toContain("每日行业简报");
    expect(markup).not.toContain("automated-folder-header");
    expect(markup.match(/>自动化</g)).toHaveLength(1);
  });

  it("keeps a visible accessible disclosure control for sessions with children", () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      React.createElement(Sidebar, {
        workspace: { id: "ws-1", name: "Workspace", path: "/workspace" } as Any,
        tasks: [
          {
            id: "task-1",
            title: "Research project",
            prompt: "Research project",
            status: "completed",
            workspaceId: "ws-1",
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "task-2",
            parentTaskId: "task-1",
            title: "Researcher",
            prompt: "Researcher",
            status: "completed",
            workspaceId: "ws-1",
            createdAt: now,
            updatedAt: now,
          },
        ] as Any,
        selectedTaskId: null,
        onSelectTask: () => {},
        onOpenEverydayAgent: () => {},
        onNewSession: () => {},
        onOpenSettings: () => {},
        onOpenMissionControl: () => {},
        onOpenDevices: () => {},
        onTasksChanged: () => {},
      }),
    );

    expect(markup).toContain("cli-collapse-btn-inline");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="折叠"');
    expect(markup).toContain("lucide-chevron-down");
  });

  it("uses compact container-query rules when the sidebar is narrow", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.sidebar\s*\{[\s\S]*container-type:\s*inline-size;[\s\S]*\}/,
    );
    expect(source).toMatch(/@container\s*\(max-width:\s*280px\)/);
    expect(source).toMatch(
      /@container\s*\(max-width:\s*280px\)\s*\{[\s\S]*\.cli-task-time\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    );
    expect(source).toMatch(
      /@container\s*\(max-width:\s*280px\)\s*\{[\s\S]*\.cli-task-item\s*\{[\s\S]*gap:\s*4px;[\s\S]*padding-right:\s*6px\s*!important;[\s\S]*\}/,
    );
    expect(source).toMatch(
      /@container\s*\(max-width:\s*280px\)\s*\{[\s\S]*\.cli-task-time-wrap\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*22px;[\s\S]*flex:\s*0 0 22px;[\s\S]*\}/,
    );
    expect(source).toMatch(
      /@container\s*\(max-width:\s*280px\)\s*\{[\s\S]*\.cli-task-actions\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*auto;[\s\S]*right:\s*0;[\s\S]*transform:\s*translateY\(-50%\);[\s\S]*\}/,
    );
    expect(source).toMatch(
      /@container\s*\(max-width:\s*280px\)\s*\{[\s\S]*\.cli-task-item:hover\s+\.task-completion-dot[\s\S]*opacity:\s*0;[\s\S]*\}/,
    );
  });
});
