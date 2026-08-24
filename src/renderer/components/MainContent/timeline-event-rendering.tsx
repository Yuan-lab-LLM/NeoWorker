import React from "react";
import {
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  TriangleAlert,
} from "lucide-react";
import type {
  Task,
  TaskEvent,
  QuotedAssistantMessage,
} from "../../../shared/types";
import {
  getEffectiveTaskEventType,
  getTimelineErrorText,
} from "../../utils/task-event-compat";
import {
  normalizeMarkdownForDisplay,
  cleanAssistantMessageForDisplay,
  stripHtmlTags,
} from "./markdown-normalization";
import {
  humanizeTimelineMessage,
  condenseStepText,
} from "./task-event-presentation";
import {
  shouldRenderOpenArtifactCardAtEvent,
  getInlinePreviewKindForGeneratedFile,
  getTaskEventArtifactPaths,
  type GeneratedInlinePreviewKind,
} from "./artifact-logic";
import { SpreadsheetArtifactCard } from "../SpreadsheetArtifactCard";
import { DocumentArtifactCard } from "../DocumentArtifactCard";
import { PresentationArtifactCard } from "../PresentationArtifactCard";
import { WebArtifactCard } from "../WebArtifactCard";
import { ArtifactDownloadButton } from "../ArtifactDownloadButton";
import { InlineVideoPreview } from "../InlineVideoPreview";
import { InlineImagePreview } from "../InlineImagePreview";
import { InlineDocumentPreview } from "../InlineDocumentPreview";
import { LatexArtifactWorkbench } from "../LatexArtifactWorkbench";
import {
  friendlyToolCallTitle,
  friendlyToolResultTitle,
  isLikelyMojibakeText,
} from "../../utils/timeline-tool-labels";
import { buildApprovalCommandPreview } from "../../../shared/approval-command-preview";
import { formatTimelineActivityLabel } from "../../../shared/timeline-v2";
import {
  AssistantMessageContent,
  OsascriptCommandExcerpt,
  isLongOsascriptCommandText,
} from "../AssistantMessageContent";
import { formatProviderErrorForDisplay } from "../../../shared/provider-error-format";
import {
  MermaidDiagram,
  normalizeCodeBlockTextForDisplay,
} from "../markdown-components";
import {
  hasTaskOutputs,
  resolveTaskOutputSummaryFromCompletionEvent,
} from "../../utils/task-outputs";
import { sanitizeToolCallTextFromAssistant } from "../../../shared/tool-call-text-sanitizer";
import { isVerificationStepDescription } from "../../../shared/plan-utils";
import { isWordDocumentArtifactFile } from "../../../shared/document-formats";
import { getMessage } from "../../utils/agentMessages";
import type { AgentContext } from "../../hooks/useAgentContext";
import { DEFAULT_ASSISTANT_NAME, DEFAULT_QUIRKS } from "../../../shared/types";
import { JsonlPreview, parseJsonlPreview } from "../JsonlPreview";
import { getStepCompletionPreviewPath } from "../../utils/step-document-preview";
import { findLatexPdfPair } from "../../utils/latex-artifacts";
import { formatFileSize } from "./attachments";
import { DeferredMarkdown, HighlightedCodePreview } from "./message-ui";
import type { CommandOutputSession } from "../../utils/task-event-derived";
import { translate } from "../../i18n";
import { localizeProgressText } from "../../utils/localized-progress-text";
import { localizeErrorText } from "../../utils/localized-error-text";
import {
  VIDEO_FILE_EXT_RE,
  HTML_FILE_EXT_RE,
  SPREADSHEET_FILE_EXT_RE,
  PRESENTATION_FILE_EXT_RE,
  DOCUMENT_PREVIEW_EXT_RE,
} from "./main-content-constants";

type Any = Record<string, any>;

const END_OF_TASK_ARTIFACT_KINDS = new Set<GeneratedInlinePreviewKind>([
  "html",
  "spreadsheet",
  "presentation",
  "document",
]);

const TOOL_PAYLOAD_SUMMARY_KEYS = [
  "application_summary",
  "applicationSummary",
  "message",
  "summary",
  "error",
] as const;

function compactToolPayloadText(value: string, maxLength = 240): string {
  if (isLikelyMojibakeText(value)) {
    return translate(
      "timeline.toolPayload.legacyEncodingHidden",
      "This historical page used an unsupported text encoding. Fetch it again to display readable content.",
    );
  }
  const compact = stripHtmlTags(value).replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getToolPayloadSummary(value: unknown): string {
  if (typeof value === "string") {
    return compactToolPayloadText(value);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of TOOL_PAYLOAD_SUMMARY_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return compactToolPayloadText(candidate);
    }
  }
  return "";
}

function isFailedToolPayload(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.recoverableFallback === true || record.nonBlocking === true)
    return false;
  return (
    record.success === false ||
    (typeof record.error === "string" && record.error.trim() !== "")
  );
}

function serializeToolPayload(value: unknown): string {
  if (typeof value === "string") return compactToolPayloadText(value, 6000);
  if (value === undefined) return "";
  try {
    return JSON.stringify(
      value,
      (_key, entry) =>
        typeof entry === "string" && isLikelyMojibakeText(entry)
          ? translate(
              "timeline.toolPayload.legacyEncodingHidden",
              "This historical page used an unsupported text encoding. Fetch it again to display readable content.",
            )
          : entry,
      2,
    );
  } catch {
    return String(value);
  }
}

function ToolPayloadDetails({
  value,
  showSummary,
}: {
  value: unknown;
  showSummary: boolean;
}) {
  const summary = showSummary ? getToolPayloadSummary(value) : "";
  const serialized = serializeToolPayload(value);
  const failed = isFailedToolPayload(value);

  if (!summary && !serialized) return null;

  return (
    <div
      className={`event-details tool-payload-details${failed ? " is-error" : ""}`}
    >
      {summary ? <div className="tool-payload-summary">{summary}</div> : null}
      {serialized ? (
        <details className="tool-payload-technical">
          <summary>
            {translate(
              "timeline.toolPayload.technicalDetails",
              "Technical details",
            )}
          </summary>
          <pre className="tool-payload-code">
            {truncateForDisplay(serialized, 6000)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function shouldAutoExpandActiveTimelineEvent(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  // Approval requests already have a dedicated dialog. Keeping the timeline
  // row forced open duplicates that UI and exposes raw permission metadata.
  // Leave the compact row visible and let people expand it deliberately.
  if (effectiveType === "approval_requested") return false;
  if (effectiveType === "tool_call") return false;
  if (effectiveType === "tool_result")
    return isFailedToolPayload(event.payload?.result);
  return true;
}

function WebSearchEventDetails({
  value,
  completed,
}: {
  value: unknown;
  completed: boolean;
}) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const searchType =
    typeof record.searchType === "string" ? record.searchType.trim() : "";
  const countValue = completed ? record.resultCount : record.maxResults;
  const resultCount =
    typeof countValue === "number" && Number.isFinite(countValue)
      ? Math.max(0, Math.round(countValue))
      : null;
  const provider =
    typeof record.provider === "string" ? record.provider.trim() : "";
  const parts = [
    searchType
      ? searchType.toLowerCase() === "news"
        ? translate("timeline.webSearch.news", "News")
        : searchType
      : "",
    resultCount !== null
      ? completed
        ? translate("timeline.webSearch.results", "{count} results", {
            count: resultCount,
          })
        : translate("timeline.webSearch.maxResults", "Up to {count} results", {
            count: resultCount,
          })
      : "",
    provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "",
  ].filter(Boolean);

  if (parts.length === 0) return null;
  return (
    <div className="event-details web-search-event-details">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>{part}</span>
      ))}
    </div>
  );
}

export type WebFetchResultDisplay = {
  url: string;
  title: string;
  siteLabel: string;
  pathLabel: string;
  method: string;
  status: number | null;
  statusText: string;
  contentLength: number | null;
  truncated: boolean | null;
  unavailable: boolean;
  failed: boolean;
};

export function getWebFetchResultDisplay(
  value: unknown,
): WebFetchResultDisplay | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const title = isLikelyMojibakeText(rawTitle) ? "" : rawTitle;
  const method =
    typeof record.method === "string" && record.method.trim()
      ? record.method.trim().toUpperCase()
      : url
        ? "GET"
        : "";
  const numericStatus =
    typeof record.status === "number"
      ? record.status
      : typeof record.status === "string"
        ? Number(record.status)
        : Number.NaN;
  const status =
    Number.isFinite(numericStatus) && numericStatus >= 0
      ? Math.round(numericStatus)
      : null;
  const statusText =
    typeof record.statusText === "string" ? record.statusText.trim() : "";
  const numericLength =
    typeof record.contentLength === "number"
      ? record.contentLength
      : typeof record.contentLength === "string"
        ? Number(record.contentLength)
        : Number.NaN;
  const contentLength =
    Number.isFinite(numericLength) && numericLength >= 0
      ? Math.round(numericLength)
      : null;
  const truncated =
    typeof record.truncated === "boolean" ? record.truncated : null;
  const unavailable =
    record.success === false &&
    (record.recoverableFallback === true ||
      record.nonBlocking === true ||
      record.failureKind === "source_unavailable");
  const failed =
    !unavailable &&
    (record.success === false ||
      (status !== null && (status === 0 || status >= 400)));

  if (
    !url &&
    !title &&
    !method &&
    status === null &&
    contentLength === null &&
    truncated === null
  ) {
    return null;
  }

  let siteLabel = "";
  let pathLabel = "";
  if (url) {
    try {
      const parsed = new URL(url);
      siteLabel = parsed.hostname.replace(/^www\./i, "");
      pathLabel = `${parsed.pathname || "/"}${parsed.search}`;
    } catch {
      pathLabel = url;
    }
  }

  return {
    url,
    title,
    siteLabel:
      siteLabel || title || translate("timeline.webFetch.webpage", "Web page"),
    pathLabel: pathLabel || url,
    method,
    status,
    statusText,
    contentLength,
    truncated,
    unavailable,
    failed,
  };
}

function WebFetchEventDetails({
  value,
  completed,
  toolName,
}: {
  value: unknown;
  completed: boolean;
  toolName: "web_fetch" | "http_request";
}) {
  const display = getWebFetchResultDisplay(value);
  if (!display) return null;
  const statusTone = display.unavailable
    ? "is-skipped"
    : display.failed
      ? "is-error"
      : completed
        ? "is-success"
        : "is-pending";
  const statusLabel = display.unavailable
    ? translate(
        "timeline.webFetch.sourceSkipped",
        "Source unavailable, skipped",
      )
    : display.failed
      ? translate("timeline.webFetch.requestFailed", "Request failed")
      : completed
        ? toolName === "http_request"
          ? translate("timeline.webFetch.requestSucceeded", "Request succeeded")
          : translate("timeline.webFetch.completed", "Fetched")
        : translate("timeline.webFetch.pending", "Ready to fetch");
  const responseSize =
    display.contentLength === null
      ? ""
      : toolName === "http_request"
        ? formatFileSize(display.contentLength)
        : translate("timeline.webFetch.characters", "{count} characters", {
            count: display.contentLength.toLocaleString(),
          });
  const statusValue =
    display.status === null
      ? ""
      : `${display.status}${display.statusText ? ` ${display.statusText}` : ""}`;

  const openPage = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!display.url) return;
    void window.electronAPI
      .openExternal(display.url)
      .catch((error: unknown) => {
        console.error("Failed to open fetched page:", error);
      });
  };

  return (
    <div className={`event-details web-fetch-result-card ${statusTone}`}>
      <div className="web-fetch-result-main">
        <span className="web-fetch-result-icon" aria-hidden="true">
          <Globe2 size={16} strokeWidth={1.8} />
        </span>
        <div className="web-fetch-result-copy">
          <div className="web-fetch-result-heading">
            {display.method ? (
              <span className="web-fetch-method">{display.method}</span>
            ) : null}
            <strong>{display.title || display.siteLabel}</strong>
          </div>
          {display.pathLabel ? (
            <span className="web-fetch-result-path" title={display.url}>
              {display.title ? `${display.siteLabel} · ` : ""}
              {display.pathLabel}
            </span>
          ) : null}
        </div>
        {display.url ? (
          <button
            type="button"
            onClick={openPage}
            aria-label={translate("timeline.webFetch.open", "Open")}
            title={translate("timeline.webFetch.open", "Open")}
          >
            <ExternalLink size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="web-fetch-result-meta">
        <span className={`web-fetch-status ${statusTone}`}>
          <span className="web-fetch-status-dot" aria-hidden="true" />
          {display.status !== null ? `${display.status} · ` : ""}
          {statusLabel}
        </span>
        {responseSize ? (
          <span className="web-fetch-meta-item">
            {translate("timeline.webFetch.responseSize", "Response {size}", {
              size: responseSize,
            })}
          </span>
        ) : null}
        {display.truncated !== null ? (
          <span
            className={`web-fetch-meta-item${display.truncated ? " is-warning" : " is-complete"}`}
          >
            {display.truncated ? (
              <TriangleAlert size={12} aria-hidden="true" />
            ) : (
              <Check size={12} aria-hidden="true" />
            )}
            {display.truncated
              ? translate("timeline.webFetch.truncated", "Content clipped")
              : translate("timeline.webFetch.completeContent", "Full content")}
          </span>
        ) : null}
      </div>
      <details className="web-fetch-technical-details">
        <summary>
          <ChevronRight size={13} aria-hidden="true" />
          {translate("timeline.webFetch.requestDetails", "Request details")}
        </summary>
        <dl>
          {display.url ? (
            <div className="web-fetch-detail-wide">
              <dt>
                {translate("timeline.webFetch.requestUrl", "Request URL")}
              </dt>
              <dd title={display.url}>{display.url}</dd>
            </div>
          ) : null}
          {display.method ? (
            <div>
              <dt>{translate("timeline.webFetch.requestMethod", "Method")}</dt>
              <dd>{display.method}</dd>
            </div>
          ) : null}
          {statusValue ? (
            <div>
              <dt>{translate("timeline.webFetch.responseStatus", "Status")}</dt>
              <dd>{statusValue}</dd>
            </div>
          ) : null}
          {responseSize ? (
            <div>
              <dt>
                {translate("timeline.webFetch.responseData", "Response data")}
              </dt>
              <dd>{responseSize}</dd>
            </div>
          ) : null}
          {display.truncated !== null ? (
            <div>
              <dt>
                {translate("timeline.webFetch.responseContent", "Content")}
              </dt>
              <dd>
                {display.truncated
                  ? translate("timeline.webFetch.truncated", "Content clipped")
                  : translate(
                      "timeline.webFetch.completeContent",
                      "Full content",
                    )}
              </dd>
            </div>
          ) : null}
        </dl>
      </details>
    </div>
  );
}

function getEvidenceSiteLabel(hostname: string): string {
  const normalized = hostname.replace(/^www\./i, "");
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) return normalized;
  if (parts.at(-1) === "google") return "google";
  if (parts.length <= 2) return normalized;
  return parts.slice(-2).join(".");
}

function getWebEvidenceDisplay(
  source: string,
  snippet: string,
): {
  siteLabel: string;
  label: string;
} | null {
  try {
    const url = new URL(source);
    const siteLabel = getEvidenceSiteLabel(url.hostname);
    const label = snippet || siteLabel || source;
    return {
      siteLabel,
      label,
    };
  } catch {
    return null;
  }
}

function ClickableFilePath({
  path,
  workspacePath,
  className = "",
  onOpenViewer,
}: {
  path: string;
  workspacePath?: string;
  className?: string;
  onOpenViewer?: (path: string) => void;
}) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If viewer callback is provided and we have a workspace, use the in-app viewer
    if (onOpenViewer && workspacePath) {
      onOpenViewer(path);
      return;
    }

    // Fallback to external app
    try {
      const error = await window.electronAPI.openFile(path, workspacePath);
      if (error) {
        console.error("Failed to open file:", error);
      }
    } catch (err) {
      console.error("Error opening file:", err);
    }
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await window.electronAPI.showInFinder(path, workspacePath);
    } catch (err) {
      console.error("Error showing in Finder:", err);
    }
  };

  // Extract filename for display
  const fileName = path.split("/").pop() || path;

  return (
    <span
      className={`clickable-file-path ${className}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      title={`${path}\n\nClick to preview • Right-click to show in Finder`}
    >
      {fileName}
    </span>
  );
}

export function formatSignedScore(value: number): string {
  if (!Number.isFinite(value)) return "0.00";
  const normalized = Math.max(-1, Math.min(1, value));
  return `${normalized >= 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

export function describeLoopRisk(loopRisk: number): "low" | "medium" | "high" {
  if (!Number.isFinite(loopRisk)) return "low";
  if (loopRisk >= 0.7) return "high";
  if (loopRisk >= 0.4) return "medium";
  return "low";
}

/**
 * Truncate long text for display, with expand option handled via CSS
 */
export function truncateForDisplay(
  text: string,
  maxLength: number = 2000,
): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\n\n... [content truncated for display]";
}

export function coerceStepFailureText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStepFailureTextForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

export function unwrapTaskFailureText(reason: string): string {
  return reason
    .trim()
    .replace(/^Task execution failed:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

export function formatCompletionGuardFailureTitle(
  reason: string,
): string | null {
  const unwrapped = unwrapTaskFailureText(reason);
  if (/^Task missing verification evidence\b/i.test(unwrapped))
    return "Verification evidence missing";
  if (/^Task missing direct answer\b/i.test(unwrapped))
    return "Direct answer missing";
  if (/^Task missing artifact evidence\b/i.test(unwrapped))
    return "Output artifact missing";
  if (/^Task missing execution evidence\b/i.test(unwrapped))
    return "Execution evidence missing";
  if (/^Task missing required tool evidence\b/i.test(unwrapped))
    return "Required tool evidence missing";
  return null;
}

export function formatTimelineErrorTitleForDisplay(message: string): string {
  return formatCompletionGuardFailureTitle(message) || message;
}

export function formatStepFailedTitleForDisplay(payload: Any): string {
  const step =
    payload?.step && typeof payload.step === "object" ? payload.step : {};
  const description = coerceStepFailureText((step as Any).description);
  const reason =
    coerceStepFailureText(payload?.reason) ||
    coerceStepFailureText((step as Any).error) ||
    coerceStepFailureText(payload?.error);
  const guardTitle = formatCompletionGuardFailureTitle(reason || description);
  if (guardTitle) return guardTitle;

  if (
    description &&
    reason &&
    normalizeStepFailureTextForComparison(description) ===
      normalizeStepFailureTextForComparison(reason)
  ) {
    return "Step failed";
  }

  return `Step failed: ${condenseStepText(description || reason || "Unknown step")}`;
}

export function formatStepContractEscalatedMessage(reason: string): string {
  const r = reason.trim().toLowerCase();
  switch (r) {
    case "end_turn_before_required_mutation":
      return "Still working on this step — waiting for the first file write";
    case "loop_warning_threshold_reached":
      return "Trying a different approach";
    case "mutation_starvation_guard":
      return "Waiting for file activity to begin";
    case "first_write_checkpoint_no_attempt":
      return "Nudging agent to begin writing";
    case "first_write_checkpoint_failed":
      return "Retrying the file write";
    default:
      return "Adjusting approach";
  }
}

export function getSummaryStageLabel(stage: string): string | null {
  switch (stage.trim().toUpperCase()) {
    case "DISCOVER":
      return "Planning the approach";
    case "BUILD":
      return "Working on your request";
    case "VERIFY":
      return "Checking results";
    case "FIX":
      return "Applying fixes";
    case "DELIVER":
      return "Preparing final response";
    default:
      return null;
  }
}

export function getApprovalPayload(event: TaskEvent): Any | null {
  if (
    !event?.payload ||
    typeof event.payload !== "object" ||
    Array.isArray(event.payload)
  ) {
    return null;
  }
  const approval = (event.payload as Any).approval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) {
    return null;
  }
  return approval as Any;
}

export function getApprovalDescription(approval: Any | null): string {
  const description = approval?.description;
  return typeof description === "string" ? description.trim() : "";
}

function getApprovalDetailsRecord(approval: Any | null): Any {
  const details = approval?.details;
  return details && typeof details === "object" && !Array.isArray(details)
    ? details
    : {};
}

function getApprovalParamsRecord(approval: Any | null): Any {
  const params = getApprovalDetailsRecord(approval).params;
  return params && typeof params === "object" && !Array.isArray(params)
    ? params
    : {};
}

export function getApprovalToolName(approval: Any | null): string {
  const tool = getApprovalDetailsRecord(approval).tool;
  return typeof tool === "string" ? tool.trim() : "";
}

function getApprovalParamString(
  approval: Any | null,
  key: string,
): string {
  const details = getApprovalDetailsRecord(approval);
  const direct = details[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const nested = getApprovalParamsRecord(approval)[key];
  return typeof nested === "string" ? nested.trim() : "";
}

function getApprovalTargetHost(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function isNetworkApprovalTool(toolName: string): boolean {
  return ["http_request", "web_fetch", "web_search"].includes(toolName);
}

function isGeneratedToolApprovalDescription(description: string): boolean {
  return /^Approve tool call:\s*[a-z0-9_-]+\s*$/i.test(description);
}

export function getApprovalTimelineDescription(approval: Any | null): string {
  const description = getApprovalDescription(approval);
  const toolName = getApprovalToolName(approval);
  const targetUrl = getApprovalParamString(approval, "url");
  const targetHost = getApprovalTargetHost(targetUrl);

  if (isGeneratedToolApprovalDescription(description)) {
    if (isNetworkApprovalTool(toolName)) {
      return targetHost
        ? translate(
            "timeline.approval.networkTargetDescription",
            "NeoWorker needs to access {target} to continue this task.",
            { target: targetHost },
          )
        : translate(
            "approval.description.networkTool",
            "NeoWorker needs network access to continue this task.",
          );
    }
    if (toolName === "write_file") {
      return translate(
        "approval.description.writeFile",
        "NeoWorker needs to create or update a file to continue this task.",
      );
    }
    if (toolName === "edit_file") {
      return translate(
        "approval.description.editFile",
        "NeoWorker needs to update a file to continue this task.",
      );
    }
    return translate(
      "approval.description.toolCall",
      "NeoWorker needs to use {tool} to continue this task.",
      { tool: toolName.replace(/_/g, " ") || "this action" },
    );
  }

  return description;
}

export function getApprovalTimelineTitle(approval: Any | null): string {
  const toolName = getApprovalToolName(approval);
  const params = getApprovalParamsRecord(approval);
  const targetUrl = getApprovalParamString(approval, "url");
  const targetHost = getApprovalTargetHost(targetUrl);
  const targetPath = getApprovalParamString(approval, "path");

  if (isNetworkApprovalTool(toolName) && targetHost) {
    return translate(
      "timeline.approval.networkTargetTitle",
      "Approval required: access {target}",
      { target: targetHost },
    );
  }
  if (targetPath) {
    const targetName = targetPath.replace(/\\/g, "/").split("/").pop();
    return translate(
      "timeline.approval.fileTargetTitle",
      "Approval required: change {target}",
      { target: targetName || targetPath },
    );
  }
  if (toolName) {
    return translate(
      "timeline.approval.actionTitle",
      "Approval required: {action}",
      {
        action: localizeProgressText(friendlyToolCallTitle(toolName, params)),
      },
    );
  }
  return translate("timeline.approval.required", "Approval required");
}

export function extractApprovalCommand(approval: Any | null): string | null {
  const commandFromDetails = approval?.details?.command;
  if (typeof commandFromDetails === "string") {
    const trimmed = commandFromDetails.trim();
    if (trimmed.length > 0) return trimmed;
  }

  const description = getApprovalDescription(approval);
  if (!description) return null;

  const commandMatch = description.match(
    /^Run(?:ning)? command(?:\s*\([^)]+\))?:\s*([\s\S]+)$/i,
  );
  if (!commandMatch || typeof commandMatch[1] !== "string") return null;
  const command = commandMatch[1].trim();
  return command.length > 0 ? command : null;
}

export function isRunCommandApproval(approval: Any | null): boolean {
  if (approval?.type === "run_command") return true;
  return Boolean(extractApprovalCommand(approval));
}

export function shouldHideApprovalEventInStepFeed(event: TaskEvent): boolean {
  if (getEffectiveTaskEventType(event) !== "approval_requested") return false;
  if (event.payload?.autoApproved === true) return true;
  return isRunCommandApproval(getApprovalPayload(event));
}

export function getTimelineEventStepId(event: TaskEvent): string | null {
  if (typeof event.stepId === "string" && event.stepId.trim().length > 0) {
    return event.stepId.trim();
  }
  const payload =
    event.payload && typeof event.payload === "object"
      ? (event.payload as Record<string, unknown>)
      : {};
  if (typeof payload.stepId === "string" && payload.stepId.trim().length > 0) {
    return payload.stepId.trim();
  }
  const step =
    payload.step && typeof payload.step === "object"
      ? (payload.step as Record<string, unknown>)
      : {};
  if (typeof step.id === "string" && step.id.trim().length > 0) {
    return step.id.trim();
  }
  return null;
}

export function getParallelGroupOwnerStepId(
  groupId: string | null | undefined,
): string | null {
  if (typeof groupId !== "string") return null;
  const parts = groupId.split(":");
  if (parts.length < 5 || parts[0] !== "tools") return null;
  if (parts[1] !== "step" && parts[1] !== "follow_up") return null;
  const stepId = parts.slice(2, -2).join(":").trim();
  return stepId.length > 0 ? stepId : null;
}

export function canStepEventOwnParallelChildren(event: TaskEvent): boolean {
  const effectiveType = getEffectiveTaskEventType(event);
  return (
    effectiveType === "step_started" ||
    (event.type === "timeline_step_updated" &&
      effectiveType === "progress_update")
  );
}

export function renderEventTitle(
  event: TaskEvent,
  workspacePath?: string,
  onOpenViewer?: (path: string) => void,
  agentCtx?: AgentContext,
  options?: {
    summaryMode?: boolean;
  },
): React.ReactNode {
  const summaryMode = options?.summaryMode === true;
  // Build message context for personalized messages
  const msgCtx = agentCtx
    ? {
        agentName: agentCtx.agentName,
        userName: agentCtx.userName,
        personality: agentCtx.personality,
        persona: agentCtx.persona,
        emojiUsage: agentCtx.emojiUsage,
        quirks: agentCtx.quirks,
      }
    : {
        agentName: DEFAULT_ASSISTANT_NAME,
        userName: undefined,
        personality: "professional" as const,
        persona: undefined,
        emojiUsage: "minimal" as const,
        quirks: DEFAULT_QUIRKS,
      };
  const effectiveType = getEffectiveTaskEventType(event);

  const getStepStartedDetail = (): string => {
    const rawStepDescription =
      typeof event.payload?.step?.description === "string"
        ? event.payload.step.description
        : "";
    if (rawStepDescription.trim().length > 0) {
      return rawStepDescription;
    }

    const rawGroupLabel =
      typeof event.payload?.groupLabel === "string"
        ? event.payload.groupLabel
        : "";
    if (rawGroupLabel.trim().length > 0) {
      return rawGroupLabel;
    }

    const rawMessage =
      typeof event.payload?.message === "string" ? event.payload.message : "";
    const normalizedMessage = rawMessage.replace(/^Starting\s+/i, "").trim();
    if (normalizedMessage.length > 0) {
      return normalizedMessage;
    }

    const rawStage =
      typeof event.payload?.stage === "string" ? event.payload.stage : "";
    if (rawStage.trim().length > 0) {
      return rawStage.trim();
    }

    return "Getting started...";
  };

  if (
    event.type === "timeline_group_started" ||
    event.type === "timeline_group_finished"
  ) {
    const stage =
      typeof event.payload?.stage === "string"
        ? event.payload.stage.trim().toUpperCase()
        : "";
    const groupLabel =
      (typeof event.payload?.groupLabel === "string" &&
        event.payload.groupLabel.trim()) ||
      "";
    const label = groupLabel || stage || "Group";
    const summaryStageLabel = stage ? getSummaryStageLabel(stage) : null;
    const isSubStage = Boolean(
      groupLabel && groupLabel.toUpperCase() !== stage,
    );
    if (summaryMode) {
      // Prefer sub-stage label (e.g. "Preparing workspace") over generic stage label (e.g. "Applying fixes")
      if (isSubStage) return localizeProgressText(groupLabel);
      if (summaryStageLabel) return localizeProgressText(summaryStageLabel);
    }

    if (isSubStage) {
      return localizeProgressText(
        event.type === "timeline_group_finished"
          ? `${groupLabel} complete`
          : groupLabel,
      );
    }
    if (summaryStageLabel) {
      return localizeProgressText(
        event.type === "timeline_group_finished"
          ? `${summaryStageLabel} complete`
          : summaryStageLabel,
      );
    }

    const maxParallel =
      typeof event.payload?.maxParallel === "number" &&
      Number.isFinite(event.payload.maxParallel)
        ? Math.max(1, Math.floor(event.payload.maxParallel))
        : null;
    const base =
      event.type === "timeline_group_started"
        ? `Starting ${label}`
        : `Completed ${label}`;
    return !summaryMode &&
      maxParallel &&
      event.type === "timeline_group_started"
      ? localizeProgressText(`${base} (${maxParallel} parallel)`)
      : localizeProgressText(base);
  }

  if (event.type === "timeline_evidence_attached") {
    const refs = Array.isArray(event.payload?.evidenceRefs)
      ? event.payload.evidenceRefs
      : [];
    const count = refs.length;
    return count > 0
      ? localizeProgressText(
          `Attached ${count} evidence link${count === 1 ? "" : "s"}`,
        )
      : localizeProgressText("Attached evidence");
  }

  if (event.type === "timeline_artifact_emitted") {
    const path =
      typeof event.payload?.path === "string" ? event.payload.path : "";
    const label =
      typeof event.payload?.label === "string" &&
      event.payload.label.trim().length > 0
        ? event.payload.label
        : path;
    const artifactIsVerified =
      event.status === "completed" ||
      event.payload?.status === "completed" ||
      event.payload?.qualityStatus === "passed";
    const outputHeading = artifactIsVerified
      ? translate("timeline.outputReady", "Output ready")
      : translate("timeline.outputDraft", "Draft written");
    return path ? (
      <span>
        {outputHeading}:{" "}
        <ClickableFilePath
          path={path}
          workspacePath={workspacePath}
          onOpenViewer={onOpenViewer}
        />
        {label && label !== path && (
          <span className="event-title-meta"> ({label})</span>
        )}
      </span>
    ) : (
      outputHeading
    );
  }

  if (event.type === "timeline_error") {
    const message = getTimelineErrorText(event);
    if (isLongOsascriptCommandText(message))
      return localizeProgressText("Command failed: osascript");
    return message
      ? localizeErrorText(formatTimelineErrorTitleForDisplay(message))
      : getMessage("error", msgCtx);
  }

  if (
    event.type === "timeline_step_updated" &&
    effectiveType === "progress_update"
  ) {
    const rawMsg =
      typeof event.payload?.message === "string"
        ? event.payload.message
        : "Progress update";
    if (rawMsg === "Thinking...") {
      return (
        <span className="thinking-title">
          {translate("task.status.thinking", "Thinking")}
          <span className="thinking-ellipsis">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </span>
      );
    }
    return localizeProgressText(humanizeTimelineMessage(rawMsg));
  }

  switch (effectiveType) {
    case "task_created":
      return localizeProgressText(getMessage("taskStart", msgCtx));
    case "task_completed":
      return event.payload?.terminalStatus === "needs_user_action"
        ? localizeProgressText("Completed - action required")
        : event.payload?.terminalStatus === "partial_success"
          ? localizeProgressText("Completed - partial success")
          : localizeProgressText(getMessage("taskComplete", msgCtx));
    case "follow_up_completed": {
      const followUpMessage =
        typeof event.payload?.followUpMessage === "string"
          ? event.payload.followUpMessage.trim()
          : "";
      return followUpMessage
        ? localizeProgressText(`Follow-up: ${followUpMessage}`)
        : localizeProgressText("Follow-up received");
    }
    case "plan_created":
      return localizeProgressText(getMessage("planCreated", msgCtx));
    case "llm_retry": {
      const attempt =
        typeof event.payload?.attempt === "number" ? event.payload.attempt : 1;
      const maxRetries =
        typeof event.payload?.maxRetries === "number"
          ? event.payload.maxRetries
          : attempt;
      const delaySeconds =
        typeof event.payload?.delayMs === "number"
          ? Math.max(1, Math.round(event.payload.delayMs / 1000))
          : 0;
      const retryKind =
        typeof event.payload?.retryKind === "string"
          ? event.payload.retryKind
          : "unknown";
      const retryMessage = (() => {
        if (retryKind === "request_timeout") {
          return delaySeconds > 0
            ? [
                "timeline.modelTimeoutRetryWithDelay",
                "Model response timed out; retrying {attempt}/{maxRetries} in {delay}s",
              ]
            : [
                "timeline.modelTimeoutRetry",
                "Model response timed out; retrying {attempt}/{maxRetries}",
              ];
        }
        if (retryKind === "network") {
          return delaySeconds > 0
            ? [
                "timeline.modelNetworkRetryWithDelay",
                "Model connection was interrupted; retrying {attempt}/{maxRetries} in {delay}s",
              ]
            : [
                "timeline.modelNetworkRetry",
                "Model connection was interrupted; retrying {attempt}/{maxRetries}",
              ];
        }
        if (retryKind === "rate_limit") {
          return delaySeconds > 0
            ? [
                "timeline.modelRateLimitRetryWithDelay",
                "Model request limit reached; retrying {attempt}/{maxRetries} in {delay}s",
              ]
            : [
                "timeline.modelRateLimitRetry",
                "Model request limit reached; retrying {attempt}/{maxRetries}",
              ];
        }
        return delaySeconds > 0
          ? [
              "timeline.modelRetryWithDelay",
              "Model service is busy; retrying {attempt}/{maxRetries} in {delay}s",
            ]
          : [
              "timeline.modelRetry",
              "Model service is busy; retrying {attempt}/{maxRetries}",
            ];
      })();
      return delaySeconds > 0
        ? translate(
            retryMessage[0],
            retryMessage[1],
            { attempt, maxRetries, delay: delaySeconds },
          )
        : translate(
            retryMessage[0],
            retryMessage[1],
            { attempt, maxRetries },
          );
    }
    case "llm_routing_changed": {
      const primaryProvider =
        typeof event.payload?.currentProvider === "string"
          ? event.payload.currentProvider
          : typeof event.payload?.providerType === "string"
            ? event.payload.providerType
            : "model";
      const activeProvider =
        typeof event.payload?.activeProvider === "string"
          ? event.payload.activeProvider
          : primaryProvider;
      if (
        event.payload?.fallbackOccurred === true &&
        activeProvider !== primaryProvider
      ) {
        return translate(
          "timeline.providerSwitched",
          "{provider} request did not finish; switched to {fallback}",
          { provider: primaryProvider, fallback: activeProvider },
        );
      }
      return translate(
        "timeline.providerUnavailableRetrying",
        "{provider} request did not finish; retrying the current route",
        { provider: primaryProvider },
      );
    }
    case "task_queued": {
      const rawMessage =
        typeof event.payload?.message === "string" ? event.payload.message : "";
      const retryMatch = /Retrying\s+(\d+)\/(\d+)\s+in\s+(\d+)s/i.exec(
        rawMessage,
      );
      return retryMatch
        ? translate(
            "timeline.taskRetryQueued",
            "Temporary provider issue; retrying {attempt}/{maxRetries} in {delay}s",
            {
              attempt: retryMatch[1],
              maxRetries: retryMatch[2],
              delay: retryMatch[3],
            },
          )
        : localizeProgressText(
            humanizeTimelineMessage(rawMessage || "Waiting to retry"),
          );
    }
    case "task_dequeued": {
      const rawMessage =
        typeof event.payload?.message === "string" ? event.payload.message : "";
      const retryMatch = /retry\s+(\d+)\/(\d+)/i.exec(rawMessage);
      return retryMatch
        ? translate(
            "timeline.taskRetryStarted",
            "Starting retry {attempt}/{maxRetries}",
            { attempt: retryMatch[1], maxRetries: retryMatch[2] },
          )
        : translate(
            "timeline.queuedFollowUpStarting",
            "Starting the queued message",
          );
    }
    case "executing":
      return localizeProgressText("Starting the work");
    case "step_started":
      return localizeProgressText(
        formatTimelineActivityLabel(
          sanitizeToolCallTextFromAssistant(getStepStartedDetail()).text ||
            "Getting started...",
        ) || "Getting started",
      );
    case "step_completed":
      return localizeProgressText(
        getMessage(
          "stepCompleted",
          msgCtx,
          sanitizeToolCallTextFromAssistant(
            event.payload.step?.description || event.payload.message || "",
          ).text,
        ),
      );
    case "step_failed":
      if (
        isLongOsascriptCommandText(
          event.payload.step?.description ||
            event.payload.reason ||
            event.payload.error ||
            "",
        )
      ) {
        return localizeProgressText("Command failed: osascript");
      }
      return localizeProgressText(
        formatStepFailedTitleForDisplay(event.payload),
      );
    case "continuation_decision":
      return localizeProgressText("Deciding next steps");
    case "auto_continuation_started":
      return localizeProgressText("Continuing");
    case "auto_continuation_blocked":
      return localizeProgressText("Paused before continuing");
    case "context_compaction_started":
      return localizeProgressText("Making room to continue");
    case "context_compaction_completed":
      return localizeProgressText("Ready to continue");
    case "context_compaction_failed":
      return localizeProgressText("Continuing with available context");
    case "step_contract_escalated":
      return typeof event.payload?.reason === "string"
        ? localizeProgressText(
            formatStepContractEscalatedMessage(event.payload.reason),
          )
        : localizeProgressText("Adjusting approach");
    case "no_progress_circuit_breaker":
      return localizeProgressText("Paused to avoid getting stuck");
    case "tool_call": {
      const tcTool = event.payload.tool;
      const tcInput = event.payload.input;
      return friendlyToolCallTitle(
        typeof tcTool === "string" ? tcTool : undefined,
        tcInput && typeof tcInput === "object"
          ? (tcInput as Record<string, unknown>)
          : undefined,
      );
    }
    case "tool_result": {
      const result = event.payload.result;
      const success = !isFailedToolPayload(result);

      // schedule_task is user-facing; surface a compact summary in the title.
      if (event.payload.tool === "schedule_task") {
        const status = success ? "done" : "issue";
        const describeEvery = (ms: number): string => {
          if (!Number.isFinite(ms) || ms <= 0) return `${ms}ms`;
          const day = 24 * 60 * 60 * 1000;
          const hour = 60 * 60 * 1000;
          const minute = 60 * 1000;
          const second = 1000;

          if (ms >= day && ms % day === 0) {
            const days = ms / day;
            return `Every ${days} day${days === 1 ? "" : "s"}`;
          }
          if (ms >= hour && ms % hour === 0) {
            const hours = ms / hour;
            return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
          }
          if (ms >= minute && ms % minute === 0) {
            const minutes = ms / minute;
            return `Every ${minutes} minute${minutes === 1 ? "" : "s"}`;
          }
          if (ms >= second && ms % second === 0) {
            const seconds = ms / second;
            return `Every ${seconds} second${seconds === 1 ? "" : "s"}`;
          }
          return `Every ${Math.round(ms / 1000)}s`;
        };

        const describeScheduleShort = (schedule: Any): string | null => {
          if (!schedule || typeof schedule !== "object") return null;
          if (
            schedule.kind === "every" &&
            typeof schedule.everyMs === "number"
          ) {
            return describeEvery(schedule.everyMs);
          }
          if (schedule.kind === "cron" && typeof schedule.expr === "string") {
            return `Cron: ${schedule.expr}`;
          }
          if (schedule.kind === "at" && typeof schedule.atMs === "number") {
            return `Once at ${new Date(schedule.atMs).toLocaleString()}`;
          }
          return null;
        };

        // Error-first title for schedule failures.
        if (!success && result?.error) {
          const errorMsg =
            typeof result.error === "string" ? result.error : "Unknown error";
          const clipped =
            errorMsg.slice(0, 80) + (errorMsg.length > 80 ? "..." : "");
          return `schedule_task issue: ${clipped}`;
        }

        // "create"/"update" responses include { success, job }.
        const job = result?.job;
        if (job && typeof job === "object") {
          const jobName =
            String((job as Any).name || "").trim() || "Scheduled task";
          const scheduleDesc = describeScheduleShort((job as Any).schedule);
          const nextRunAtMs = (job as Any).state?.nextRunAtMs;
          const next =
            typeof nextRunAtMs === "number"
              ? new Date(nextRunAtMs).toLocaleString()
              : null;
          const parts = [scheduleDesc, next ? `Next: ${next}` : null].filter(
            Boolean,
          ) as string[];
          return parts.length > 0
            ? `${jobName} → ${parts.join(" • ")}`
            : jobName;
        }

        // "list" returns an array of jobs.
        if (Array.isArray(result)) {
          const n = result.length;
          return `schedule_task ${status} → ${n} task${n === 1 ? "" : "s"}`;
        }
      }

      return friendlyToolResultTitle(
        typeof event.payload.tool === "string" ? event.payload.tool : undefined,
        result && typeof result === "object"
          ? (result as Record<string, unknown>)
          : undefined,
        success,
      );
    }
    case "assistant_message":
      return msgCtx.agentName;
    case "file_created": {
      const fcp = event.payload;
      let fcSuffix = "";
      if (fcp.type === "directory") {
        fcSuffix = " (directory)";
      } else if (fcp.type === "screenshot") {
        fcSuffix = " (screenshot)";
      } else if (fcp.copiedFrom) {
        fcSuffix = " (copy)";
      } else if (fcp.lineCount && fcp.size) {
        fcSuffix = ` (${fcp.lineCount} lines, ${formatFileSize(fcp.size)})`;
      } else if (fcp.size) {
        fcSuffix = ` (${formatFileSize(fcp.size)})`;
      }
      return (
        <span>
          Created:{" "}
          <ClickableFilePath
            path={fcp.path}
            workspacePath={workspacePath}
            onOpenViewer={onOpenViewer}
          />
          {fcSuffix && <span className="event-title-meta">{fcSuffix}</span>}
        </span>
      );
    }
    case "file_modified": {
      const fmp = event.payload;
      const fmPath = fmp.path || fmp.from;
      let fmSuffix = "";
      if (fmp.action === "rename" && fmp.to) {
        const toName = fmp.to.split("/").pop();
        fmSuffix = ` → ${toName}`;
      } else if (fmp.type === "edit" && fmp.replacements) {
        const netStr =
          fmp.netLines != null
            ? fmp.netLines > 0
              ? `, +${fmp.netLines} lines`
              : fmp.netLines < 0
                ? `, ${fmp.netLines} lines`
                : ""
            : "";
        fmSuffix = ` (${fmp.replacements} edit${fmp.replacements > 1 ? "s" : ""}${netStr})`;
      }
      return (
        <span>
          Updated:{" "}
          <ClickableFilePath
            path={fmPath}
            workspacePath={workspacePath}
            onOpenViewer={onOpenViewer}
          />
          {fmSuffix && <span className="event-title-meta">{fmSuffix}</span>}
        </span>
      );
    }
    case "file_deleted":
      return `Removed: ${event.payload.path}`;
    case "artifact_created": {
      const acp = event.payload || {};
      const acPath = typeof acp.path === "string" ? acp.path : "";
      const acType = typeof acp.type === "string" ? acp.type : "artifact";
      return acPath ? (
        <span>
          Output ready:{" "}
          <ClickableFilePath
            path={acPath}
            workspacePath={workspacePath}
            onOpenViewer={onOpenViewer}
          />
          <span className="event-title-meta"> ({acType})</span>
        </span>
      ) : (
        `Output ready (${acType})`
      );
    }
    case "diagram_created": {
      const title =
        typeof event.payload?.title === "string"
          ? event.payload.title
          : "Diagram";
      return (
        <span>
          Diagram: <span className="event-title-meta">{title}</span>
        </span>
      );
    }
    case "error":
      return localizeProgressText(getMessage("error", msgCtx));
    case "approval_requested": {
      const approval = getApprovalPayload(event);
      if (isRunCommandApproval(approval)) {
        return "Running command:";
      }
      return getApprovalTimelineTitle(approval);
    }
    case "input_request_created":
      return localizeProgressText("Structured input requested");
    case "input_request_resolved":
      return localizeProgressText("Structured input submitted");
    case "input_request_dismissed":
      return localizeProgressText("Structured input dismissed");
    case "log": {
      const logMsg = event.payload?.message;
      return typeof logMsg === "string"
        ? localizeProgressText(humanizeTimelineMessage(logMsg))
        : localizeProgressText("Log");
    }
    case "verification_started":
      return localizeProgressText(getMessage("verifying", msgCtx));
    case "verification_passed":
      return localizeProgressText(
        `${getMessage("verifyPassed", msgCtx)} (attempt ${event.payload.attempt})`,
      );
    case "verification_failed": {
      const attempt = event.payload?.attempt;
      const maxAttempts = event.payload?.maxAttempts;
      if (typeof attempt === "number" && typeof maxAttempts === "number") {
        return localizeProgressText(
          `${getMessage("verifyFailed", msgCtx)} (attempt ${attempt}/${maxAttempts})`,
        );
      }
      return localizeProgressText(getMessage("verifyFailed", msgCtx));
    }
    case "verification_pending_user_action":
      return translate(
        "timeline.verificationRequiresUserAction",
        "Verification requires user action",
      );
    case "retry_started":
      return localizeProgressText(
        getMessage("retrying", msgCtx, String(event.payload.attempt)),
      );
    default: {
      const friendly = humanizeTimelineMessage(event.type);
      return localizeProgressText(
        friendly !== event.type ? friendly : event.type,
      );
    }
  }
}

export function renderEventDetails(
  event: TaskEvent,
  _voiceEnabled: boolean,
  markdownComponents: Any,
  options?: {
    workspacePath?: string;
    onOpenViewer?: (path: string) => void;
    onOpenSpreadsheetArtifact?: (path: string) => void;
    onOpenDocumentArtifact?: (path: string) => void;
    onOpenPresentationArtifact?: (path: string) => void;
    onOpenWebArtifact?: (path: string) => void;
    onQuoteAssistantMessage?: (quote: QuotedAssistantMessage) => void;
    onForkTaskSession?: (event: TaskEvent) => void;
    events?: TaskEvent[];
    onViewOutputs?: (taskId: string, primaryOutputPath?: string) => void;
    hideVerificationSteps?: boolean;
    summaryMode?: boolean;
    task?: Task | null;
    childTasks?: Task[];
    commandOutputSessions?: CommandOutputSession[];
    renderCommandOutput?: (sessions: CommandOutputSession[]) => React.ReactNode;
    deferEndOfTaskArtifactCards?: boolean;
  },
) {
  const workspacePath = options?.workspacePath;
  const onOpenViewer = options?.onOpenViewer;
  const onOpenSpreadsheetArtifact = options?.onOpenSpreadsheetArtifact;
  const onOpenDocumentArtifact = options?.onOpenDocumentArtifact;
  const onOpenPresentationArtifact = options?.onOpenPresentationArtifact;
  const onOpenWebArtifact = options?.onOpenWebArtifact;
  const eventStream = options?.events || [];
  const onViewOutputs = options?.onViewOutputs;
  const summaryMode = options?.summaryMode === true;
  const taskForEvent =
    options?.task?.id === event.taskId
      ? options.task
      : (options?.childTasks?.find((t) => t.id === event.taskId) ??
        options?.task);
  const effectiveType = getEffectiveTaskEventType(event);
  const stepCompletionPreviewPath = getStepCompletionPreviewPath(event);
  const shouldRenderOpenArtifactCard = (artifactPath: string) => {
    const previewKind = getInlinePreviewKindForGeneratedFile({
      path: artifactPath,
    });
    if (
      options?.deferEndOfTaskArtifactCards &&
      previewKind &&
      END_OF_TASK_ARTIFACT_KINDS.has(previewKind)
    ) {
      return false;
    }
    return shouldRenderOpenArtifactCardAtEvent({
      path: artifactPath,
      event,
      eventStream,
    });
  };
  const renderLinkedArtifactCards = (text: string) => {
    if (!workspacePath) return null;
    if (!text.trim()) return null;
    const artifactPaths = getTaskEventArtifactPaths(event, eventStream).filter(
      (artifactPath) => shouldRenderOpenArtifactCard(artifactPath),
    );
    if (artifactPaths.length === 0) return null;

    return (
      <div className="assistant-artifact-cards">
        {artifactPaths.map((artifactPath) => {
          const previewKind = getInlinePreviewKindForGeneratedFile({
            path: artifactPath,
          });
          if (previewKind === "spreadsheet") {
            return (
              <SpreadsheetArtifactCard
                key={artifactPath}
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenSpreadsheetArtifact || onOpenViewer}
              />
            );
          }
          if (previewKind === "document") {
            return (
              <DocumentArtifactCard
                key={artifactPath}
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenDocumentArtifact || onOpenViewer}
              />
            );
          }
          if (previewKind === "presentation") {
            return (
              <PresentationArtifactCard
                key={artifactPath}
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenPresentationArtifact || onOpenViewer}
              />
            );
          }
          if (previewKind === "html") {
            return (
              <WebArtifactCard
                key={artifactPath}
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenWebArtifact || onOpenViewer}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  if (
    event.type === "timeline_group_started" ||
    event.type === "timeline_group_finished"
  ) {
    if (summaryMode) return null;
    const stage =
      typeof event.payload?.stage === "string" &&
      event.payload.stage.trim().length > 0
        ? event.payload.stage.trim()
        : "";
    const groupLabel =
      (typeof event.payload?.groupLabel === "string" &&
        event.payload.groupLabel.trim()) ||
      "";
    const maxParallel =
      typeof event.payload?.maxParallel === "number" &&
      Number.isFinite(event.payload.maxParallel)
        ? Math.max(1, Math.floor(event.payload.maxParallel))
        : undefined;
    const phaseLabel = stage ? getSummaryStageLabel(stage) || stage : null;
    const isSubStage = groupLabel && groupLabel.toUpperCase() !== stage;
    return (
      <div className="event-details">
        {phaseLabel ? (
          <div>
            {translate("timeline.phaseLabel", "Phase")}:{" "}
            {localizeProgressText(phaseLabel)}
          </div>
        ) : null}
        {isSubStage ? <div>Step: {groupLabel}</div> : null}
        {typeof maxParallel === "number" && maxParallel > 1 ? (
          <div>{maxParallel} tasks in parallel</div>
        ) : null}
      </div>
    );
  }

  if (event.type === "timeline_evidence_attached") {
    const refs = Array.isArray(event.payload?.evidenceRefs)
      ? event.payload.evidenceRefs
      : [];
    if (!refs.length) return null;
    return (
      <div className="event-details evidence-event-details">
        <div className="evidence-event-details-title">
          {translate("timeline.evidence", "Evidence")}
        </div>
        <div className="evidence-event-details-scroll">
          <ul className="evidence-event-details-list">
            {refs.map((entry: Any, index: number) => {
              const source =
                typeof entry?.sourceUrlOrPath === "string"
                  ? entry.sourceUrlOrPath.trim()
                  : "";
              if (!source) return null;
              const snippet =
                typeof entry?.snippet === "string"
                  ? stripHtmlTags(entry.snippet).replace(/\s+/g, " ").trim()
                  : "";
              const isWeb = /^https?:\/\//i.test(source);
              const webDisplay = isWeb
                ? getWebEvidenceDisplay(source, snippet)
                : null;
              return (
                <li
                  key={`${source}-${index}`}
                  className="evidence-event-details-item"
                >
                  {webDisplay ? (
                    <a
                      className="evidence-event-link"
                      href={source}
                      target="_blank"
                      rel="noreferrer"
                      title={
                        snippet ? `${webDisplay.label}\n${source}` : source
                      }
                    >
                      <span
                        className="evidence-event-favicon"
                        aria-hidden="true"
                      >
                        {webDisplay.siteLabel.charAt(0).toUpperCase()}
                      </span>
                      <span className="evidence-event-domain">
                        {webDisplay.siteLabel}
                      </span>
                      {snippet ? (
                        <span className="evidence-event-link-title">
                          {webDisplay.label}
                        </span>
                      ) : null}
                    </a>
                  ) : (
                    <span
                      className="evidence-event-link evidence-event-link-static"
                      title={source}
                    >
                      <span className="evidence-event-link-title">
                        {snippet || source}
                      </span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  if (event.type === "timeline_error") {
    const message = getTimelineErrorText(event);
    if (isLongOsascriptCommandText(message)) {
      return (
        <div className="event-details event-details-command-error">
          <OsascriptCommandExcerpt text={message} />
        </div>
      );
    }
    return (
      <div className="event-details event-details-failure">
        {localizeErrorText(message || "Timeline error")}
      </div>
    );
  }

  if (effectiveType === "diagram_created") {
    const diagram =
      typeof event.payload?.diagram === "string" ? event.payload.diagram : "";
    if (!diagram.trim()) return null;
    return (
      <div className="diagram-event-details">
        <MermaidDiagram chart={diagram} />
      </div>
    );
  }

  switch (effectiveType) {
    case "task_completed": {
      const outputSummary = resolveTaskOutputSummaryFromCompletionEvent(
        event,
        eventStream,
      );
      const isNeedsUserAction =
        event.payload?.terminalStatus === "needs_user_action";
      if (!hasTaskOutputs(outputSummary) && !isNeedsUserAction) return null;

      const primaryOutputPath = outputSummary?.primaryOutputPath;
      const primaryOutputName = primaryOutputPath
        ? primaryOutputPath.split("/").pop() || primaryOutputPath
        : "";
      const primaryOutputIsVideo =
        typeof primaryOutputPath === "string" &&
        VIDEO_FILE_EXT_RE.test(primaryOutputPath);
      const primaryOutputIsHtml =
        typeof primaryOutputPath === "string" &&
        HTML_FILE_EXT_RE.test(primaryOutputPath);
      const primaryOutputIsPresentation =
        typeof primaryOutputPath === "string" &&
        PRESENTATION_FILE_EXT_RE.test(primaryOutputPath);
      const primaryOutputIsSpreadsheet =
        typeof primaryOutputPath === "string" &&
        SPREADSHEET_FILE_EXT_RE.test(primaryOutputPath);
      const primaryOutputIsDocument =
        typeof primaryOutputPath === "string" &&
        isWordDocumentArtifactFile(primaryOutputPath);
      const latexPair = findLatexPdfPair(eventStream, outputSummary);
      const outputCount = outputSummary?.outputCount ?? 0;
      const outputLabel =
        outputCount === 1 ? `1 output ready` : `${outputCount} outputs ready`;

      const pendingChecklist: string[] = Array.isArray(
        event.payload?.pendingChecklist,
      )
        ? event.payload.pendingChecklist.filter(
            (item: unknown): item is string => typeof item === "string",
          )
        : [];
      return (
        <div className="event-details completion-output-card">
          <div className="completion-output-header">
            {isNeedsUserAction
              ? translate("timeline.actionRequired", "Action required")
              : translate("timeline.outputReady", "Output ready")}
          </div>
          {isNeedsUserAction && (
            <div className="completion-output-subtitle">
              {translate(
                "timeline.completePendingVerification",
                "Complete the pending verification items to fully close this task.",
              )}
            </div>
          )}
          {hasTaskOutputs(outputSummary) && (
            <>
              {latexPair && workspacePath && (
                <div className="completion-output-preview">
                  <LatexArtifactWorkbench
                    sourcePath={latexPair.sourcePath}
                    pdfPath={latexPair.pdfPath}
                    workspacePath={workspacePath}
                    onOpenViewer={onOpenViewer}
                  />
                </div>
              )}
              {!latexPair &&
                primaryOutputIsVideo &&
                primaryOutputPath &&
                workspacePath && (
                  <div className="completion-output-preview">
                    <InlineVideoPreview
                      filePath={primaryOutputPath}
                      workspacePath={workspacePath}
                      onOpenViewer={onOpenViewer}
                    />
                  </div>
                )}
              {!latexPair &&
                primaryOutputIsHtml &&
                primaryOutputPath &&
                workspacePath &&
                shouldRenderOpenArtifactCard(primaryOutputPath) && (
                  <div className="completion-output-preview">
                    <WebArtifactCard
                      filePath={primaryOutputPath}
                      workspacePath={workspacePath}
                      onOpenViewer={onOpenWebArtifact || onOpenViewer}
                    />
                  </div>
                )}
              {!latexPair &&
                primaryOutputIsPresentation &&
                primaryOutputPath &&
                workspacePath &&
                shouldRenderOpenArtifactCard(primaryOutputPath) && (
                  <div className="completion-output-preview">
                    <PresentationArtifactCard
                      filePath={primaryOutputPath}
                      workspacePath={workspacePath}
                      onOpenViewer={onOpenPresentationArtifact || onOpenViewer}
                    />
                  </div>
                )}
              {!latexPair &&
                primaryOutputIsSpreadsheet &&
                primaryOutputPath &&
                workspacePath &&
                shouldRenderOpenArtifactCard(primaryOutputPath) && (
                  <div className="completion-output-preview">
                    <SpreadsheetArtifactCard
                      filePath={primaryOutputPath}
                      workspacePath={workspacePath}
                      onOpenViewer={onOpenSpreadsheetArtifact || onOpenViewer}
                    />
                  </div>
                )}
              {!latexPair &&
                primaryOutputIsDocument &&
                primaryOutputPath &&
                workspacePath &&
                shouldRenderOpenArtifactCard(primaryOutputPath) && (
                  <div className="completion-output-preview">
                    <DocumentArtifactCard
                      filePath={primaryOutputPath}
                      workspacePath={workspacePath}
                      onOpenViewer={onOpenDocumentArtifact || onOpenViewer}
                    />
                  </div>
                )}
              <div className="completion-output-subtitle">{outputLabel}</div>
              {primaryOutputPath && (
                <div className="completion-output-primary">
                  {translate("timeline.primaryFile", "Primary file")}:{" "}
                  <ClickableFilePath
                    path={primaryOutputPath}
                    workspacePath={workspacePath}
                    onOpenViewer={onOpenViewer}
                  />
                  {primaryOutputName && (
                    <span className="event-title-meta">
                      {" "}
                      ({primaryOutputName})
                    </span>
                  )}
                </div>
              )}
              <div className="completion-output-actions">
                <button
                  className="completion-output-btn"
                  disabled={!primaryOutputPath}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!primaryOutputPath) return;
                    void window.electronAPI.openFile(
                      primaryOutputPath,
                      workspacePath,
                    );
                  }}
                >
                  {translate("timeline.openFile", "Open file")}
                </button>
                {primaryOutputPath && (
                  <ArtifactDownloadButton
                    filePath={primaryOutputPath}
                    workspacePath={workspacePath}
                    className="completion-output-btn secondary"
                  />
                )}
                <button
                  className="completion-output-btn secondary"
                  disabled={!primaryOutputPath}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!primaryOutputPath) return;
                    void window.electronAPI.showInFinder(
                      primaryOutputPath,
                      workspacePath,
                    );
                  }}
                >
                  {translate("timeline.showInFinder", "Show in Finder")}
                </button>
                <button
                  className="completion-output-btn secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onViewOutputs?.(event.taskId, primaryOutputPath);
                  }}
                >
                  {translate("timeline.viewInFiles", "View in Files")}
                </button>
              </div>
            </>
          )}
          {pendingChecklist.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {pendingChecklist.map((item, idx) => (
                <li key={`${idx}-${item}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "follow_up_completed": {
      const followUpMessage =
        typeof event.payload?.followUpMessage === "string"
          ? event.payload.followUpMessage.trim()
          : "";
      return (
        <div className="event-details follow-up-completed-details">
          <div className="follow-up-completed-title">
            {translate("timeline.followUpReceived", "Follow-up received")}
          </div>
          {followUpMessage && (
            <div className="markdown-content">
              <DeferredMarkdown withBreaks components={markdownComponents}>
                {normalizeMarkdownForDisplay(followUpMessage)}
              </DeferredMarkdown>
            </div>
          )}
          {renderLinkedArtifactCards(followUpMessage)}
        </div>
      );
    }
    case "plan_created": {
      const inlinePlanMarkdownComponents = {
        ...markdownComponents,
        // Keep each list item inline; avoid wrapping with extra <p> inside <li>.
        p: ({ children }: Any) => <>{children}</>,
      };
      const planSteps = Array.isArray(event.payload.plan?.steps)
        ? event.payload.plan.steps
        : [];
      const visiblePlanSteps = options?.hideVerificationSteps
        ? planSteps.filter(
            (step: Any) => !isVerificationStepDescription(step?.description),
          )
        : planSteps;
      return (
        <div className="event-details markdown-content">
          <div style={{ marginBottom: 8, fontWeight: 500 }}>
            <DeferredMarkdown components={markdownComponents}>
              {normalizeMarkdownForDisplay(
                String(event.payload.plan?.description || ""),
              )}
            </DeferredMarkdown>
          </div>
          {visiblePlanSteps.length > 0 && (
            <div className="plan-checklist">
              {visiblePlanSteps.map((step: Any, i: number) => (
                <div key={i} className="plan-checklist-item">
                  <span className="plan-checklist-circle" />
                  <span className="plan-checklist-text">
                    <DeferredMarkdown components={inlinePlanMarkdownComponents}>
                      {normalizeMarkdownForDisplay(
                        String(step?.description || ""),
                      )}
                    </DeferredMarkdown>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "tool_call": {
      const tcToolName = event.payload.tool;
      const tcInput = event.payload.input;

      if (tcToolName === "web_search") {
        return <WebSearchEventDetails value={tcInput} completed={false} />;
      }
      if (tcToolName === "web_fetch" || tcToolName === "http_request") {
        return (
          <WebFetchEventDetails
            value={tcInput}
            completed={false}
            toolName={tcToolName}
          />
        );
      }

      // run_command: embed CLI output inside tool call frame when available
      if (tcToolName === "run_command" && tcInput?.command) {
        const cmdSessions = options?.commandOutputSessions ?? [];
        const renderCmd = options?.renderCommandOutput;
        if (cmdSessions.length > 0 && renderCmd) {
          return (
            <div className="event-details event-details-run-command event-details-scrollable">
              {renderCmd(cmdSessions)}
            </div>
          );
        }
        return <ToolPayloadDetails value={tcInput} showSummary={false} />;
      }

      // write_file: show path + code preview
      if (tcToolName === "write_file" && tcInput?.path && tcInput?.content) {
        const tcLines = tcInput.content.split("\n");
        const tcPreview = tcLines.slice(0, 20).join("\n");
        const tcExt = (tcInput.path.split(".").pop() || "text").toLowerCase();
        return (
          <div className="event-details event-details-scrollable event-details-code-preview">
            <div className="code-preview-header">
              <span className="code-preview-path">{tcInput.path}</span>
              <span className="code-preview-language">{tcExt}</span>
            </div>
            <pre className="code-preview-content">
              <code>{truncateForDisplay(tcPreview, 1500)}</code>
            </pre>
            {tcLines.length > 20 && (
              <div className="code-preview-truncated">
                ... {tcLines.length - 20} more lines
              </div>
            )}
          </div>
        );
      }

      // edit_file: show diff-like view
      if (tcToolName === "edit_file" && tcInput?.file_path) {
        const oldDiffPreview =
          typeof tcInput.old_string === "string"
            ? normalizeCodeBlockTextForDisplay(
                truncateForDisplay(tcInput.old_string, 500),
                "diff",
              )
            : "";
        const newDiffPreview =
          typeof tcInput.new_string === "string"
            ? normalizeCodeBlockTextForDisplay(
                truncateForDisplay(tcInput.new_string, 500),
                "diff",
              )
            : "";
        return (
          <div className="event-details event-details-scrollable event-details-code-preview">
            <div className="code-preview-header">
              <span className="code-preview-path">{tcInput.file_path}</span>
            </div>
            <div className="edit-diff-preview">
              {oldDiffPreview && (
                <div className="diff-line diff-removed">
                  <span className="diff-marker">-</span>
                  <pre>
                    <code>{oldDiffPreview}</code>
                  </pre>
                </div>
              )}
              {newDiffPreview && (
                <div className="diff-line diff-added">
                  <span className="diff-marker">+</span>
                  <pre>
                    <code>{newDiffPreview}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      }

      // Keep raw parameters available without letting implementation details
      // dominate the task transcript.
      return <ToolPayloadDetails value={tcInput} showSummary={false} />;
    }
    case "tool_result":
      if (event.payload.tool === "web_search") {
        return (
          <WebSearchEventDetails
            value={event.payload.result}
            completed={true}
          />
        );
      }
      if (
        event.payload.tool === "web_fetch" ||
        event.payload.tool === "http_request"
      ) {
        return (
          <WebFetchEventDetails
            value={event.payload.result}
            completed={true}
            toolName={event.payload.tool}
          />
        );
      }
      return (
        <ToolPayloadDetails value={event.payload.result} showSummary={true} />
      );
    case "assistant_message": {
      const linkedMessage = cleanAssistantMessageForDisplay(
        event.payload.message,
      );
      return (
        <div className="event-details assistant-message event-details-scrollable">
          <div className="markdown-content">
            <AssistantMessageContent
              message={linkedMessage}
              markdownComponents={markdownComponents}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
          {renderLinkedArtifactCards(linkedMessage)}
        </div>
      );
    }
    case "step_completed": {
      if (stepCompletionPreviewPath && workspacePath) {
        return (
          <div className="event-details event-details-file-preview">
            <InlineDocumentPreview
              filePath={stepCompletionPreviewPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }
      return null;
    }
    case "step_failed": {
      const rawReason =
        event.payload?.reason ||
        event.payload?.step?.error ||
        event.payload?.error ||
        "Step failed.";
      const displayReason = formatProviderErrorForDisplay(String(rawReason), {
        task: taskForEvent,
      });
      if (isLongOsascriptCommandText(displayReason)) {
        return (
          <div className="event-details event-details-command-error">
            <OsascriptCommandExcerpt text={displayReason} />
          </div>
        );
      }
      return (
        <div className="event-details event-details-failure">
          {localizeErrorText(displayReason)}
        </div>
      );
    }
    case "verification_pending_user_action": {
      const checklist: string[] = Array.isArray(event.payload?.pendingChecklist)
        ? event.payload.pendingChecklist.filter(
            (item: unknown): item is string => typeof item === "string",
          )
        : [];
      return (
        <div className="event-details">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {translate(
              "timeline.verificationPendingUserAction",
              "Verification pending user action",
            )}
          </div>
          {typeof event.payload?.message === "string" &&
            event.payload.message.trim().length > 0 && (
              <div style={{ marginBottom: checklist.length > 0 ? 6 : 0 }}>
                {event.payload.message}
              </div>
            )}
          {checklist.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {checklist.map((item, idx) => (
                <li key={`${idx}-${item}`}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case "approval_requested": {
      const approval = getApprovalPayload(event);
      if (!approval) return null;

      const command = extractApprovalCommand(approval);
      const cwd =
        typeof approval?.details?.cwd === "string" ? approval.details.cwd : "";
      const timeoutMs =
        typeof approval?.details?.timeout === "number" &&
        Number.isFinite(approval.details.timeout)
          ? approval.details.timeout
          : null;
      const timeoutLabel =
        typeof timeoutMs === "number"
          ? `${Math.max(1, Math.round(timeoutMs / 1000))}s`
          : null;

      if (command) {
        const commandPreview = buildApprovalCommandPreview(command);
        return (
          <div className="event-details">
            <div style={{ marginBottom: 6, fontWeight: 600 }}>
              {translate("timeline.runningCommand", "Running command:")}
            </div>
            <div
              className="session-approval-code-scroll"
              role="region"
              aria-label={translate("timeline.command", "Command")}
            >
              <code className="session-approval-code session-approval-code--multiline">
                {commandPreview.text}
              </code>
            </div>
            {commandPreview.truncated ? (
              <div className="session-approval-preview-note">
                {translate(
                  "timeline.commandPreviewCondensed",
                  "Preview condensed for readability. Approval still applies to the full command.",
                )}
              </div>
            ) : null}
            {(cwd || timeoutLabel) && (
              <div style={{ marginTop: 8 }}>
                {cwd && (
                  <div>
                    {translate("timeline.cwd", "CWD")}: {cwd}
                  </div>
                )}
                {timeoutLabel && (
                  <div>
                    {translate("timeline.timeout", "Timeout")}: {timeoutLabel}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="event-details approval-event-summary">
          <p>{getApprovalTimelineDescription(approval)}</p>
          <dl>
            {getApprovalToolName(approval) ? (
              <>
                <dt>{translate("timeline.approval.action", "Action")}</dt>
                <dd>
                  {localizeProgressText(
                    friendlyToolCallTitle(
                      getApprovalToolName(approval),
                      getApprovalParamsRecord(approval),
                    ),
                  )}
                </dd>
              </>
            ) : null}
            {getApprovalParamString(approval, "url") ? (
              <>
                <dt>{translate("timeline.approval.target", "Target")}</dt>
                <dd title={getApprovalParamString(approval, "url")}>
                  {getApprovalTargetHost(
                    getApprovalParamString(approval, "url"),
                  )}
                </dd>
              </>
            ) : null}
            {getApprovalParamString(approval, "path") ? (
              <>
                <dt>{translate("timeline.approval.target", "Target")}</dt>
                <dd title={getApprovalParamString(approval, "path")}>
                  {getApprovalParamString(approval, "path")}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      );
    }
    case "input_request_created": {
      const request = event.payload?.request;
      const questions: Array<{
        question?: string;
        options?: Array<{ label?: string }>;
      }> = Array.isArray(request?.questions) ? request.questions : [];
      if (questions.length === 0) return null;
      return (
        <div className="event-details event-details-scrollable">
          <div style={{ marginBottom: 8, fontWeight: 600 }}>
            {translate(
              "timeline.pendingStructuredPrompt",
              "Pending structured prompt",
            )}
          </div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {questions.map((question, idx) => (
              <li key={`${idx}-${question?.question || "q"}`}>
                <div>
                  {question?.question ||
                    translate("structuredInput.question", "Question")}
                </div>
                {Array.isArray(question?.options) &&
                  question.options.length > 0 && (
                    <div
                      style={{ color: "var(--color-text-muted)", fontSize: 12 }}
                    >
                      {question.options
                        .map((option) =>
                          typeof option?.label === "string" ? option.label : "",
                        )
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
              </li>
            ))}
          </ol>
        </div>
      );
    }
    case "file_created": {
      const fcPayload = event.payload;
      const fcPath = fcPayload?.path;
      const fcIsScreenshot = fcPayload?.type === "screenshot";
      const fcPreviewKind = getInlinePreviewKindForGeneratedFile({
        path: fcPath,
        mimeType: fcPayload?.mimeType,
        type: fcPayload?.type,
      });

      if (fcPreviewKind === "image" && fcPath && workspacePath) {
        if (summaryMode && fcIsScreenshot) {
          return (
            <div className="event-details">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {translate("timeline.screenshotOutput", "Screenshot output")}
              </div>
              <ClickableFilePath
                path={fcPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }
        return (
          <div className="event-details event-details-file-preview">
            <InlineImagePreview
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      if (fcPreviewKind === "video" && fcPath && workspacePath) {
        return (
          <div className="event-details event-details-file-preview">
            <InlineVideoPreview
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      if (
        fcPreviewKind === "html" &&
        fcPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fcPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <WebArtifactCard
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenWebArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fcPreviewKind === "spreadsheet" &&
        fcPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fcPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <SpreadsheetArtifactCard
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenSpreadsheetArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fcPreviewKind === "document" &&
        fcPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fcPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <DocumentArtifactCard
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenDocumentArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fcPreviewKind === "presentation" &&
        fcPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fcPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <PresentationArtifactCard
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenPresentationArtifact || onOpenViewer}
            />
          </div>
        );
      }

      const fcMimeType =
        typeof fcPayload?.mimeType === "string"
          ? fcPayload.mimeType.toLowerCase()
          : "";
      const fcIsMarkdown =
        fcPayload?.type === "markdown" ||
        fcMimeType === "text/markdown" ||
        /\.md(?:own)?$/i.test(String(fcPath || "")) ||
        String(fcPayload?.language || "").toLowerCase() === "md" ||
        String(fcPayload?.language || "").toLowerCase() === "markdown";
      const fcIsDocument =
        fcPayload?.type === "pdf" ||
        fcPayload?.type === "docx" ||
        fcPayload?.type === "markdown" ||
        fcPayload?.type === "text" ||
        fcPayload?.type === "code" ||
        fcMimeType === "application/pdf" ||
        fcMimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fcMimeType === "text/markdown" ||
        DOCUMENT_PREVIEW_EXT_RE.test(String(fcPath || ""));

      // For markdown outputs, prefer rendered markdown over raw contentPreview syntax.
      if (fcIsMarkdown && fcPath && workspacePath) {
        return (
          <div className="event-details event-details-file-preview">
            <InlineDocumentPreview
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      // Content preview for text file writes
      if (fcPayload?.contentPreview) {
        const previewLineCount = fcPayload.contentPreview.split("\n").length;
        const fcPathString = typeof fcPath === "string" ? fcPath : "";
        const fcLanguage = String(fcPayload.language || "").toLowerCase();
        const isJsonlPreview =
          fcLanguage === "jsonl" || /\.jsonl$/i.test(fcPathString);
        const canRenderJsonlPreview =
          isJsonlPreview &&
          parseJsonlPreview(fcPayload.contentPreview) !== null;
        return (
          <div className="event-details event-details-scrollable event-details-code-preview">
            <div className="code-preview-header">
              <span className="code-preview-language">
                {fcPayload.language || "text"}
              </span>
              {fcPayload.previewTruncated && (
                <span className="code-preview-truncated">
                  showing first {previewLineCount} of {fcPayload.lineCount}{" "}
                  lines
                </span>
              )}
            </div>
            {canRenderJsonlPreview ? (
              <JsonlPreview
                content={fcPayload.contentPreview}
                truncated={Boolean(fcPayload.previewTruncated)}
              />
            ) : (
              <HighlightedCodePreview
                code={fcPayload.contentPreview}
                language={fcPayload.language}
              />
            )}
          </div>
        );
      }

      if (fcIsDocument && fcPath && workspacePath) {
        return (
          <div className="event-details event-details-file-preview">
            <InlineDocumentPreview
              filePath={fcPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      // Copy source info
      if (fcPayload?.copiedFrom) {
        return (
          <div className="event-details">
            Copied from:{" "}
            <ClickableFilePath
              path={fcPayload.copiedFrom}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      return null;
    }
    case "file_modified": {
      const fmPayload = event.payload;
      const fmPath = fmPayload?.path || fmPayload?.from;
      const fmIsScreenshot = fmPayload?.type === "screenshot";
      const fmPreviewKind = getInlinePreviewKindForGeneratedFile({
        path: fmPath,
        mimeType: fmPayload?.mimeType,
        type: fmPayload?.type,
      });

      if (fmPreviewKind === "image" && fmPath && workspacePath) {
        if (summaryMode && fmIsScreenshot) {
          return (
            <div className="event-details">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {translate("timeline.screenshotOutput", "Screenshot output")}
              </div>
              <ClickableFilePath
                path={fmPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }
        return (
          <div className="event-details event-details-file-preview">
            <InlineImagePreview
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      if (fmPreviewKind === "video" && fmPath && workspacePath) {
        return (
          <div className="event-details event-details-file-preview">
            <InlineVideoPreview
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      if (
        fmPreviewKind === "html" &&
        fmPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fmPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <WebArtifactCard
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenWebArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fmPreviewKind === "spreadsheet" &&
        fmPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fmPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <SpreadsheetArtifactCard
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenSpreadsheetArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fmPreviewKind === "document" &&
        fmPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fmPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <DocumentArtifactCard
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenDocumentArtifact || onOpenViewer}
            />
          </div>
        );
      }

      if (
        fmPreviewKind === "presentation" &&
        fmPath &&
        workspacePath &&
        shouldRenderOpenArtifactCard(String(fmPath))
      ) {
        return (
          <div className="event-details event-details-file-preview">
            <PresentationArtifactCard
              filePath={fmPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenPresentationArtifact || onOpenViewer}
            />
          </div>
        );
      }

      // Edit diff preview
      if (
        fmPayload?.type === "edit" &&
        (fmPayload?.oldPreview || fmPayload?.newPreview)
      ) {
        const oldDiffPreview =
          typeof fmPayload.oldPreview === "string"
            ? normalizeCodeBlockTextForDisplay(fmPayload.oldPreview, "diff")
            : "";
        const newDiffPreview =
          typeof fmPayload.newPreview === "string"
            ? normalizeCodeBlockTextForDisplay(fmPayload.newPreview, "diff")
            : "";
        return (
          <div className="event-details event-details-scrollable event-details-code-preview">
            <div className="edit-diff-preview">
              {oldDiffPreview && (
                <div className="diff-line diff-removed">
                  <span className="diff-marker">-</span>
                  <pre>
                    <code>{oldDiffPreview}</code>
                  </pre>
                </div>
              )}
              {newDiffPreview && (
                <div className="diff-line diff-added">
                  <span className="diff-marker">+</span>
                  <pre>
                    <code>{newDiffPreview}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        );
      }

      // Rename info
      if (fmPayload?.action === "rename" && fmPayload?.from && fmPayload?.to) {
        return (
          <div className="event-details">
            <ClickableFilePath
              path={fmPayload.from}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
            {" → "}
            <ClickableFilePath
              path={fmPayload.to}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }

      return null;
    }
    case "artifact_created": {
      const artifactPath = event.payload?.path;
      if (typeof artifactPath === "string" && artifactPath.trim().length > 0) {
        const artifactContentPreview =
          typeof event.payload?.contentPreview === "string"
            ? event.payload.contentPreview
            : "";
        if (
          artifactContentPreview &&
          /\.jsonl$/i.test(artifactPath) &&
          parseJsonlPreview(artifactContentPreview)
        ) {
          return (
            <div className="event-details event-details-scrollable event-details-code-preview">
              <div className="code-preview-header">
                <span className="code-preview-language">jsonl</span>
                {event.payload?.previewTruncated ? (
                  <span className="code-preview-truncated">
                    preview truncated
                  </span>
                ) : null}
              </div>
              <JsonlPreview
                content={artifactContentPreview}
                truncated={Boolean(event.payload?.previewTruncated)}
              />
            </div>
          );
        }

        const latexPair = findLatexPdfPair([event]);
        const artifactPreviewKind = getInlinePreviewKindForGeneratedFile({
          path: artifactPath,
          mimeType: event.payload?.mimeType,
          type: event.payload?.type,
        });
        const artifactMimeType =
          typeof event.payload?.mimeType === "string"
            ? event.payload.mimeType.toLowerCase()
            : "";
        const artifactIsDocument =
          artifactMimeType === "application/pdf" ||
          artifactMimeType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          artifactMimeType === "text/markdown" ||
          artifactMimeType.startsWith("text/") ||
          DOCUMENT_PREVIEW_EXT_RE.test(String(artifactPath || ""));

        if (latexPair && workspacePath) {
          return (
            <div className="event-details event-details-file-preview">
              <LatexArtifactWorkbench
                sourcePath={latexPair.sourcePath}
                pdfPath={latexPair.pdfPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }

        if (artifactPreviewKind === "image" && workspacePath) {
          return (
            <div className="event-details event-details-file-preview">
              <InlineImagePreview
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }

        if (artifactPreviewKind === "video" && workspacePath) {
          return (
            <div className="event-details event-details-file-preview">
              <InlineVideoPreview
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }

        if (
          artifactPreviewKind === "html" &&
          workspacePath &&
          shouldRenderOpenArtifactCard(artifactPath)
        ) {
          return (
            <div className="event-details event-details-file-preview">
              <WebArtifactCard
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenWebArtifact || onOpenViewer}
              />
            </div>
          );
        }

        if (
          artifactPreviewKind === "spreadsheet" &&
          workspacePath &&
          shouldRenderOpenArtifactCard(artifactPath)
        ) {
          return (
            <div className="event-details event-details-file-preview">
              <SpreadsheetArtifactCard
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenSpreadsheetArtifact || onOpenViewer}
              />
            </div>
          );
        }

        if (
          artifactPreviewKind === "document" &&
          workspacePath &&
          shouldRenderOpenArtifactCard(artifactPath)
        ) {
          return (
            <div className="event-details event-details-file-preview">
              <DocumentArtifactCard
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenDocumentArtifact || onOpenViewer}
              />
            </div>
          );
        }

        if (
          artifactPreviewKind === "presentation" &&
          workspacePath &&
          shouldRenderOpenArtifactCard(artifactPath)
        ) {
          return (
            <div className="event-details event-details-file-preview">
              <PresentationArtifactCard
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenPresentationArtifact || onOpenViewer}
              />
            </div>
          );
        }

        if (artifactIsDocument && workspacePath) {
          return (
            <div className="event-details event-details-file-preview">
              <InlineDocumentPreview
                filePath={artifactPath}
                workspacePath={workspacePath}
                onOpenViewer={onOpenViewer}
              />
            </div>
          );
        }

        return (
          <div className="event-details">
            Saved artifact:{" "}
            <ClickableFilePath
              path={artifactPath}
              workspacePath={workspacePath}
              onOpenViewer={onOpenViewer}
            />
          </div>
        );
      }
      return null;
    }
    case "error":
      return (
        <div className="event-details event-details-failure">
          {localizeErrorText(
            formatProviderErrorForDisplay(
              String(event.payload.error || event.payload.message || ""),
              { task: taskForEvent },
            ),
          )}
        </div>
      );
    default:
      return null;
  }
}
