import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Task, TaskEvent, Workspace } from "../../../shared/types";
import { ProjectContextPanel } from "../ProjectContextPanel";

describe("project context file actions", () => {
  it("separates in-app preview from showing the file in Finder", () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace",
    } as Workspace;
    const task = {
      id: "task-1",
      title: "Create report",
      workspaceId: workspace.id,
    } as Task;
    const events = [
      {
        id: "event-1",
        taskId: task.id,
        type: "file_created",
        timestamp: Date.now(),
        payload: { path: "/tmp/workspace/report.pdf" },
      },
    ] as unknown as TaskEvent[];

    const markup = renderToStaticMarkup(
      React.createElement(ProjectContextPanel, { task, workspace, events }),
    );
    const source = readFileSync(
      fileURLToPath(new URL("../ProjectContextPanel.tsx", import.meta.url)),
      "utf8",
    );
    const fileViewerSource = readFileSync(
      fileURLToPath(new URL("../FileViewer.tsx", import.meta.url)),
      "utf8",
    );

    expect(markup).toContain("project-context-panel");
    expect(source).toContain(
      'translate("inlinePreview.openPreview", "Open preview")',
    );
    expect(source).toContain(
      'translate(\n    "fileViewer.showInFinder",\n    "Show in Finder",\n  )',
    );
    expect(source).toContain(
      "window.electronAPI.showInFinder(path, workspace.path)",
    );
    expect(source).toContain(
      "onShowInFinder={() => showFileInFinder(file.path)}",
    );
    expect(source).toContain("function WorkspaceFileRow({");
    expect(source).toContain("onShowInFinder: () => void;");
    expect(source).not.toContain(
      '<span className="project-file-actions" aria-hidden="true">',
    );
    expect(fileViewerSource).toContain("<ArtifactDownloadButton");
    expect(fileViewerSource).toContain('className="file-viewer-action-btn file-viewer-download-btn"');
  });
});
