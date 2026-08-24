import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("automation hub simplification", () => {
  it("is the only top-level destination for automation tasks and run records", () => {
    const appSource = readSource("../../App.tsx");
    const sidebarSource = readSource("../Sidebar.tsx");
    const railSource = readSource("../CollapsedSidebarRail.tsx");

    expect(sidebarSource).toContain(
      'translate("sidebar.automations", "自动化")',
    );
    expect(sidebarSource).not.toContain("sidebar.missionControl");
    expect(sidebarSource).not.toContain("onOpenMissionControl");
    expect(railSource).toContain('translate("sidebar.automations", "自动化")');
    expect(railSource).not.toContain("sidebar.missionControl");
    expect(appSource).toMatch(
      /const handleOpenMissionControl = useCallback\(\(\) => \{\s*setAutomationFocusSection\("activity"\);\s*setCurrentView\("automations"\);/s,
    );
  });

  it("exposes only the simple automation creation flow", () => {
    const source = readSource("../AutomationHubPanel.tsx");

    expect(source).toContain('type AutomationTab = "tasks" | "history"');
    expect(source).toContain("让 NeoWorker 按时完成重复工作");
    expect(source).toContain("import { NeoWorkerPageHeader }");
    expect(source).toContain("<NeoWorkerPageHeader");
    expect(source).toContain("icon={<Clock3");
    expect(source).not.toContain('<header className="aw2-header">');
    expect(source).not.toContain("RoutineSettingsPanel");
    expect(source).not.toContain("需要按邮件、API 或连接器事件执行？");
    expect(source).not.toContain("aw2-advanced-automation");
    expect(source).not.toContain('className="aw2-summary"');
    expect(source).not.toContain(
      'type AutomationTab = "scheduled" | "rules" | "history"',
    );
  });

  it("does not expose the legacy routine editor from settings", () => {
    const source = readSource("../Settings.tsx");

    expect(source).not.toContain("RoutineSettingsPanel");
    expect(source).not.toContain('automationsSubTab: "routines"');
    expect(source).not.toContain('items: ["routines", "scheduled"]');
  });

  it("keeps internal maintenance tasks out of user-facing run history", () => {
    const source = readSource("../AutomationHubPanel.tsx");

    expect(source).toContain('task.source !== "cron"');
    expect(source).toContain("task.heartbeatRunId");
    expect(source).toContain("/^heartbeat:/i");
    expect(source).toContain("task.agentConfig?.scheduledJobId");
    expect(source).toContain("每次自动化执行后都会留下结果");
    expect(source).toContain("执行成功，结果已保存");
    expect(source).not.toContain("查看全部任务");
    expect(source).not.toContain("tasks.filter(isAutomatedSession)");
  });

  it("uses one run-history list and one empty state instead of three lanes", () => {
    const source = readSource("../AutomationHubPanel.tsx");
    const styles = readSource("../automation-hub.css");

    expect(source).toContain('className="aw2-history-list"');
    expect(source).toContain('className="aw2-history-empty"');
    expect(source).toContain("还没有运行记录");
    expect(source).toContain("getAutomationRunStatus");
    expect(source).not.toContain("DashboardLane");
    expect(source).not.toContain("没有未完成的自动化");
    expect(source).not.toContain("最近运行");
    expect(source).toContain('className="aw2-history-heading"');
    expect(styles).toMatch(/\.aw2-history-body\s*\{[^}]*margin-top:\s*16px;/s);
    expect(styles).toMatch(
      /\.aw2-history-body\s*\{[^}]*border:\s*1px solid var\(--color-border\);/s,
    );
    expect(styles).not.toMatch(/\.aw2-runs\s*\{[^}]*border:/s);
    expect(styles).not.toMatch(/\.aw2-recent-panel\s*\{/s);
  });

  it("filters the unified run history without bringing back separate status lanes", () => {
    const source = readSource("../AutomationHubPanel.tsx");
    const styles = readSource("../automation-hub.css");

    expect(source).toContain(
      'type AutomationHistoryFilter = "all" | "active" | "attention" | "completed"',
    );
    expect(source).toContain('aria-label="筛选运行记录"');
    expect(source).toContain("aria-pressed={historyFilter === filter.id}");
    expect(source).toContain('{ id: "all", label: "全部"');
    expect(source).toContain('{ id: "active", label: "运行中"');
    expect(source).toContain('{ id: "attention", label: "需处理"');
    expect(source).toContain('{ id: "completed", label: "已完成"');
    expect(source).toContain(
      "const filteredHistory = automation[historyFilter]",
    );
    expect(source).toContain(
      'historyFilter === "all" ? "创建自动化" : "查看全部记录"',
    );
    expect(styles).toContain(".aw2-history-filters");
    expect(styles).toContain(
      '.aw2-history-filters button[aria-pressed="true"]',
    );
    expect(styles).toContain("overflow-x: auto");
  });

  it("keeps the default task editor focused on the task and a friendly schedule", () => {
    const source = readSource("../ScheduledTasksSettings.tsx");

    expect(source).toContain("要自动完成什么？");
    expect(source).toContain("什么时候执行？");
    expect(source).toContain("SIMPLE_SCHEDULE_CHOICES");
    expect(source).toContain("NeoWorkerSelectMenu");
    expect(source).toContain('className="automation-job-schedule-select"');
    expect(source).toContain("任务名称（可选）");
    expect(source).toContain("留空时根据任务内容自动命名");
    expect(source).toContain('<details className="automation-job-advanced">');
    expect(source).toContain("名称、工作区、权限和结果推送");
    expect(source).toContain("setSelectedTemplate(template)");
    expect(source).toContain("setShowCreateModal(true)");
  });

  it("uses branded selection menus and a structured automation detail card", () => {
    const source = readSource("../ScheduledTasksSettings.tsx");
    const selectStyles = readSource("../neo-worker-select-menu.css");
    const automationStyles = readSource("../automation-settings.css");

    expect(source).not.toContain("<select");
    expect(source).toContain("intervalScheduleOptions");
    expect(source).toContain("cronScheduleOptions");
    expect(source).toContain("workspaceOptions");
    expect(source).toContain("deliveryChannelOptions");
    expect(source).toContain("parseFriendlyCron");
    expect(source).toContain("buildFriendlyCron");
    expect(source).toContain('className="automation-job-friendly-cron"');
    expect(source).toContain('type="time"');
    expect(source).toContain(
      'className="automation-job-friendly-cron-weekdays"',
    );
    expect(source).toContain('className="automation-job-cron-advanced"');
    expect(source).not.toContain('className="automation-job-custom-cron"');
    expect(source).toContain('className="scheduled-job-summary-grid"');
    expect(source).toContain('className="scheduled-job-detail-grid"');
    expect(selectStyles).toContain(".neoworker-select-option.selected::before");
    expect(selectStyles).toContain("@keyframes neoworker-select-appear");
    expect(automationStyles).toContain(".scheduled-job-result-metrics");
    expect(automationStyles).toContain(".scheduled-job-history-row:hover");
  });

  it("limits the first template view and lets users reveal the rest", () => {
    const source = readSource("../ScheduledTasksSettings.tsx");

    expect(source).toContain("templates.slice(0, 6)");
    expect(source).toContain("查看全部 ${templates.length} 个模板");
    expect(source).toContain("scheduled-template-more");
  });

  it("ships a distinct NeoWorker template library instead of mirroring competitor presets", () => {
    const hubSource = readSource("../AutomationHubPanel.tsx");
    const settingsSource = readSource("../ScheduledTasksSettings.tsx");
    const styles = readSource("../automation-hub.css");
    const templateBlock = hubSource.match(
      /const SCHEDULED_TASK_TEMPLATES:[\s\S]*?= \[([\s\S]*?)\n\];/,
    )?.[1];

    expect(templateBlock).toBeTruthy();
    expect(templateBlock?.match(/^\s+id:/gm)).toHaveLength(18);
    expect(hubSource).toContain('name: "工作区晨间导航"');
    expect(hubSource).toContain('name: "项目风险哨兵"');
    expect(hubSource).toContain('name: "知识库增量整理"');
    expect(hubSource).toContain('name: "周末轻量重启"');
    expect(hubSource).not.toContain('name: "每日 AI 新闻推送"');
    expect(hubSource).not.toContain('name: "每日 5 个英语单词"');
    expect(hubSource).not.toContain('name: "每日儿童睡前故事"');
    expect(hubSource).not.toContain('name: "经典电影推荐"');
    expect(settingsSource).toContain("NeoWorker 自动推进");
    expect(settingsSource).toContain("挑一件值得持续做的事");
    expect(settingsSource).toContain("getTemplateCategoryIcon");
    expect(styles).toMatch(
      /\.scheduled-template-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s,
    );
  });

  it("uses a responsive modal and collapsible advanced trigger styling", () => {
    const styles = readSource("../automation-hub.css");

    expect(styles).toContain(".automation-job-modal-grid");
    expect(styles).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(styles).not.toContain(".aw2-advanced-automation");
    expect(styles).toContain(".automation-job-advanced-body");
  });

  it("uses the same full-width masthead geometry as other primary pages", () => {
    const styles = readSource("../automation-hub.css");

    expect(styles).toContain(".aw2-hub > .neoworker-page-header");
    expect(styles).toContain("padding: var(--title-bar-height) 0 64px");
    expect(styles).toContain(".aw2-hub > :not(.neoworker-page-header)");
    expect(styles).not.toContain(".aw2-header h1");
  });

  it("uses an accessible segmented tab switcher with complete interaction states", () => {
    const source = readSource("../AutomationHubPanel.tsx");
    const styles = readSource("../automation-hub.css");

    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("aria-selected={activeTab === tab.id}");
    expect(source).toContain('event.key === "ArrowRight"');
    expect(source).toContain('className="aw2-tab-icon"');
    expect(source).toContain('className="aw2-tab-count"');
    expect(styles).toMatch(
      /\.aw2-tabs\s*\{[^}]*padding:\s*4px;[^}]*border-radius:\s*12px;/s,
    );
    expect(styles).toContain(".aw2-tabs button:focus-visible");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
