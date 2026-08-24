import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FEATURE_VISIBILITY,
  isInitialReleaseViewAvailable,
} from "../feature-visibility";

const appSource = readFileSync(
  fileURLToPath(new URL("../App.tsx", import.meta.url)),
  "utf8",
);
const taskContextSource = readFileSync(
  fileURLToPath(new URL("../components/TaskContextBar.tsx", import.meta.url)),
  "utf8",
);
const workspacePanelSource = readFileSync(
  fileURLToPath(
    new URL("../components/ProjectContextPanel.tsx", import.meta.url),
  ),
  "utf8",
);

describe("hidden project surface", () => {
  it("blocks the project route and all task-level project entry points", () => {
    expect(FEATURE_VISIBILITY.projects).toBe(false);
    expect(isInitialReleaseViewAvailable("projects")).toBe(false);
    expect(appSource).toContain(
      'FEATURE_VISIBILITY.projects && currentView === "projects"',
    );
    expect(appSource).toContain(
      "FEATURE_VISIBILITY.projects ? currentProjectId : null",
    );
    expect(taskContextSource).toContain(
      "const projectsVisible = FEATURE_VISIBILITY.projects",
    );
    expect(taskContextSource).toContain(
      "projectsVisible && projectPickerOpen",
    );
  });

  it("keeps the useful side panel but removes project branding and context", () => {
    expect(workspacePanelSource).toContain(
      "const visibleProjectId = projectsVisible",
    );
    expect(workspacePanelSource).toContain("workspaceContext.panel.aria");
    expect(workspacePanelSource).toContain("workspaceContext.panel.label");
    expect(workspacePanelSource).toContain("Workspace content");
  });
});
