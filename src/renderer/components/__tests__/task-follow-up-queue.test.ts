import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const queueSource = readFileSync(
  fileURLToPath(new URL("../TaskFollowUpQueue.tsx", import.meta.url)),
  "utf8",
);
const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
  "utf8",
);
const styles = readFileSync(
  fileURLToPath(new URL("../MainContent/main-content.css", import.meta.url)),
  "utf8",
);

describe("Task follow-up queue", () => {
  it("renders queued messages inline immediately above the session composer", () => {
    expect(mainContentSource).toMatch(
      /<TaskFollowUpQueue[\s\S]*?<div\s+className=\{`input-container session-composer/,
    );
    expect(styles).toMatch(
      /\.task-follow-up-queue\s*\{[^}]*width:\s*min\(100%, 800px\);[^}]*margin:\s*0 auto -11px;/s,
    );
    expect(styles).toMatch(
      /\.task-follow-up-queue-row\s*\{[^}]*min-height:\s*34px;/s,
    );
  });

  it("supports refreshing, editing, removing, and reordering queued messages", () => {
    expect(queueSource).toContain("listQueuedFollowUps");
    expect(queueSource).toContain("refreshInFlightRef.current");
    expect(queueSource).toContain("active ? 1200 : 3000");
    expect(queueSource).toContain("updateQueuedFollowUp");
    expect(queueSource).toContain("removeQueuedFollowUp");
    expect(queueSource).toContain("reorderQueuedFollowUps");
    expect(queueSource).toContain("draggable={!isEditing && !isBusy}");
    expect(queueSource).toContain("handleDrop(event, item.id)");
    expect(queueSource).toContain('event.key !== "ArrowUp"');
    expect(queueSource).toContain('event.key !== "ArrowDown"');
    expect(queueSource).toContain("createPortal");
    expect(queueSource).toContain('"composer.queue.editMessage"');
    expect(queueSource).toContain('"composer.queue.closeQueue"');
    expect(queueSource).not.toContain('"composer.queue.adjust"');
    expect(queueSource).not.toContain("openInSideChat");
    expect(queueSource).not.toContain('"composer.queue.openSideChat"');
    expect(styles).toMatch(
      /\.task-follow-up-queue-grip\s*\{[^}]*cursor:\s*grab;/s,
    );
    expect(styles).toContain(".task-follow-up-queue-row.drop-before::before");
    expect(queueSource).toContain('"composer.queue.statusQueued"');
    expect(styles).toContain(".task-follow-up-queue-status");
  });

  it("keeps the queued-message action menu compact and left aligned", () => {
    expect(queueSource).toContain("const QUEUE_MENU_WIDTH = 192;");
    expect(styles).toMatch(
      /\.task-follow-up-queue-menu\s*\{[^}]*width:\s*192px;[^}]*padding:\s*4px;/s,
    );
    expect(styles).toMatch(
      /\.task-follow-up-queue-menu button\s*\{[^}]*height:\s*34px;[^}]*justify-content:\s*flex-start;/s,
    );
  });

  it("keeps a queue action next to stop while the selected task is running", () => {
    const runningControls = mainContentSource.slice(
      mainContentSource.indexOf("{isTaskWorking && onStopTask ? ("),
      mainContentSource.indexOf(
        "</div>\n              ) : (",
        mainContentSource.indexOf("{isTaskWorking && onStopTask ? ("),
      ),
    );

    expect(runningControls).toContain("queue-follow-up-btn");
    expect(runningControls).toContain("onClick={handleSend}");
    expect(runningControls).toContain("disabled={isComposerSendBusy}");
    expect(runningControls).toContain('"composer.queue.send"');
    expect(runningControls).toContain('className="stop-btn-simple"');
    expect(runningControls.indexOf("queue-follow-up-btn")).toBeLessThan(
      runningControls.indexOf("stop-btn-simple"),
    );
    expect(styles).toContain(".queue-follow-up-btn");
  });
});
