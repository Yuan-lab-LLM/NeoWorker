import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MCFeedTab } from "../MCFeedTab";
import type { MissionControlData } from "../useMissionControlData";

function renderFeed(expanded = false): string {
  const item = {
    id: "item-1",
    fingerprint: "tools:ws:pm:1",
    category: "evidence",
    severity: "monitor_only",
    title: "Tool activity captured",
    summary: "9 low-level tool events: scratchpad_write, task_list_update.",
    decision: "Stored as evidence, not an operator action.",
    nextStep: "Expand evidence only when debugging a run.",
    agentRoleId: "pm",
    agentName: "Project Manager",
    workspaceId: "ws-1",
    workspaceName: "Workspace",
    timestamp: Date.UTC(2026, 3, 28, 8, 0, 0),
    updatedAt: Date.UTC(2026, 3, 28, 8, 0, 0),
    evidenceCount: 2,
  } as const;

  const data = {
    agents: [
      {
        id: "pm",
        displayName: "Project Manager",
        icon: "pm",
        color: "#0ea5e9",
        isActive: true,
      },
    ],
    missionControlItems: [item],
    missionControlEvidence: {
      "item-1": [
        {
          id: "ev-1",
          itemId: "item-1",
          sourceType: "activity_feed",
          sourceId: "activity-1",
          title: "Tool used - scratchpad_write",
          summary: "Raw evidence row",
          timestamp: Date.UTC(2026, 3, 28, 7, 59, 0),
        },
      ],
    },
    expandedMissionControlItems: expanded ? { "item-1": true } : {},
    feedFilter: "all",
    setFeedFilter: vi.fn(),
    feedSeverityFilter: "all",
    setFeedSeverityFilter: vi.fn(),
    selectedAgent: null,
    setSelectedAgent: vi.fn(),
    setDetailPanel: vi.fn(),
    formatRelativeTime: () => "38m ago",
    toggleMissionControlEvidence: vi.fn(),
    isAllWorkspacesSelected: false,
  } as unknown as MissionControlData;

  return renderToStaticMarkup(React.createElement(MCFeedTab, { data }));
}

describe("MCFeedTab", () => {
  it("keeps raw tool rows collapsed behind grouped evidence", () => {
    const markup = renderFeed(false);

    expect(markup).toContain("Tool activity captured");
    expect(markup).toContain("Show evidence (2)");
    expect(markup).not.toContain("Tool used - scratchpad_write");
  });

  it("renders raw evidence only when the item is expanded", () => {
    const markup = renderFeed(true);

    expect(markup).toContain("Tool used - scratchpad_write");
    expect(markup).toContain("Raw evidence row");
  });
});
