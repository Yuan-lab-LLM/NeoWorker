import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildOutcomeTemplateDraft,
  getOutcomeTemplateReadiness,
  OUTCOME_TEMPLATES,
} from "../OutcomeTemplateGrid";

describe("OutcomeTemplateGrid readiness", () => {
  it("does not start a workspace template in the temporary workspace", () => {
    const readiness = getOutcomeTemplateReadiness({
      template: OUTCOME_TEMPLATES[0],
      workspace: { id: "__temp_workspace__", isTemp: true } as never,
      connectors: [],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.missingWorkspace).toBe(true);
  });

  it("requires a connected connector before a connector-backed template is ready", () => {
    const template = OUTCOME_TEMPLATES.find(
      (item) => item.id === "slack-handoff",
    )!;
    const workspace = {
      id: "workspace-1",
      name: "Work",
      path: "/work",
    } as never;
    expect(
      getOutcomeTemplateReadiness({ template, workspace, connectors: [] })
        .missingConnectorIds,
    ).toEqual(["slack"]);
    expect(
      getOutcomeTemplateReadiness({
        template,
        workspace,
        connectors: [
          {
            id: "slack",
            name: "Slack",
            icon: "slack",
            status: "connected",
            tools: [],
          },
        ],
      }).ready,
    ).toBe(true);
  });

  it("only prepares an editable composer draft with visible connector mentions", () => {
    const template = OUTCOME_TEMPLATES.find(
      (item) => item.id === "slack-handoff",
    )!;
    const connector = {
      id: "slack",
      name: "Slack",
      icon: "slack",
      status: "connected",
      tools: ["search_slack"],
    };
    const draft = buildOutcomeTemplateDraft(
      template,
      [connector],
      "Draft the handoff.",
    );

    expect(draft.text).toBe("@Slack\n\nDraft the handoff.");
    expect(draft.mentions).toEqual([{ start: 0, end: 6, connector }]);
  });

  it("prefills the standard composer without auto-creating or running a task", () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
      "utf8",
    );
    const handler = source.slice(
      source.indexOf("const handleOutcomeTemplateStart"),
      source.indexOf("const handleWelcomeTaskSuggestion"),
    );

    expect(handler).toContain("setInputValue(draft.text)");
    expect(handler).toContain("setIntegrationMentionSpans(mentionSpans)");
    expect(handler).not.toContain("onCreateTask(");
    expect(handler).not.toContain("handleSend(");
  });
});
