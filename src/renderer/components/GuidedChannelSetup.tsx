import type { CSSProperties, ReactNode } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import type { SecurityMode } from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import { NeoWorkerSelectMenu } from "./NeoWorkerSelectMenu";
import "./guided-channel-setup.css";

export interface GuidedChannelStep {
  title: string;
  description: string;
}

interface GuidedChannelResult {
  success: boolean;
  message?: string;
}

interface GuidedChannelSetupProps {
  accent: string;
  brand: string;
  brandIcon: ReactNode;
  title: string;
  description: string;
  steps: GuidedChannelStep[];
  portalLabel: string;
  onOpenPortal: () => void;
  formTitle: string;
  formDescription: string;
  children: ReactNode;
  advanced?: ReactNode;
  securityMode: SecurityMode;
  onSecurityModeChange: (mode: SecurityMode) => void;
  submitLabel: string;
  busyLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  footerNote: string;
  result?: GuidedChannelResult | null;
}

export function GuidedChannelSetup({
  accent,
  brand,
  brandIcon,
  title,
  description,
  steps,
  portalLabel,
  onOpenPortal,
  formTitle,
  formDescription,
  children,
  advanced,
  securityMode,
  onSecurityModeChange,
  submitLabel,
  busyLabel,
  onSubmit,
  submitting = false,
  disabled = false,
  footerNote,
  result,
}: GuidedChannelSetupProps) {
  useLanguage();
  const t = translate;
  const securityOptions = [
    {
      value: "pairing",
      label: t("channels.security.pairingRequiredShort", "Pairing required"),
      description: t(
        "channels.guided.security.pairingDescription",
        "New contacts need a one-time code before they can use the assistant.",
      ),
      badge: t("channels.guided.recommended", "Recommended"),
    },
    {
      value: "allowlist",
      label: t("channels.security.allowlistOnly", "Allowlist only"),
      description: t(
        "channels.guided.security.allowlistDescription",
        "Only contacts you have already approved can send tasks.",
      ),
    },
    {
      value: "open",
      label: t("channels.security.openAccess", "Open access"),
      description: t(
        "channels.guided.security.openDescription",
        "Anyone who can reach the bot can use it.",
      ),
    },
  ];

  return (
    <div
      className="guided-channel-setup"
      style={{ "--guided-channel-accent": accent } as CSSProperties}
    >
      <section className="guided-channel-shell">
        <aside className="guided-channel-guide">
          <div className="guided-channel-brand">
            <span className="guided-channel-brand-icon" aria-hidden="true">
              {brandIcon}
            </span>
            <span>{brand}</span>
          </div>

          <div className="guided-channel-intro">
            <h3>{title}</h3>
            <p>{description}</p>
          </div>

          <ol className="guided-channel-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="guided-channel-step-index">{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            className="guided-channel-portal"
            onClick={onOpenPortal}
          >
            <ExternalLink size={15} aria-hidden="true" />
            {portalLabel}
          </button>
        </aside>

        <div className="guided-channel-form">
          <div className="guided-channel-form-heading">
            <div>
              <span>
                {t("channels.guided.accountInfo", "Account information")}
              </span>
              <h4>{formTitle}</h4>
              <p>{formDescription}</p>
            </div>
            <small>
              {t("channels.guided.requiredHint", "Required fields only")}
            </small>
          </div>

          <div className="guided-channel-fields">{children}</div>

          <div className="guided-channel-security">
            <span className="guided-channel-security-icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div className="guided-channel-security-copy">
              <strong>{t("channels.accessControl", "Access control")}</strong>
              <small>
                {t(
                  "channels.guided.securityDescription",
                  "Choose who can send tasks to NeoWorker after the connection is ready.",
                )}
              </small>
            </div>
            <NeoWorkerSelectMenu
              ariaLabel={t(
                "channels.guided.securityAria",
                "Choose who can use this channel",
              )}
              className="guided-channel-security-menu"
              icon={<ShieldCheck size={15} />}
              minMenuWidth={300}
              onValueChange={(value) =>
                onSecurityModeChange(value as SecurityMode)
              }
              options={securityOptions}
              value={securityMode}
            />
          </div>

          {advanced ? (
            <details className="guided-channel-advanced">
              <summary>
                <span className="guided-channel-advanced-title">
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  <span>
                    <strong>
                      {t("channels.guided.advanced", "Advanced settings")}
                    </strong>
                    <small>
                      {t(
                        "channels.guided.advancedHint",
                        "The defaults work for most people",
                      )}
                    </small>
                  </span>
                </span>
                <ChevronDown
                  className="guided-channel-advanced-chevron"
                  size={15}
                  aria-hidden="true"
                />
              </summary>
              <div className="guided-channel-advanced-grid">{advanced}</div>
            </details>
          ) : null}

          {result ? (
            <div
              className={`guided-channel-result ${result.success ? "success" : "error"}`}
              role={result.success ? "status" : "alert"}
            >
              {result.success ? (
                <CircleCheck size={16} aria-hidden="true" />
              ) : (
                <CircleAlert size={16} aria-hidden="true" />
              )}
              <span>{result.message}</span>
            </div>
          ) : null}

          <div className="guided-channel-submit-row">
            <span>
              <Check size={14} aria-hidden="true" />
              {footerNote}
            </span>
            <button
              type="button"
              className="guided-channel-submit"
              onClick={onSubmit}
              disabled={disabled || submitting}
            >
              {submitting ? busyLabel : submitLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
