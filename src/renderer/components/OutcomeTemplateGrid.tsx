import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileText, RefreshCw, Search, Workflow } from "lucide-react";
import type { OutcomeTemplate, Workspace } from "../../shared/types";
import { isTempWorkspaceId } from "../../shared/types";
import { translate } from "../i18n";
import { IntegrationMentionIcon } from "./IntegrationMentionIcon";
import "./outcome-template-grid.css";

export interface OutcomeTemplateConnector {
  id: string;
  name: string;
  icon: string;
  status: string;
  tools: string[];
}

export interface OutcomeTemplateDraft {
  text: string;
  mentions: Array<{
    start: number;
    end: number;
    connector: OutcomeTemplateConnector;
  }>;
}

export const OUTCOME_TEMPLATES: OutcomeTemplate[] = [
  {
    id: "client-brief",
    title: "Create a shareable client brief",
    outcome:
      "A polished brief with an executive summary, evidence, risks, and next steps.",
    prompt:
      "Create a shareable client brief from the materials in this workspace. Produce a polished document with an executive summary, key evidence, risks, open questions, and recommended next steps. Save the final document in the workspace and verify it opens correctly.",
    requiredWorkspace: true,
    category: "document",
  },
  {
    id: "competitor-ledger",
    title: "Build a sourced competitor ledger",
    outcome:
      "A comparison table plus a source ledger that makes every claim traceable.",
    prompt:
      "Research the most relevant competitors for the product or company described in this workspace. Create a comparison table covering positioning, pricing, strengths, weaknesses, and evidence date. Also create a source ledger with URLs, access dates, and the claims each source supports. Clearly separate fact from inference.",
    requiredWorkspace: true,
    category: "research",
  },
  {
    id: "data-review",
    title: "Turn workspace data into a decision memo",
    outcome:
      "A concise memo with validated calculations, charts, and a recommendation.",
    prompt:
      "Inspect the relevant data files in this workspace and produce a decision memo. Validate the input schema and calculations, summarize the most important patterns, create only the charts needed to support the decision, and end with a clear recommendation plus caveats. Save the memo and any supporting workbook or chart files.",
    requiredWorkspace: true,
    category: "analysis",
  },
  {
    id: "slack-handoff",
    title: "Prepare a Slack-ready project handoff",
    outcome:
      "A ready-to-review handoff with status, decisions, blockers, owners, and links.",
    prompt:
      "Prepare a Slack-ready project handoff using the workspace and relevant Slack context. Include current status, decisions made, blockers, named owners, deadlines, and direct links to supporting artifacts. Draft the message for review; do not send it without explicit approval.",
    requiredWorkspace: true,
    requiredConnectorIds: ["slack"],
    category: "operations",
  },
];

function normalizeConnectorId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function buildOutcomeTemplateDraft(
  template: OutcomeTemplate,
  connectors: readonly OutcomeTemplateConnector[],
  localizedPrompt = template.prompt,
): OutcomeTemplateDraft {
  const mentions: OutcomeTemplateDraft["mentions"] = [];
  let offset = 0;
  const mentionPrefix = connectors
    .map((connector) => {
      const token = `@${connector.name}`;
      mentions.push({
        start: offset,
        end: offset + token.length,
        connector,
      });
      offset += token.length + 1;
      return token;
    })
    .join(" ");
  return {
    text: mentionPrefix
      ? `${mentionPrefix}\n\n${localizedPrompt}`
      : localizedPrompt,
    mentions,
  };
}

export function getOutcomeTemplateReadiness(input: {
  template: OutcomeTemplate;
  workspace: Workspace | null | undefined;
  connectors: readonly OutcomeTemplateConnector[];
}): {
  ready: boolean;
  missingWorkspace: boolean;
  missingConnectorIds: string[];
} {
  const missingWorkspace = Boolean(
    input.template.requiredWorkspace &&
    (!input.workspace ||
      input.workspace.isTemp ||
      isTempWorkspaceId(input.workspace.id)),
  );
  const missingConnectorIds = (
    input.template.requiredConnectorIds || []
  ).filter((requiredId) => {
    const normalized = normalizeConnectorId(requiredId);
    return !input.connectors.some(
      (connector) =>
        connector.status === "connected" &&
        [connector.id, connector.name].some((value) =>
          normalizeConnectorId(value).includes(normalized),
        ),
    );
  });
  return {
    ready: !missingWorkspace && missingConnectorIds.length === 0,
    missingWorkspace,
    missingConnectorIds,
  };
}

const CATEGORY_ICONS = {
  document: FileText,
  research: Search,
  automation: Workflow,
  operations: Workflow,
  analysis: BarChart3,
};

export function OutcomeTemplateGrid({
  workspace,
  connectors: providedConnectors,
  onStart,
  onConfigureWorkspace,
  onConfigureConnector,
}: {
  workspace: Workspace | null;
  connectors?: readonly OutcomeTemplateConnector[];
  onStart: (
    template: OutcomeTemplate,
    connectors: OutcomeTemplateConnector[],
  ) => void;
  onConfigureWorkspace?: () => void;
  onConfigureConnector?: (connectorId: string) => void;
}) {
  const [loadedConnectors, setLoadedConnectors] = useState<
    OutcomeTemplateConnector[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (providedConnectors !== undefined) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    window.electronAPI
      .getActiveContext()
      .then((context) => {
        if (!cancelled) setLoadedConnectors(context.connectors);
      })
      .catch(() => {
        if (!cancelled) setLoadedConnectors([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providedConnectors]);

  const connectors = providedConnectors ?? loadedConnectors;

  const cards = useMemo(
    () =>
      OUTCOME_TEMPLATES.map((template) => ({
        template,
        readiness: getOutcomeTemplateReadiness({
          template,
          workspace,
          connectors,
        }),
      })),
    [connectors, workspace],
  );

  return (
    <section
      className="outcome-template-section"
      aria-label={translate(
        "outcomeTemplates.title",
        "Start with a concrete outcome",
      )}
    >
      <div className="outcome-template-heading">
        <div>
          <span>
            {translate("outcomeTemplates.kicker", "Outcome templates")}
          </span>
          <h2>
            {translate(
              "outcomeTemplates.title",
              "Start with a concrete outcome",
            )}
          </h2>
        </div>
        {loading ? (
          <RefreshCw
            className="outcome-template-loading"
            size={15}
            aria-label={translate("common.loading", "Loading")}
          />
        ) : null}
      </div>
      <div className="outcome-template-grid">
        {cards.map(({ template, readiness }) => {
          const Icon = CATEGORY_ICONS[template.category];
          const localizedTitle = translate(
            `outcomeTemplates.${template.id}.title`,
            template.title,
          );
          const localizedOutcome = translate(
            `outcomeTemplates.${template.id}.outcome`,
            template.outcome,
          );
          const matchingConnectors = connectors.filter((connector) =>
            (template.requiredConnectorIds || []).some(
              (required) =>
                normalizeConnectorId(connector.id).includes(
                  normalizeConnectorId(required),
                ) ||
                normalizeConnectorId(connector.name).includes(
                  normalizeConnectorId(required),
                ),
            ),
          );
          const matchedConnectors = matchingConnectors.filter(
            (connector) => connector.status === "connected",
          );
          return (
            <article className="outcome-template-card" key={template.id}>
              <div className="outcome-template-card-head">
                <span className="outcome-template-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span
                  className={`outcome-template-readiness ${readiness.ready ? "ready" : "needs-setup"}`}
                >
                  {readiness.ready
                    ? translate("outcomeTemplates.ready", "Ready")
                    : translate("outcomeTemplates.needsSetup", "Setup needed")}
                </span>
              </div>
              <h3>{localizedTitle}</h3>
              <p>{localizedOutcome}</p>
              <div className="outcome-template-requirements">
                {template.requiredWorkspace ? (
                  <span
                    className={readiness.missingWorkspace ? "missing" : "ready"}
                  >
                    {readiness.missingWorkspace
                      ? translate(
                          "outcomeTemplates.workspaceMissing",
                          "Choose a workspace",
                        )
                      : workspace?.name}
                  </span>
                ) : null}
                {(template.requiredConnectorIds || []).map((connectorId) => {
                  const connector = matchingConnectors.find(
                    (item) =>
                      normalizeConnectorId(item.id).includes(
                        normalizeConnectorId(connectorId),
                      ) ||
                      normalizeConnectorId(item.name).includes(
                        normalizeConnectorId(connectorId),
                      ),
                  );
                  return (
                    <span
                      key={connectorId}
                      className={
                        readiness.missingConnectorIds.includes(connectorId)
                          ? "missing"
                          : "ready"
                      }
                    >
                      <IntegrationMentionIcon
                        iconKey={connector?.icon || connectorId}
                        label={connector?.name || connectorId}
                        size={13}
                      />
                      {connector?.name || connectorId}
                    </span>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (readiness.missingWorkspace) {
                    onConfigureWorkspace?.();
                    return;
                  }
                  if (readiness.missingConnectorIds[0]) {
                    onConfigureConnector?.(readiness.missingConnectorIds[0]);
                    return;
                  }
                  onStart(template, matchedConnectors);
                }}
              >
                {readiness.ready
                  ? translate("outcomeTemplates.start", "Start")
                  : translate("outcomeTemplates.configure", "Configure")}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
