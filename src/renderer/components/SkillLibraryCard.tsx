import { ArrowRight, type Icon } from "@phosphor-icons/react";
import type { SkillStatusEntry } from "../../shared/types";
import { translate } from "../i18n";
import { canUseSkillFromCatalog, getSkillCardText } from "../utils/skill-card-presentation";
import "./skill-library-card.css";

export function SkillLibraryCard({ skill, icon: SkillIcon, onOpen, onUse }: {
  skill: SkillStatusEntry;
  icon: Icon;
  onOpen: () => void;
  onUse: () => void;
}) {
  const text = getSkillCardText(skill);
  const canUse = canUseSkillFromCatalog(skill);
  const disabled = skill.disabled || skill.enabled === false;
  const automatic = skill.invocation?.userInvocable === false || skill.type === "guideline";
  const status = disabled ? translate("skills.card.disabled", "Disabled")
    : !skill.eligible || skill.blockedByAllowlist ? translate("skills.card.setup", "Setup required")
      : automatic ? translate("skills.card.automatic", "Automatic")
        : translate("skills.card.ready", "Ready");
  const scope = skill.source === "workspace"
    ? translate("skills.card.workspace", "Current workspace")
    : skill.source ? translate("skills.card.global", "All workspaces") : text.source;
  return (
    <article className="skill-library-card">
      <header className="skill-library-card-heading">
        <span className="skill-library-card-icon"><SkillIcon size={21} weight="regular" aria-hidden="true" /></span>
        <h5 title={text.name}>{text.name}</h5>
      </header>
      <p className="skill-library-card-description">{text.description}</p>
      <div className="skill-library-card-meta">
        <span className={`skill-library-card-status${canUse ? " is-ready" : ""}`}><i aria-hidden="true" />{status}</span>
        {scope && <span>{scope}</span>}
        {text.category && <span>{text.category}</span>}
      </div>
      <footer className="skill-library-card-actions">
        <button type="button" className="skill-library-card-details" onClick={onOpen}
          aria-label={translate("skills.card.detailsNamed", "View details for {name}", { name: text.name })}>
          {translate("skills.card.details", "View details")}
        </button>
        <button type="button" className="skill-library-card-use" disabled={!canUse} onClick={onUse}
          aria-label={translate("skills.card.useNamed", "Use {name}", { name: text.name })}>
          {canUse ? translate("skills.card.use", "Use skill") : status}
          {canUse && <ArrowRight size={14} aria-hidden="true" />}
        </button>
      </footer>
    </article>
  );
}
