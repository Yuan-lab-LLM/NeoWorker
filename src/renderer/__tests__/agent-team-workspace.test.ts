import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Workspace } from "../../shared/types";
import {
  mergeTeamWorkspaceOptions,
} from "../components/TeamWorkspacePanel";

const appPath = fileURLToPath(new URL("../App.tsx", import.meta.url));
const sidebarPath = fileURLToPath(
  new URL("../components/Sidebar.tsx", import.meta.url),
);
const collapsedSidebarPath = fileURLToPath(
  new URL("../components/CollapsedSidebarRail.tsx", import.meta.url),
);
const workspacePath = fileURLToPath(
  new URL("../components/TeamWorkspacePanel.tsx", import.meta.url),
);
const workspaceStylesPath = fileURLToPath(
  new URL("../components/team-workspace.css", import.meta.url),
);

describe("Agent team workspace", () => {
  it("mounts Agent Teams as its own first-class app destination", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain("const TeamWorkspacePanel = lazy");
    expect(source).toContain('currentView === "agentTeam" ? (');
    expect(source).toContain("<TeamWorkspacePanel");
    const panelInvocation = source.match(/<TeamWorkspacePanel[\s\S]*?\/>/)?.[0];
    expect(panelInvocation).toBeTruthy();
    expect(panelInvocation).not.toContain("tasks={tasks}");
    expect(source).not.toMatch(
      /currentView === "home"\s*\|\|\s*currentView === "agentTeam"\s*\?\s*\(/,
    );
  });

  it("exposes the destination in the primary sidebar", () => {
    const source = readFileSync(sidebarPath, "utf8");
    const collapsedSource = readFileSync(collapsedSidebarPath, "utf8");

    expect(source).toContain("isAgentTeamActive?: boolean");
    expect(source).toContain("onOpenAgentTeam?: () => void");
    expect(source).toContain('terminal-only">agent_team');
    expect(source).toContain('translate("sidebar.agentTeam", "Agent team")');
    expect(collapsedSource).toContain("isAgentTeamActive?: boolean");
    expect(collapsedSource).toContain("onOpenAgentTeam: () => void");
    expect(collapsedSource).toContain(
      'label={translate("sidebar.agentTeam", "Agent team")}',
    );
  });

  it("starts the existing collaborative engine without asking for team setup", () => {
    const source = readFileSync(workspacePath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(source).toContain("await onStartTask(");
    expect(source).toContain("withRunOutputLanguage(normalizedGoal, language)");
    expect(source).not.toContain("window.electronAPI.createTask({");
    expect(appSource).toContain("onStartTask={(");
    expect(appSource).toContain("selectedWorkspace,");
    expect(appSource).toContain("agentRoleId,");
    expect(appSource).toMatch(/handleCreateTask\(\s*title,\s*prompt,/);
    expect(appSource).toContain("collaborativeMode: true");
    expect(appSource).toContain('executionMode: "execute"');
    expect(source).not.toContain("getAgentRoles");
    expect(source).not.toContain("<AgentTeamsPanel");
    expect(source).not.toContain("onOpenAgentManagement");
  });

  it("uses the same page header contract as the other primary work surfaces", () => {
    const source = readFileSync(workspacePath, "utf8");

    expect(source).toContain(
      'import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader"',
    );
    expect(source).toContain("<NeoWorkerPageHeader");
    expect(source).toContain("icon={<UsersRound");
    expect(source).not.toContain("team-workspace-header-simple");
  });

  it("gives the task composer clear priority without wasting the recent-task width", () => {
    const styles = readFileSync(workspaceStylesPath, "utf8");

    expect(styles).toMatch(
      /\.team-workspace-start-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 2\.15fr\) minmax\(300px, 1fr\);/s,
    );
    expect(styles).not.toContain(".team-workspace-quick-start-simple::before");
    expect(styles).toMatch(
      /\.team-workspace-quick-start-simple\s*\{[^}]*var\(--color-text-primary\) 9%[^}]*0 1px 2px/s,
    );
    expect(styles).toMatch(
      /\.team-workspace-recent-list\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(styles).toContain("var(--color-bg-secondary) 44%");
    expect(styles).toMatch(
      /\.main-content\.team-workspace-main\s*\{[^}]*padding-top:\s*var\(--title-bar-height\);/s,
    );
  });

  it("keeps the shared header visible and responds to the usable content width", () => {
    const source = readFileSync(workspacePath, "utf8");
    const styles = readFileSync(workspaceStylesPath, "utf8");

    expect(source).toContain(
      'ref={pageRef} className="main-content team-workspace-main"',
    );
    expect(source).toContain("page.scrollTop = 0");
    expect(source).toContain("page.scrollLeft = 0");
    expect(styles).toMatch(
      /\.main-content\.team-workspace-main\s*\{[^}]*overflow:\s*hidden !important;/s,
    );
    expect(styles).toContain("@container (max-width: 900px)");
    expect(styles).toContain("@container (max-width: 640px)");
    expect(styles).not.toMatch(
      /@media \(max-width: 860px\)\s*\{[\s\S]*?\.team-workspace-main\s*\{[\s\S]*?overflow-y:\s*auto/s,
    );
  });

  it("waits for a written task and explicit submit after an expert is selected", () => {
    const source = readFileSync(workspacePath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(source).toContain("selectedRole: AgentRole | null");
    expect(source).toContain("onSelectedRoleChange(role)");
    expect(source).toContain(
      'Write down the specific tasks first, and the experts will only execute them after clicking "Start Task".',
    );
    expect(source).toContain(
      "Selecting an expert does not start execution.",
    );
    expect(source).toContain("disabled={!goal.trim() || isStarting}");
    expect(source).toContain("selectedRole?.id");
    expect(appSource).toContain("assignedAgentRoleId: agentRoleId");
    expect(appSource).toContain(
      "assignedAgentRoleId: options.assignedAgentRoleId",
    );
  });

  it("owns a simple agent builder while keeping automatic team creation as the default", () => {
    const source = readFileSync(workspacePath, "utf8");
    const styles = readFileSync(workspaceStylesPath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(source).toContain(
      'import { SimpleAgentBuilderPanel } from "./SimpleAgentBuilderPanel"',
    );
    expect(source).toContain("<SimpleAgentBuilderPanel");
    expect(source).toContain('"teamWorkspace.agents.open"');
    expect(source).toContain('"Create an agent"');
    expect(source).toContain('"teamWorkspace.agents.description"');
    expect(source).toContain(
      '"Describe in one sentence the work that requires it to be completed over a long period of time"',
    );
    expect(source).toContain('className="team-workspace-expert-entry-action"');
    expect(source).toMatch(
      /className="team-workspace-expert-entry-icon">\s*<Bot size=\{18\}/,
    );
    expect(source).toContain('"teamWorkspace.agents.createAction"');
    expect(styles).toMatch(
      /\.team-workspace-expert-entry-action\s*\{[^}]*background:\s*var\(--color-accent\)/s,
    );
    expect(source).not.toContain('mode="teamExperts"');
    expect(source).not.toContain('"指定专家"');
    expect(source).not.toContain('"查看专家库并选择一位负责人"');
    expect(appSource).toContain("const SimpleAgentBuilderPanel = lazy");
    expect(appSource).not.toContain("<AgentsHubPanel");
  });

  it("replaces the complex management page with the same concise builder", () => {
    const appSource = readFileSync(appPath, "utf8");

    expect(appSource).toContain('currentView === "agentsManage" ? (');
    expect(appSource).toContain("<SimpleAgentBuilderPanel");
    expect(appSource).not.toContain("agent-management-header");
    expect(appSource).not.toContain("为团队成员设定能力、部署渠道与运行边界");
  });

  it("allows the team workspace to be switched and explicitly scopes new tasks", () => {
    const source = readFileSync(workspacePath, "utf8");
    const appSource = readFileSync(appPath, "utf8");

    expect(source).toContain("<NeoWorkerSelectMenu");
    expect(source).toContain("window.electronAPI.listWorkspaces()");
    expect(source).toContain("window.electronAPI.getTempWorkspace()");
    expect(source).toContain("await onSelectWorkspace(nextWorkspace)");
    expect(source).toContain("await onAddWorkspace()");
    expect(source).toContain(
      "withRunOutputLanguage(normalizedGoal, language),\n        workspace,",
    );
    expect(appSource).toContain("reassignSelectedTask: false");
    expect(appSource).toContain(
      "handleChangeWorkspace({ reassignSelectedTask: false })",
    );
    expect(appSource).toContain("selectedWorkspace,");
  });

  it("deduplicates workspace options while keeping the current workspace first", () => {
    const makeWorkspace = (id: string, name: string): Workspace =>
      ({ id, name, path: `/tmp/${id}`, permissions: {} }) as Workspace;
    const current = makeWorkspace("current", "当前目录");
    const other = makeWorkspace("other", "其他目录");
    const temporary = makeWorkspace("temp-workspace", "Temporary Workspace");

    const merged = mergeTeamWorkspaceOptions(
      [other, current],
      current,
      temporary,
    );

    expect(merged.map((workspace) => workspace.id)).toEqual([
      "current",
      "other",
      "temp-workspace",
    ]);
  });

  it("keeps the first version to one goal, examples, and one start action", () => {
    const source = readFileSync(workspacePath, "utf8");

    expect(source).toContain("QUICK_TEAM_SUGGESTIONS");
    expect(source).toContain("teamWorkspace.quick.question");
    expect(source).toContain("team-workspace-suggestions");
    expect(source).toContain("teamWorkspace.quick.start");
    expect(source).not.toContain("QuickTeamScenarioId");
    expect(source).not.toContain("teamWorkspace.quick.advanced");
    expect(source).not.toContain("teamWorkspace.quick.viewAllRuns");
  });

  it("fills the empty state with workspace context, workflow guidance, and persisted recent runs", () => {
    const source = readFileSync(workspacePath, "utf8");

    expect(source).toContain("team-workspace-current-context");
    expect(source).toContain("team-workspace-workflow");
    expect(source).toContain("team-workspace-recent");
    expect(source).toContain("window.electronAPI.listRecentTeamTasks(4)");
    expect(source).toContain("window.electronAPI.onTeamRunEvent");
  });

  it("does not derive team history from sidebar pagination or the current workspace", () => {
    const source = readFileSync(workspacePath, "utf8");

    expect(source).not.toContain("getRecentCollaborativeTasks");
    expect(source).not.toContain("task.workspaceId === workspaceId");
  });
});
