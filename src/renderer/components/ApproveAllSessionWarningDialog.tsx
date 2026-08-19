import { ShieldAlert } from "lucide-react";
import { translate, useLanguage } from "../i18n";

interface ApproveAllSessionWarningDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirms enabling task-wide auto-approve. */
export function ApproveAllSessionWarningDialog({
  onConfirm,
  onCancel,
}: ApproveAllSessionWarningDialogProps) {
  useLanguage();
  const t = translate;
  return (
    <div
      className="session-approval-overlay session-approval-overlay--warning-layer"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="approve-all-warning-title"
      aria-describedby="approve-all-warning-desc"
    >
      <div className="session-approval-card session-approval-card--warning">
        <div className="approve-all-warning-header">
          <div className="approve-all-warning-icon" aria-hidden="true">
            <ShieldAlert size={22} strokeWidth={1.8} />
          </div>
          <div className="approve-all-warning-copy">
            <h3
              id="approve-all-warning-title"
              className="session-approval-title"
            >
              {t(
                "approveAllWarning.title",
                "Enable auto-approve for this task?",
              )}
            </h3>
            <p
              id="approve-all-warning-desc"
              className="session-approval-prompt"
            >
              {t(
                "approveAllWarning.description",
                "Future permission requests will run without asking again. Only enable this when you trust the task content.",
              )}
            </p>
          </div>
        </div>

        <div className="approve-all-warning-scope">
          <span>{t("approveAllWarning.scopeLabel", "Applies to")}</span>
          <div>
            <strong>
              {t("approveAllWarning.scopeValue", "Current task only")}
            </strong>
            <small>
              {t(
                "approveAllWarning.scopeDescription",
                "Confirmation prompts return when the task ends.",
              )}
            </small>
          </div>
        </div>

        <div className="session-approval-actions session-approval-actions--warning">
          <button
            type="button"
            className="session-approval-btn-deny"
            onClick={onCancel}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="session-approval-btn-auto-approve"
            onClick={onConfirm}
          >
            {t("approveAllWarning.confirm", "Enable auto-approve")}
          </button>
        </div>
      </div>
    </div>
  );
}
