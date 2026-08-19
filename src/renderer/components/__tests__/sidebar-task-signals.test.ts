import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarTaskSignals } from "../SidebarTaskSignals";

describe("SidebarTaskSignals", () => {
  it("keeps liveness separate from numeric attention", () => {
    const working = renderToStaticMarkup(
      createElement(SidebarTaskSignals, {
        taskId: "task-1",
        attentionState: "working",
        attentionCount: 4,
      }),
    );
    expect(working).toContain("sidebar-task-liveness state-working");
    expect(working).not.toContain("task-attention-count");

    const approval = renderToStaticMarkup(
      createElement(SidebarTaskSignals, {
        taskId: "task-1",
        attentionState: "needs_approval",
        attentionCount: 2,
      }),
    );
    expect(approval).toContain("task-attention-count");
    expect(approval).not.toContain("sidebar-task-liveness");
  });

  it("shows one source icon with a bounded overflow count", () => {
    const html = renderToStaticMarkup(
      createElement(SidebarTaskSignals, {
        taskId: "task-1",
        attentionState: "idle",
        attentionCount: 0,
        provenance: {
          sourceKind: "gateway_message",
          providerKey: "slack",
          providerLabel: "Slack",
          count: 3,
        },
      }),
    );
    expect(html).toContain('aria-label="');
    expect(html).toContain("Slack");
    expect(html).toContain("+2");
  });
});
