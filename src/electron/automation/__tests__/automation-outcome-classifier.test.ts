import { describe, expect, it } from "vitest";
import {
  classifyCheckEvidence,
  classifyStrategicPlannerOutcome,
} from "../automation-outcome-classifier";
import {
  buildAutomationNotification,
  shouldNotifyAutomationOutcome,
} from "../AutomationNotificationPolicy";
import type { AutomationRunOutcome, Company, StrategicPlannerRun } from "../../../shared/types";

describe("automation outcome classification", () => {
  it("marks declared checks without executed command evidence as low value", () => {
    const outcome = classifyCheckEvidence({
      source: "cron",
      title: "Static checks",
      summary: "The agent said it could not run checks.",
      trigger: "schedule",
      declaredCheck: true,
      executedCommandCount: 0,
      toolCallCount: 0,
      limitationOnly: true,
    });

    expect(outcome.usefulness).toBe("low_value");
    expect(outcome.notificationRecommended).toBe(false);
  });

  it("marks scheduled planner runs with created work as actionable and notify-worthy", () => {
    const company: Company = {
      id: "company-1",
      name: "Acme",
      slug: "acme",
      status: "active",
      isDefault: true,
      createdAt: 1,
      updatedAt: 1,
    };
    const run: StrategicPlannerRun = {
      id: "run-1",
      companyId: company.id,
      status: "completed",
      trigger: "schedule",
      summary: "1 issue(s) created, 0 issue(s) updated, 0 task(s) dispatched",
      createdIssueCount: 1,
      updatedIssueCount: 0,
      dispatchedTaskCount: 0,
      createdAt: 1,
      updatedAt: 1,
    };

    const outcome = classifyStrategicPlannerOutcome({
      company,
      trigger: "schedule",
      run,
      createdIssueIds: ["issue-1"],
      updatedIssueIds: [],
      dispatchedTaskIds: [],
      suppressedOutputCount: 0,
    });

    expect(outcome.usefulness).toBe("actionable");
    expect(outcome.notificationRecommended).toBe(true);
  });

  it("suppresses notifications for informational outcomes", () => {
    const outcome: AutomationRunOutcome = {
      id: "outcome-1",
      source: "strategic_planner",
      title: "Planner found no changes",
      summary: "No action needed.",
      usefulness: "informational",
      trigger: "schedule",
      notificationRecommended: false,
      createdAt: 1,
    };

    expect(shouldNotifyAutomationOutcome(outcome)).toBe(false);
    expect(buildAutomationNotification(outcome)).toBeNull();
  });
});
