import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { translate, useLanguage } from "../i18n";
import "./automation-confirm-dialog.css";

export type AutomationConfirmationKind = "delete" | "clearHistory";

export function AutomationConfirmDialog({
  kind,
  name,
  onConfirm,
  onCancel,
}: {
  kind: AutomationConfirmationKind;
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const resolved = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const finish = (accepted: boolean) => {
    if (resolved.current) return;
    resolved.current = true;
    (accepted ? onConfirm : onCancel)();
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="automation-confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
    >
      <h2 id={titleId}>{translate(`scheduled.confirm.${kind}.title`, undefined, { name })}</h2>
      <p id={descriptionId}>{translate(`scheduled.confirm.${kind}.description`)}</p>
      <div className="automation-confirm-actions">
        <button type="button" autoFocus onClick={() => finish(false)}>
          {translate("common.cancel", "Cancel")}
        </button>
        <button
          type="button"
          className="automation-confirm-destructive"
          onClick={() => finish(true)}
        >
          {translate(`scheduled.confirm.${kind}.action`)}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
