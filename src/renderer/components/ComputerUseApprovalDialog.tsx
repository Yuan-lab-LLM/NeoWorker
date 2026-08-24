import type { ApprovalRequest } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

function formatAccessLevel(level: unknown): string {
  if (level === "full_control")
    return translate(
      "computerUseApproval.access.fullControl",
      "Full control (click, type, keys)",
    );
  if (level === "click_only")
    return translate(
      "computerUseApproval.access.clickOnly",
      "Click only (no typing)",
    );
  if (level === "view_only")
    return translate(
      "computerUseApproval.access.viewOnly",
      "View only (screenshot & hover)",
    );
  return String(level ?? translate("common.unknown", "unknown"));
}

export function isComputerUseAppGrantApproval(
  approval: ApprovalRequest,
): boolean {
  return (
    approval.type === "computer_use" &&
    approval.details &&
    typeof approval.details === "object" &&
    (approval.details as { kind?: string }).kind === "computer_use_app_grant"
  );
}

interface ComputerUseApprovalDialogProps {
  approval: ApprovalRequest;
  onAllowSession: () => void;
  onDeny: () => void;
  responding?: boolean;
}

export function ComputerUseApprovalDialog({
  approval,
  onAllowSession,
  onDeny,
  responding = false,
}: ComputerUseApprovalDialogProps) {
  useLanguage();
  const t = translate;
  if (!isComputerUseAppGrantApproval(approval)) {
    return null;
  }
  const details =
    approval.details && typeof approval.details === "object"
      ? approval.details
      : {};
  const d = details as {
    appName?: string;
    bundleId?: string;
    requestedLevel?: string;
    reason?: string;
    riskClass?: string;
    sentinelWarning?: string;
  };

  return (
    <div
      className="session-approval-overlay"
      role="dialog"
      aria-modal="true"
      aria-busy={responding || undefined}
    >
      <div className="session-approval-card session-approval-card--computer-use">
        <div className="session-approval-icon" aria-hidden="true">
          🖥️
        </div>

        <div className="session-approval-body">
          <h3 className="session-approval-title">
            {t("computerUseApproval.title", "Computer use — app access")}
          </h3>
          <p className="session-approval-prompt">{approval.description}</p>

          <dl className="session-approval-details">
            {d.appName ? (
              <>
                <dt>{t("computerUseApproval.app", "App")}</dt>
                <dd>{d.appName}</dd>
              </>
            ) : null}
            {d.bundleId ? (
              <>
                <dt>Bundle ID</dt>
                <dd>
                  <code className="session-approval-code">{d.bundleId}</code>
                </dd>
              </>
            ) : null}
            {d.requestedLevel ? (
              <>
                <dt>
                  {t("computerUseApproval.requestedAccess", "Requested access")}
                </dt>
                <dd>{formatAccessLevel(d.requestedLevel)}</dd>
              </>
            ) : null}
            {d.riskClass ? (
              <>
                <dt>{t("computerUseApproval.category", "Category")}</dt>
                <dd>{d.riskClass.replace(/_/g, " ")}</dd>
              </>
            ) : null}
            {d.reason ? (
              <>
                <dt>{t("computerUseApproval.why", "Why")}</dt>
                <dd>{d.reason}</dd>
              </>
            ) : null}
          </dl>

          {d.sentinelWarning ? (
            <p className="session-approval-sentinel-warning">
              {d.sentinelWarning}
            </p>
          ) : null}

          <p className="session-approval-footer-hint session-approval-footer-hint--center">
            {t(
              "computerUseApproval.sessionGrantPrefix",
              "Grants apply only for this computer-use session. Press",
            )}{" "}
            <kbd className="session-approval-kbd">Esc</kbd>{" "}
            {t(
              "computerUseApproval.sessionGrantSuffix",
              "during control to stop.",
            )}
          </p>
        </div>

        <div className="session-approval-actions">
          {responding ? (
            <span className="session-approval-submitting" role="status">
              {t(
                "approval.action.submitting",
                "Submitting approval decision…",
              )}
            </span>
          ) : null}
          <button
            type="button"
            className="session-approval-btn-deny"
            disabled={responding}
            onClick={onDeny}
          >
            {t("common.deny", "Deny")}
          </button>
          <button
            type="button"
            className="session-approval-btn-allow"
            disabled={responding}
            onClick={onAllowSession}
          >
            {t("computerUseApproval.allowSession", "Allow for this session")}
          </button>
        </div>
      </div>
    </div>
  );
}
