import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../MCTaskDetail.tsx", import.meta.url),
);
const stylesPath = fileURLToPath(
  new URL("../task-workspace-june.css", import.meta.url),
);

describe("Mission Control task detail layout", () => {
  it("keeps settings, update composer, and execution diagnostics in one ordered disclosure", () => {
    const source = readFileSync(componentPath, "utf8");
    const settingsIndex = source.indexOf('className="mc-v2-task-core"');
    const updateIndex = source.indexOf('className="mc-task-update-section"');
    const executionIndex = source.indexOf("className={`mc-v2-execution-log ${");

    expect(source).toContain('className="mc-task-detail-more-content"');
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(settingsIndex);
    expect(executionIndex).toBeGreaterThan(updateIndex);
    expect(source).toContain("rows={3}");
    expect(source).toContain('className="mc-task-update-footer"');
    expect(source).toContain("mc-task-detail-date-control");
    expect(source).toContain('type="date"');
    expect(source).toContain("handleSetTaskDueDate");
    expect(source).toContain('"Supplementary task information"');
    expect(source).toContain('"Record notes"');
    expect(source).toContain('"Only save, do not execute"');
    expect(source).toContain('"Let the person in charge handle it"');
    expect(source).toContain('"The task will continue to run"');
    expect(source).toContain('"Save task notes"');
    expect(source).toContain('taskUpdateMode === "note"');
    expect(source).toContain('useState<"note" | "action">');
    expect(source).toContain("handleSendTaskMessage");
    expect(source).toContain('includeTypes={["comment"]}');
    expect(source).toContain('excludeTypes={["comment"]}');
    expect(source).toContain('"Technical log"');
    expect(source).toContain(
      '"Used for troubleshooting when tasks are abnormal and does not require daily operations"',
    );
    expect(source).toContain("isTechnicalLogOpen");
    expect(source).toContain("setIsTechnicalLogOpen(hasRunError)");
    expect(source).toContain("{isTechnicalLogOpen && (");
    expect(source).toContain('"How to troubleshoot"');
    expect(source).toContain("showUnreadState={false}");
    expect(source).toContain("showDescriptionsInCompact");
  });

  it("uses compact controls instead of nested oversized cards", () => {
    const source = readFileSync(stylesPath, "utf8");

    expect(source).toMatch(
      /\.mc-task-detail-select \.mc-select-menu-trigger\s*\{[^}]*height:\s*38px;/s,
    );
    expect(source).toMatch(
      /\.mc-task-update-composer textarea\s*\{[^}]*min-height:\s*82px;/s,
    );
    expect(source).toMatch(/\.mc-task-update-footer\s*\{[^}]*border-top:/s);
    expect(source).toMatch(
      /\.mc-task-update-mode-switch\s*\{[^}]*grid-template-columns:/s,
    );
    expect(source).toMatch(
      /\.mc-task-detail-more \.mc-v2-execution-log\s*\{[^}]*background:\s*transparent;/s,
    );
  });

  it("uses the wide inspector space for task metadata instead of leaving an empty right side", () => {
    const component = readFileSync(componentPath, "utf8");
    const styles = readFileSync(stylesPath, "utf8");

    expect(component).toContain('className="mc-task-inspector-overview"');
    expect(styles).toMatch(
      /@container \(min-width:\s*760px\)[\s\S]*?\.mc-task-inspector-overview\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.55fr\)\s*minmax\(280px,\s*0\.85fr\)/,
    );
    expect(styles).toMatch(
      /\.mc-task-inspector-hero > p\s*\{[^}]*max-width:\s*72ch;/s,
    );
  });
});
