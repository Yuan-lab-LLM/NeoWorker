import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { applyPersistedLanguage } from "../../i18n";
import { CommandOutput } from "../CommandOutput";

describe("CommandOutput", () => {
  beforeEach(() => {
    applyPersistedLanguage("en");
  });

  it("renders successful commands as a quiet collapsed receipt", () => {
    const html = renderToStaticMarkup(
      createElement(CommandOutput, {
        command: "npm test",
        output: "42 tests passed",
        isRunning: false,
        exitCode: 0,
        cwd: "/workspace/project",
        onClose: () => undefined,
      }),
    );

    expect(html).toContain("command-output-container collapsed completed");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Done");
    expect(html).not.toContain("command-output-content");
    expect(html).not.toContain("command-window-controls");
    expect(html).not.toContain("Close output</button>");
  });

  it("keeps running commands expanded with their controls", () => {
    const html = renderToStaticMarkup(
      createElement(CommandOutput, {
        command: "npm run dev",
        output: "Starting...",
        isRunning: true,
        taskId: "task-1",
      }),
    );

    expect(html).toContain("command-output-container expanded running");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("command-output-content");
    expect(html).toContain("Stop");
  });

  it("keeps failed commands expanded for diagnosis", () => {
    const html = renderToStaticMarkup(
      createElement(CommandOutput, {
        command: "npm test",
        output: "test failed",
        isRunning: false,
        exitCode: 1,
      }),
    );

    expect(html).toContain("command-output-container expanded failed");
    expect(html).toContain("command-output-content");
    expect(html).toContain("Exit: 1");
  });
});
