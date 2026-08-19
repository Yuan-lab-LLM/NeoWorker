import { useState, useEffect, useCallback } from "react";
import { FileText, X } from "lucide-react";
import { translate, useLanguage } from "../../i18n";
import {
  buildGenericLegalWorkflowFollowUp,
  buildGenericLegalWorkflowInitialValues,
  buildLegalDemandIntakeFollowUp,
  buildLegalDemandIntakeInitialValues,
  type GenericLegalWorkflowFormValues,
  type LegalDemandIntakeFormValues,
  type LegalWorkflowInvocation,
} from "../../utils/legal-demand-intake";

const LEGAL_DEMAND_TYPE_OPTIONS = [
  {
    value: "payment",
    title: "Payment demand",
    description: "Overdue invoice / liquidated debt",
    titleKey: "legal.demand.type.payment",
    descriptionKey: "legal.demand.type.paymentDesc",
  },
  {
    value: "breach-cure",
    title: "Breach / notice to cure",
    description: "Contract default with cure window",
    titleKey: "legal.demand.type.breachCure",
    descriptionKey: "legal.demand.type.breachCureDesc",
  },
  {
    value: "cease-desist",
    title: "Cease and desist",
    description: "Stop infringing or tortious activity",
    titleKey: "legal.demand.type.ceaseDesist",
    descriptionKey: "legal.demand.type.ceaseDesistDesc",
  },
  {
    value: "employment-separation",
    title: "Employment / separation",
    description: "Restrictive covenant, severance",
    titleKey: "legal.demand.type.employment",
    descriptionKey: "legal.demand.type.employmentDesc",
  },
  {
    value: "preservation",
    title: "Preservation",
    description: "Hold-evidence notice",
    titleKey: "legal.demand.type.preservation",
    descriptionKey: "legal.demand.type.preservationDesc",
  },
  {
    value: "other",
    title: "Other",
    description: "Tell me more in the facts",
    titleKey: "legal.demand.type.other",
    descriptionKey: "legal.demand.type.otherDesc",
  },
];

const LEGAL_DEMAND_TONE_OPTIONS = ["measured", "assertive", "aggressive"];
const LEGAL_DEMAND_RESPONSE_WINDOWS = [
  "7 days",
  "14 days",
  "21 days",
  "30 days",
  "Per contract / other",
];
const LEGAL_DEMAND_MARKINGS = [
  "None",
  "Without prejudice",
  "Without prejudice save as to costs",
  "Not sure - flag for review",
];

export function LegalDemandIntakePromptCard({
  prompt,
  onSubmit,
  onDismiss,
}: {
  prompt: string;
  onSubmit: (message: string) => void;
  onDismiss: () => void;
}) {
  useLanguage();
  const t = translate;
  const [values, setValues] = useState<LegalDemandIntakeFormValues>(() =>
    buildLegalDemandIntakeInitialValues(prompt),
  );

  useEffect(() => {
    setValues(buildLegalDemandIntakeInitialValues(prompt));
  }, [prompt]);

  const updateValue = useCallback(
    (field: keyof LegalDemandIntakeFormValues, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const renderChip = (
    field: keyof LegalDemandIntakeFormValues,
    value: string,
    label = value,
  ) => (
    <button
      key={`${field}-${value}`}
      type="button"
      className={`legal-intake-chip ${values[field] === value ? "selected" : ""}`}
      onClick={() => updateValue(field, value)}
    >
      {label}
    </button>
  );

  const renderTextarea = (
    field: keyof LegalDemandIntakeFormValues,
    placeholder: string,
    rows = 3,
  ) => (
    <textarea
      className="legal-intake-textarea"
      rows={rows}
      value={String(values[field] || "")}
      placeholder={placeholder}
      onChange={(event) => updateValue(field, event.target.value)}
    />
  );

  const canSubmit = values.title.trim().length > 0;

  return (
    <section
      className="legal-intake-card"
      aria-label={t("legal.demand.title", "Demand letter details")}
    >
      <header className="legal-intake-card-header">
        <div className="legal-intake-card-title">
          <FileText size={18} aria-hidden="true" />
          <span>{t("legal.demand.title", "Demand letter details")}</span>
        </div>
        <button
          type="button"
          className="legal-intake-dismiss"
          onClick={onDismiss}
          aria-label={t("legal.demand.dismiss", "Dismiss demand intake form")}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="legal-intake-card-body">
        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.demand.shortTitle", "Short title for this matter")}
          </span>
          {renderTextarea(
            "title",
            t(
              "legal.demand.shortTitlePlaceholder",
              "e.g. Unpaid invoices - Acme Logistics",
            ),
            2,
          )}
        </label>

        <div className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.demand.kind", "What kind of demand is this?")}</span>
          <div className="legal-intake-type-grid">
            {LEGAL_DEMAND_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`legal-intake-type-option ${values.demandType === option.value ? "selected" : ""}`}
                onClick={() => updateValue("demandType", option.value)}
              >
                <span className="legal-intake-type-title">
                  {t(option.titleKey, option.title)}
                </span>
                <span className="legal-intake-type-description">
                  {t(option.descriptionKey, option.description)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="legal-intake-field">
          <span>{t("legal.demand.sender", "Sender")}</span>
          <input
            className="legal-intake-input"
            value={values.sender}
            placeholder={t(
              "legal.demand.senderPlaceholder",
              "Our company / client",
            )}
            onChange={(event) => updateValue("sender", event.target.value)}
          />
        </label>

        <label className="legal-intake-field">
          <span>{t("legal.demand.recipient", "Recipient")}</span>
          <input
            className="legal-intake-input"
            value={values.recipient}
            placeholder={t(
              "legal.demand.recipientPlaceholder",
              "Counterparty, entity, address",
            )}
            onChange={(event) => updateValue("recipient", event.target.value)}
          />
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.demand.relationship", "Relationship / audience")}
          </span>
          <input
            className="legal-intake-input"
            value={values.relationship}
            placeholder={t(
              "legal.demand.relationshipPlaceholder",
              "Customer, vendor, ex-employee, competitor; GC, CEO, counsel, individual",
            )}
            onChange={(event) =>
              updateValue("relationship", event.target.value)
            }
          />
        </label>

        <div className="legal-intake-field legal-intake-field-full">
          <span>
            {t(
              "legal.demand.toneQuestion",
              "What tone should the letter strike?",
            )}
          </span>
          <div className="legal-intake-chip-row">
            {LEGAL_DEMAND_TONE_OPTIONS.map((tone) =>
              renderChip(
                "tone",
                tone,
                t(
                  `legal.demand.tone.${tone}`,
                  tone[0].toUpperCase() + tone.slice(1),
                ),
              ),
            )}
          </div>
          {renderTextarea(
            "toneRationale",
            t(
              "legal.demand.toneRationalePlaceholder",
              "One-line rationale - relationship, amount, litigation likelihood",
            ),
            2,
          )}
        </div>

        <div className="legal-intake-field legal-intake-field-full">
          <span>
            {t(
              "legal.demand.responseWindow",
              "How long do they get to respond or comply?",
            )}
          </span>
          <div className="legal-intake-chip-row">
            {LEGAL_DEMAND_RESPONSE_WINDOWS.map((window) =>
              renderChip(
                "responseWindow",
                window,
                t(`legal.demand.response.${window}`, window),
              ),
            )}
          </div>
        </div>

        <div className="legal-intake-field legal-intake-field-full">
          <span>
            {t(
              "legal.demand.settlementMarking",
              "Settlement-communication marking",
            )}
          </span>
          <div className="legal-intake-chip-row">
            {LEGAL_DEMAND_MARKINGS.map((marking) =>
              renderChip(
                "settlementMarking",
                marking,
                t(`legal.demand.marking.${marking}`, marking),
              ),
            )}
          </div>
        </div>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.demand.triggeringEvent", "Triggering event and evidence")}
          </span>
          {renderTextarea(
            "triggeringEvent",
            t(
              "legal.demand.triggeringEventPlaceholder",
              "What happened, when, and what evidence exists?",
            ),
            4,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.demand.legalBasis", "Legal / contractual basis")}
          </span>
          {renderTextarea(
            "legalBasis",
            t(
              "legal.demand.legalBasisPlaceholder",
              "Contract sections, governing law, statutes, rules, placeholders to verify",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.demand.desiredOutcome", "Desired outcome")}</span>
          {renderTextarea(
            "desiredOutcome",
            t(
              "legal.demand.desiredOutcomePlaceholder",
              "Payment of $X by date Y; cure within N days; stop activity Z",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.demand.priorOutreach", "Prior outreach")}</span>
          {renderTextarea(
            "priorOutreach",
            t(
              "legal.demand.priorOutreachPlaceholder",
              "Informal asks, responses so far, why demand-letter escalation now",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field">
          <span>{t("legal.demand.delivery", "Delivery method")}</span>
          <input
            className="legal-intake-input"
            value={values.delivery}
            placeholder={t(
              "legal.demand.deliveryPlaceholder",
              "Email, courier, certified mail, counsel",
            )}
            onChange={(event) => updateValue("delivery", event.target.value)}
          />
        </label>

        <label className="legal-intake-field">
          <span>{t("legal.demand.signer", "Signer")}</span>
          <input
            className="legal-intake-input"
            value={values.signer}
            placeholder={t(
              "legal.demand.signerPlaceholder",
              "You, client, GC, instructed counsel",
            )}
            onChange={(event) => updateValue("signer", event.target.value)}
          />
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t(
              "legal.demand.copiesSeedNotes",
              "Copies / seed documents / strategic notes",
            )}
          </span>
          {renderTextarea(
            "copies",
            t(
              "legal.demand.copiesPlaceholder",
              "Internal stakeholders, insurance carrier, counsel",
            ),
            2,
          )}
          {renderTextarea(
            "seedDocs",
            t(
              "legal.demand.seedDocsPlaceholder",
              "Paths or notes for contracts, correspondence, invoices, evidence",
            ),
            2,
          )}
          {renderTextarea(
            "strategicNotes",
            t(
              "legal.demand.strategicNotesPlaceholder",
              "Leverage, BATNA, downside tolerance, privilege filters, admissions risk",
            ),
            3,
          )}
        </label>
      </div>

      <footer className="legal-intake-card-footer">
        <span className="legal-intake-footer-note">
          {t(
            "legal.demand.blankFieldsNote",
            "Blank fields will be flagged in the intake.",
          )}
        </span>
        <button
          type="button"
          className="legal-intake-submit"
          disabled={!canSubmit}
          onClick={() => onSubmit(buildLegalDemandIntakeFollowUp(values))}
        >
          {t("legal.continueTask", "Continue task")}
        </button>
      </footer>
    </section>
  );
}

export function GenericLegalWorkflowPromptCard({
  invocation,
  onSubmit,
  onDismiss,
}: {
  invocation: LegalWorkflowInvocation;
  onSubmit: (message: string) => void;
  onDismiss: () => void;
}) {
  useLanguage();
  const t = translate;
  const [values, setValues] = useState<GenericLegalWorkflowFormValues>(() =>
    buildGenericLegalWorkflowInitialValues(invocation),
  );

  useEffect(() => {
    setValues(buildGenericLegalWorkflowInitialValues(invocation));
  }, [invocation]);

  const updateValue = useCallback(
    (field: keyof GenericLegalWorkflowFormValues, value: string) => {
      setValues((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const renderTextarea = (
    field: keyof GenericLegalWorkflowFormValues,
    placeholder: string,
    rows = 3,
  ) => (
    <textarea
      className="legal-intake-textarea"
      rows={rows}
      value={String(values[field] || "")}
      placeholder={placeholder}
      onChange={(event) => updateValue(field, event.target.value)}
    />
  );

  const hasAnyContext = Object.values(values).some(
    (value) => value.trim().length > 0,
  );
  const commandLabel = invocation.commandName
    ? `/${invocation.commandName}`
    : t("legal.workflow.fallbackCommand", "Legal workflow");

  return (
    <section
      className="legal-intake-card"
      aria-label={t("legal.workflow.title", "Legal workflow details")}
    >
      <header className="legal-intake-card-header">
        <div className="legal-intake-card-title">
          <FileText size={18} aria-hidden="true" />
          <span>{t("legal.workflow.title", "Legal workflow details")}</span>
          <span className="legal-intake-command-pill">{commandLabel}</span>
        </div>
        <button
          type="button"
          className="legal-intake-dismiss"
          onClick={onDismiss}
          aria-label={t(
            "legal.workflow.dismiss",
            "Dismiss legal workflow form",
          )}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="legal-intake-card-body">
        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.workflow.matterTitle", "Matter or project title")}
          </span>
          <input
            className="legal-intake-input"
            value={values.matterTitle}
            placeholder={t(
              "legal.workflow.matterTitlePlaceholder",
              "e.g. Vendor AI review - Acme Logistics",
            )}
            onChange={(event) => updateValue("matterTitle", event.target.value)}
          />
        </label>

        <label className="legal-intake-field">
          <span>
            {t("legal.workflow.jurisdiction", "Jurisdiction / governing law")}
          </span>
          <input
            className="legal-intake-input"
            value={values.jurisdiction}
            placeholder={t(
              "legal.workflow.jurisdictionPlaceholder",
              "State, country, regulator, contract law",
            )}
            onChange={(event) =>
              updateValue("jurisdiction", event.target.value)
            }
          />
        </label>

        <label className="legal-intake-field">
          <span>{t("legal.workflow.role", "Role / side / perspective")}</span>
          <input
            className="legal-intake-input"
            value={values.roleOrSide}
            placeholder={t(
              "legal.workflow.rolePlaceholder",
              "Buyer, vendor, employer, plaintiff, professor, in-house",
            )}
            onChange={(event) => updateValue("roleOrSide", event.target.value)}
          />
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.workflow.objective", "Objective")}</span>
          {renderTextarea(
            "objective",
            t(
              "legal.workflow.objectivePlaceholder",
              "What should this workflow accomplish?",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.workflow.keyFacts", "Key facts / timeline")}</span>
          {renderTextarea(
            "keyFacts",
            t(
              "legal.workflow.keyFactsPlaceholder",
              "Events, dates, business context, disputed points, known unknowns",
            ),
            4,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>{t("legal.workflow.documents", "Documents / sources")}</span>
          {renderTextarea(
            "documents",
            t(
              "legal.workflow.documentsPlaceholder",
              "File paths, uploads, contract names, policies, correspondence, data sources",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field">
          <span>
            {t("legal.workflow.deadlines", "Deadlines / risk triggers")}
          </span>
          {renderTextarea(
            "deadlines",
            t(
              "legal.workflow.deadlinesPlaceholder",
              "Notice periods, filing dates, launch dates, board dates, regulator windows",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field">
          <span>
            {t("legal.workflow.stakeholders", "Stakeholders / audience")}
          </span>
          {renderTextarea(
            "stakeholders",
            t(
              "legal.workflow.stakeholdersPlaceholder",
              "Decision-maker, reviewer, business owner, client, outside counsel",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t("legal.workflow.constraints", "Constraints / assumptions")}
          </span>
          {renderTextarea(
            "constraints",
            t(
              "legal.workflow.constraintsPlaceholder",
              "Privilege filters, risk tolerance, deal posture, citation requirements, scope limits",
            ),
            3,
          )}
        </label>

        <label className="legal-intake-field legal-intake-field-full">
          <span>
            {t(
              "legal.workflow.outputPreferences",
              "Output preferences / review notes",
            )}
          </span>
          {renderTextarea(
            "outputPreferences",
            t(
              "legal.workflow.outputPreferencesPlaceholder",
              "Table, memo, checklist, email draft, redlines, escalation flags, questions to ask",
            ),
            3,
          )}
        </label>
      </div>

      <footer className="legal-intake-card-footer">
        <span className="legal-intake-footer-note">
          {t(
            "legal.workflow.blankFieldsNote",
            "Blank fields will be flagged before the workflow relies on them.",
          )}
        </span>
        <button
          type="button"
          className="legal-intake-submit"
          disabled={!hasAnyContext}
          onClick={() =>
            onSubmit(buildGenericLegalWorkflowFollowUp(invocation, values))
          }
        >
          {t("legal.continueTask", "Continue task")}
        </button>
      </footer>
    </section>
  );
}
