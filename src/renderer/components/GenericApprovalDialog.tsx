import { Fragment, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  AppWindow,
  ChevronDown,
  FilePenLine,
  Globe2,
  Keyboard,
  Link2,
  MapPin,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  ApprovalRequest,
  ApprovalResponseAction,
  ApprovalType,
  PermissionPromptDetails,
} from "../../shared/types";
import { buildApprovalCommandPreview } from "../../shared/approval-command-preview";
import { translate, useLanguage } from "../i18n";

type ScopeKey = "once" | "session" | "workspace" | "profile";

interface ScopePair {
  scope: ScopeKey;
  denyAction: ApprovalResponseAction;
  allowAction: ApprovalResponseAction;
}

const SCOPE_ORDER: ScopeKey[] = ["once", "session", "workspace", "profile"];

function extractScopePairs(
  actions: { action: ApprovalResponseAction; label: string }[],
): ScopePair[] | null {
  const actionSet = new Set(actions.map((a) => a.action));
  const pairs: ScopePair[] = [];

  for (const scope of SCOPE_ORDER) {
    const allow = `allow_${scope}` as ApprovalResponseAction;
    const deny = `deny_${scope}` as ApprovalResponseAction;
    if (actionSet.has(allow) || actionSet.has(deny)) {
      pairs.push({
        scope,
        allowAction: allow,
        denyAction: deny,
      });
    }
  }

  return pairs.length >= 2 ? pairs : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readParamString(
  details: Record<string, unknown>,
  key: string,
): string | null {
  return readString(details, key) ?? readString(asRecord(details.params), key);
}

function toolNameForDetails(details: Record<string, unknown>): string | null {
  return readString(details, "tool");
}

function formatApprovalTypeLabel(
  type: ApprovalType,
  toolName?: string | null,
): string {
  switch (toolName) {
    case "open_application":
    case "open_url":
    case "open_path":
    case "show_in_folder":
      return translate("approval.type.systemAction", "system action");
    default:
      return translate(`approval.type.${type}`, type.replace(/_/g, " "));
  }
}

function titleForApproval(
  type: ApprovalType,
  toolName?: string | null,
): string {
  switch (toolName) {
    case "write_file":
      return translate("approval.title.writeFile", "Write file");
    case "edit_file":
      return translate("approval.title.editFile", "Edit file");
    case "open_application":
      return translate("approval.title.openApplication", "Open application");
    case "open_url":
      return translate("approval.title.openUrl", "Open URL");
    case "open_path":
      return translate("approval.title.openPath", "Open path");
    case "show_in_folder":
      return translate("approval.title.showInFinder", "Show in Finder");
    default:
      return titleForType(type);
  }
}

function descriptionForApproval(
  description: string,
  toolName?: string | null,
  appName?: string | null,
  type?: ApprovalType,
  targetPath?: string | null,
): string {
  if (isSingleTaskBundleDescription(description)) {
    return translate(
      "approval.description.singleTaskBundle",
      "NeoWorker needs to run a local command to continue this task. Once allowed, later safe commands in this task can continue.",
    );
  }
  if (type === "delete_file") {
    const targetName = targetPath ? fileNameFromPath(targetPath) : null;
    return targetName
      ? translate(
          "approval.description.deleteFileNamed",
          "NeoWorker wants to delete {name}. Review the target before continuing.",
          { name: targetName },
        )
      : translate(
          "approval.description.deleteFile",
          "NeoWorker wants to delete a file. Review the target before continuing.",
        );
  }
  if (type === "delete_multiple") {
    return translate(
      "approval.description.deleteMultiple",
      "NeoWorker wants to delete multiple items. Review the scope before continuing.",
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
  if (
    toolName === "open_application" &&
    /^Approve tool call:\s*open_application\b/i.test(description)
  ) {
    return appName
      ? translate(
          "approval.description.openAppNamed",
          "Allow NeoWorker to open {app}?",
          { app: appName },
        )
      : translate(
          "approval.description.openApp",
          "Allow NeoWorker to open an application?",
        );
  }
  if (/^Approve tool call:\s*[a-z0-9_-]+\s*$/i.test(description)) {
    if (
      toolName === "http_request" ||
      toolName === "web_fetch" ||
      toolName === "web_search"
    ) {
      return translate(
        "approval.description.networkTool",
        "NeoWorker needs network access to continue this task.",
      );
    }
    return translate(
      "approval.description.toolCall",
      "NeoWorker needs to use {tool} to continue this task.",
      {
        tool:
          toolName || translate("approval.type.systemAction", "system action"),
      },
    );
  }
  return description;
}

function isSingleTaskBundleDescription(description: string): boolean {
  return /^Single approval bundle for this task:\s*subsequent safe commands may run without another prompt until you deny or the task ends\.?$/i.test(
    description,
  );
}

function fileNameFromPath(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.split("/").pop() || targetPath;
}

function isDestructiveApproval(type: ApprovalType): boolean {
  return type === "delete_file" || type === "delete_multiple";
}

function formatScopePreview(scopePreview: string, type: ApprovalType): string {
  if (type === "delete_file" && /^delete_file on path\b/i.test(scopePreview)) {
    return translate("approval.scopePreview.singleFile", "Only this file");
  }
  if (type === "delete_multiple") {
    return translate(
      "approval.scopePreview.multipleItems",
      "Only the listed items",
    );
  }
  return scopePreview;
}

function formatReasonSummary(summary: string, type: ApprovalType): string {
  if (
    /^Dangerous-only mode prompts only for destructive, high-risk, or ambiguous external actions\.?$/i.test(
      summary,
    )
  ) {
    if (type === "run_command") {
      return translate(
        "approval.reason.commandConfirmation",
        "This command needs confirmation before it can run.",
      );
    }
    return translate(
      "approval.reason.destructiveAction",
      "This is a destructive operation and requires your explicit confirmation.",
    );
  }
  return summary;
}

function titleForType(type: ApprovalType): string {
  switch (type) {
    case "run_command":
      return translate("approval.title.runCommand", "Shell command");
    case "delete_file":
      return translate("approval.title.deleteFile", "Delete file");
    case "delete_multiple":
      return translate(
        "approval.title.deleteMultiple",
        "Delete multiple items",
      );
    case "bulk_rename":
      return translate("approval.title.bulkRename", "Bulk rename");
    case "network_access":
      return translate("approval.title.networkAccess", "Network access");
    case "external_service":
      return translate("approval.title.externalService", "External service");
    case "location_access":
      return translate("approval.title.locationAccess", "Location access");
    case "risk_gate":
      return translate("approval.title.riskGate", "Risk review");
    case "computer_use":
      return translate("approval.title.computerUse", "Computer use");
    default:
      return translate("approval.title.default", "Action approval");
  }
}

function iconForType(type: ApprovalType): ReactNode {
  switch (type) {
    case "delete_file":
    case "delete_multiple":
      return <Trash2 size={23} strokeWidth={1.9} />;
    case "bulk_rename":
      return <FilePenLine size={23} strokeWidth={1.9} />;
    case "network_access":
      return <Globe2 size={23} strokeWidth={1.9} />;
    case "external_service":
      return <Link2 size={23} strokeWidth={1.9} />;
    case "location_access":
      return <MapPin size={23} strokeWidth={1.9} />;
    case "run_command":
      return <Keyboard size={23} strokeWidth={1.9} />;
    default:
      return <AppWindow size={23} strokeWidth={1.9} />;
  }
}

interface GenericApprovalDialogProps {
  approval: ApprovalRequest;
  onRespond: (action: ApprovalResponseAction) => void;
  onApproveAllSession?: () => void;
  responding?: boolean;
}

export function GenericApprovalDialog({
  approval,
  onRespond,
  responding = false,
}: GenericApprovalDialogProps) {
  useLanguage();
  const t = translate;
  const [rememberForTask, setRememberForTask] = useState(false);
  const details =
    approval.details &&
    typeof approval.details === "object" &&
    !Array.isArray(approval.details)
      ? (approval.details as Record<string, unknown>)
      : {};
  const toolName = toolNameForDetails(details);
  const command = typeof details.command === "string" ? details.command : null;
  const commandPreview = command ? buildApprovalCommandPreview(command) : null;
  const cwd = typeof details.cwd === "string" ? details.cwd : null;
  const timeoutMs =
    typeof details.timeout === "number" && Number.isFinite(details.timeout)
      ? details.timeout
      : null;
  const bundleScope =
    typeof details.bundleScope === "string" ? details.bundleScope : null;
  const path = readParamString(details, "path");
  const url = readParamString(details, "url");
  const permissionPrompt =
    details.permissionPrompt && typeof details.permissionPrompt === "object"
      ? (details.permissionPrompt as PermissionPromptDetails)
      : null;
  const appName = readParamString(details, "appName");
  const isDestructive = isDestructiveApproval(approval.type);
  const isFileMutation = toolName === "write_file" || toolName === "edit_file";
  const description = descriptionForApproval(
    approval.description,
    toolName,
    appName,
    approval.type,
    path,
  );
  const targetName = path ? fileNameFromPath(path) : null;

  const rows: { label: string; value: ReactNode }[] = [];

  if (!isDestructive && !isFileMutation) {
    rows.push({
      label: t("computerUseApproval.category", "Category"),
      value: formatApprovalTypeLabel(approval.type, toolName),
    });
  }

  if (toolName) {
    rows.push({
      label: t("approval.row.tool", "Tool"),
      value: <code className="session-approval-code">{toolName}</code>,
    });
  }

  if (toolName === "open_application") {
    if (appName) {
      rows.push({
        label: t("approval.row.application", "Application"),
        value: <code className="session-approval-code">{appName}</code>,
      });
    }
    rows.push({
      label: t("approval.row.whatHappens", "What happens"),
      value: appName
        ? t(
            "approval.whatHappens.openAppNamed",
            "NeoWorker launches {app} on this computer. It may open or focus a window outside the workspace.",
            { app: appName },
          )
        : t(
            "approval.whatHappens.openApp",
            "NeoWorker launches an application on this computer. It may open or focus a window outside the workspace.",
          ),
    });
  }

  if (command) {
    rows.push({
      label: t("approval.row.command", "Command"),
      value: (
        <>
          <div
            className="session-approval-code-scroll"
            role="region"
            aria-label={t("approval.commandToApprove", "Command to approve")}
          >
            <code className="session-approval-code session-approval-code--multiline">
              {commandPreview?.text ?? command}
            </code>
          </div>
          {commandPreview?.truncated ? (
            <p className="session-approval-preview-note">
              {t(
                "approval.previewCondensed",
                "Preview condensed for readability. Approval still applies to the full command.",
              )}
            </p>
          ) : null}
        </>
      ),
    });
  }
  if (cwd) {
    rows.push({
      label: t("approval.row.workingDirectory", "Working directory"),
      value: <code className="session-approval-code">{cwd}</code>,
    });
  }
  if (timeoutMs !== null) {
    rows.push({
      label: t("approval.row.timeout", "Timeout"),
      value: `${Math.max(1, Math.round(timeoutMs / 1000))}s`,
    });
  }
  if (bundleScope) {
    rows.push({
      label: t("approval.row.bundle", "Bundle"),
      value:
        bundleScope === "safe commands in this task"
          ? t(
              "approval.bundle.safeCommandsInTask",
              "Safe commands in this task",
            )
          : bundleScope.replace(/_/g, " "),
    });
  }
  if (path && !isDestructive) {
    rows.push({
      label: t("approval.row.path", "Path"),
      value: <code className="session-approval-code">{path}</code>,
    });
  }
  if (url) {
    rows.push({
      label: "URL",
      value: <code className="session-approval-code">{url}</code>,
    });
  }
  if (permissionPrompt?.scopePreview && !command) {
    rows.push({
      label: t("approval.row.scope", "Scope"),
      value: formatScopePreview(permissionPrompt.scopePreview, approval.type),
    });
  }
  if (permissionPrompt?.reason?.summary) {
    rows.push({
      label: t("approval.row.reason", "Reason"),
      value: formatReasonSummary(
        permissionPrompt.reason.summary,
        approval.type,
      ),
    });
  }

  const suggestedActions = permissionPrompt?.suggestedActions?.length
    ? permissionPrompt.suggestedActions
    : [
        {
          action: "deny_once" as const,
          label: t("approval.action.denyOnce", "Deny once"),
        },
        {
          action: "allow_once" as const,
          label: t("approval.action.allowOnce", "Allow once"),
        },
      ];

  const scopePairs = extractScopePairs(suggestedActions);
  const oncePair =
    scopePairs?.find((pair) => pair.scope === "once") ?? scopePairs?.[0];
  const sessionPair = isDestructive
    ? undefined
    : scopePairs?.find((pair) => pair.scope === "session");
  const activePair = rememberForTask && sessionPair ? sessionPair : oncePair;
  const denyAction = oncePair?.denyAction ?? activePair?.denyAction;

  return (
    <div
      className="session-approval-overlay"
      role="dialog"
      aria-modal="true"
      aria-busy={responding || undefined}
      aria-labelledby="generic-approval-title"
      aria-describedby="generic-approval-description"
    >
      <div
        className={[
          "session-approval-card",
          "session-approval-card--generic",
          commandPreview ? "session-approval-card--command" : "",
          isDestructive ? "session-approval-card--danger" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <header className="session-approval-header">
          <div className="session-approval-icon-wrap" aria-hidden="true">
            <span className="session-approval-icon">
              {iconForType(approval.type)}
            </span>
          </div>
          <div className="session-approval-heading">
            <h3 id="generic-approval-title" className="session-approval-title">
              {titleForApproval(approval.type, toolName)}
            </h3>
          </div>
        </header>
        <div className="session-approval-body session-approval-body--generic">
          <p
            id="generic-approval-description"
            className="session-approval-prompt"
          >
            {description}
          </p>

          {isDestructive && path ? (
            <section
              className="session-approval-target"
              aria-label={t("approval.targetFile", "Target file")}
            >
              <span>{t("approval.targetFile", "Target file")}</span>
              <strong title={path}>{targetName}</strong>
              <code title={path}>{path}</code>
            </section>
          ) : null}

          {isFileMutation && path ? (
            <section
              className="session-approval-file-target"
              aria-label={t("approval.fileTarget", "File to create or update")}
            >
              <FilePenLine size={18} aria-hidden="true" />
              <span>
                <small>
                  {t("approval.fileTarget", "File to create or update")}
                </small>
                <strong title={path}>{targetName}</strong>
              </span>
            </section>
          ) : null}

          {isDestructive ? (
            <div className="session-approval-risk-note" role="note">
              <AlertTriangle size={18} aria-hidden="true" />
              <div>
                <strong>
                  {t(
                    "approval.risk.destructiveTitle",
                    "This action cannot be undone",
                  )}
                </strong>
                <span>
                  {t(
                    "approval.risk.destructiveDescription",
                    "Confirm the target and permission scope before allowing the deletion.",
                  )}
                </span>
              </div>
            </div>
          ) : null}

          {rows.length > 0 ? (
            <details className="session-approval-disclosure session-approval-technical-disclosure">
              <summary>
                <span>
                  {command
                    ? t("approval.commandDetails", "View command details")
                    : t("approval.technicalDetails", "View technical details")}
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <section
                className="session-approval-details-section"
                aria-label={t("approval.details", "Action details")}
              >
                <dl className="session-approval-details">
                  {rows.map((row) => (
                    <Fragment key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            </details>
          ) : null}

          {scopePairs ? (
            <section
              className="session-approval-scope-section session-approval-scope-section--simple"
              aria-label={t("approval.permissionScope", "Permission scope")}
            >
              <p className="session-approval-scope-help">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  {t(
                    "approval.scopeOnceDescription",
                    "Recommended: allow only this request. NeoWorker will ask again next time.",
                  )}
                </span>
              </p>
              {sessionPair ? (
                <label className="session-approval-remember-choice">
                  <input
                    type="checkbox"
                    checked={rememberForTask}
                    disabled={responding}
                    onChange={(event) =>
                      setRememberForTask(event.target.checked)
                    }
                  />
                  <span>
                    <strong>
                      {t("approval.rememberForTask", "Remember for this task")}
                    </strong>
                    <small>
                      {t(
                        "approval.rememberForTaskDescription",
                        "Similar actions in this task will continue without asking. This resets when the task ends.",
                      )}
                    </small>
                  </span>
                </label>
              ) : null}
            </section>
          ) : null}
        </div>

        <footer className="session-approval-footer">
          {responding ? (
            <p className="session-approval-submitting" role="status">
              {t(
                "approval.action.submitting",
                "Submitting approval decision…",
              )}
            </p>
          ) : null}
          {scopePairs ? (
            <div className="session-approval-actions session-approval-actions--scoped">
              <button
                type="button"
                className="session-approval-btn-deny"
                disabled={responding}
                onClick={() => denyAction && onRespond(denyAction)}
              >
                {isDestructive
                  ? t("common.cancel", "Cancel")
                  : t("common.deny", "Deny")}
              </button>
              <button
                type="button"
                className={
                  isDestructive
                    ? "session-approval-btn-allow session-approval-btn-allow--danger"
                    : "session-approval-btn-allow"
                }
                disabled={responding}
                onClick={() => activePair && onRespond(activePair.allowAction)}
              >
                {isDestructive
                  ? t("approval.action.allowDelete", "Allow deletion")
                  : rememberForTask && sessionPair
                    ? t(
                        "approval.action.allowForTask",
                        "Allow and remember for this task",
                      )
                    : t("approval.action.allowOnceContinue", "Allow this time")}
              </button>
            </div>
          ) : (
            <div className="session-approval-actions">
              {suggestedActions.map((action) => (
                <button
                  key={action.action}
                  type="button"
                  className={
                    action.action.startsWith("allow_")
                      ? "session-approval-btn-allow"
                      : "session-approval-btn-deny"
                  }
                  disabled={responding}
                  onClick={() => onRespond(action.action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
