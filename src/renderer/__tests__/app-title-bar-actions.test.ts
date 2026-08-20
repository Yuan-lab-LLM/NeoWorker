import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appPath = fileURLToPath(new URL("../App.tsx", import.meta.url));

describe("App title bar actions", () => {
  it("returns to the taskless main page before reopening the setup guide", () => {
    const source = readFileSync(appPath, "utf8");
    const handlerStart = source.indexOf(
      "const handleShowOnboarding = useCallback(() => {",
    );
    const handlerEnd = source.indexOf("  }, []);", handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handlerSource).toContain('setCurrentView("main")');
    expect(handlerSource).toContain("setCurrentProjectId(null)");
    expect(handlerSource).toContain("setSelectedTaskId(null)");
    expect(handlerSource).toContain("setEvents([])");
    expect(handlerSource).toContain("setRemoteTaskView(null)");
    expect(handlerSource).toContain("setOnboardingCompleted(false)");
  });

  it("keeps the sidebar toggle in the window toolbar across sidebar states", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain(
      'className="title-bar-btn title-bar-sidebar-toggle"',
    );
    expect(source).toMatch(
      /\{showSidebarShell\s*&&\s*\(\s*<>[\s\S]*?title-bar-sidebar-toggle/,
    );
    expect(source).toContain('currentView === "settings" &&');
    expect(source).toContain("onClick={handleLeftSidebarToggle}");
    expect(source).toContain("LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY");
    expect(source).toContain("isLeftSidebarToggleShortcut(event)");
    expect(source).toContain("leftSidebarShortcutLabel");
    expect(source).toContain('className="title-bar-context"');
    expect(source).toContain('className="title-bar-context-title"');
    expect(source).toContain(
      'className="title-bar-btn title-bar-navigation-btn"',
    );
    expect(source).toContain("onClick={handleNavigateBack}");
    expect(source).toContain("onClick={handleNavigateForward}");
    expect(source).toContain('id="title-bar-task-menu"');
    expect(source).toContain("const collapsedShellTitle");
    expect(source).toContain("leftSidebarCollapsed && showSidebarShell");
    expect(source).toContain("const titleBarContextIsTask");
  });

  it("keeps browser and terminal toggles together when the right panel is visible", () => {
    const source = readFileSync(appPath, "utf8");

    const actionsIndex = source.indexOf('<div className="title-bar-actions">');
    const browserIndex = source.indexOf(
      "title-bar-browser-toggle",
      actionsIndex,
    );
    const terminalIndex = source.indexOf(
      "title-bar-terminal-toggle",
      actionsIndex,
    );
    const notificationsIndex = source.indexOf(
      "<NotificationPanel",
      actionsIndex,
    );

    expect(browserIndex).toBeGreaterThan(actionsIndex);
    expect(terminalIndex).toBeGreaterThan(browserIndex);
    expect(notificationsIndex).toBeGreaterThan(terminalIndex);
    expect(source).toContain("showTitleBarTerminalToggle");
    expect(source).toContain("titleBarBrowserTaskId");
  });

  it("renders the terminal tabs dock from the selected task workspace", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain("const TerminalTabsDock = lazy");
    expect(source).toContain("terminalTabsOpen");
    expect(source).toContain("const handleTerminalTabsToggle = async () =>");
    expect(source).toContain("updateWorkspacePermissions(");
    expect(source).toContain("{ shell: true }");
    expect(source).toContain("onClick={() => void handleTerminalTabsToggle()}");
    expect(source).toContain("<TerminalTabsDock");
    expect(source).toContain("onClose={onCloseTerminalTabs}");
  });

  it("keeps right panel close work bounded and observable", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain("const EMPTY_RIGHT_PANEL_INPUT");
    expect(source).toContain("const handleRightSidebarToggle = useCallback");
    expect(source).toContain("setTerminalTabsOpen(false);");
    expect(source).toContain('"App.right_sidebar_toggle_to_paint"');
    expect(source).toContain("rightPanelInput={visibleRightPanelInput}");
    expect(source).toContain("RIGHT_PANEL_COLLAPSED_STORAGE_KEY");
    expect(source).toContain("readStoredRightPanelCollapsed");
    expect(source).toContain("window.localStorage.setItem(");
  });

  it("renders a visible right-panel toggle glyph instead of an empty button", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain(
      'className="title-bar-btn title-bar-panel-toggle"',
    );
    expect(source).toContain('className="title-bar-panel-toggle-icon"');
    expect(source).toContain('<line x1="15" y1="3" x2="15" y2="21" />');
  });
});
