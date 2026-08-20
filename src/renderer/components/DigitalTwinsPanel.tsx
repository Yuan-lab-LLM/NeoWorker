import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Power, Edit3, Search, User } from "lucide-react";
import { resolveTwinIcon } from "../utils/twin-icons";
import type { AgentRoleData, AgentCapability } from "../../electron/preload";
import type { Company } from "../../shared/types";
import { PersonaTemplateGallery } from "./PersonaTemplateGallery";
import { AgentRoleEditor } from "./AgentRoleEditor";
import { translate, useLanguage } from "../i18n";
import {
  getLocalizedAgentCapability,
  getLocalizedAgentRoleText,
  getLocalizedAutonomyLabel,
  getLocalizedCompanyOperatorTemplateName,
} from "../utils/localized-agent-roles";

type AgentRole = AgentRoleData;

const COMPANY_OPERATOR_TEMPLATE_NAMES = [
  "Company Planner",
  "Founder Office Operator",
  "Growth Operator",
  "Customer Ops Lead",
];

interface DigitalTwinsPanelProps {
  initialCompanyId?: string | null;
  onOpenAgents?: () => void;
}

export function DigitalTwinsPanel({
  initialCompanyId = null,
  onOpenAgents,
}: DigitalTwinsPanelProps) {
  useLanguage();
  const t = translate;
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AgentRole | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getAgentRoles(showInactive);
      setRoles(loaded);
      setError(null);
    } catch (err) {
      setError(t("digitalTwins.error.load", "Failed to load agent portrait"));
      console.error("Failed to load agent roles:", err);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    let cancelled = false;

    async function loadCompanyContext() {
      if (!initialCompanyId) {
        setSelectedCompany(null);
        return;
      }
      try {
        const company = await window.electronAPI.getCompany(initialCompanyId);
        if (!cancelled) {
          setSelectedCompany(company ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            "Failed to load company context for agent personas:",
            err,
          );
          setSelectedCompany(null);
        }
      }
    }

    void loadCompanyContext();

    return () => {
      cancelled = true;
    };
  }, [initialCompanyId]);

  const handleCreateBlank = () => {
    setEditingRole({
      id: "",
      name: "",
      companyId: selectedCompany?.id,
      displayName: "",
      description: "",
      icon: "Laptop",
      color: "#6366f1",
      capabilities: ["code"] as AgentCapability[],
      isSystem: false,
      isActive: true,
      sortOrder: 100,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setIsCreating(true);
  };

  const handleEdit = (role: AgentRole) => {
    setEditingRole({ ...role });
    setIsCreating(false);
  };

  const handleSave = async (role: AgentRole) => {
    try {
      if (isCreating) {
        const created = await window.electronAPI.createAgentRole({
          name: role.name,
          roleKind: role.roleKind || "custom",
          sourceTemplateId: role.sourceTemplateId,
          sourceTemplateVersion: role.sourceTemplateVersion,
          companyId: role.companyId,
          displayName: role.displayName,
          description: role.description,
          icon: role.icon,
          color: role.color,
          personalityId: role.personalityId,
          modelKey: role.modelKey,
          providerType: role.providerType,
          systemPrompt: role.systemPrompt,
          capabilities: role.capabilities,
          toolRestrictions: role.toolRestrictions,
          autonomyLevel: role.autonomyLevel,
          soul: role.soul,
        });
        setRoles((prev) => [...prev, created]);
      } else {
        const updated = await window.electronAPI.updateAgentRole({
          id: role.id,
          roleKind: role.roleKind,
          sourceTemplateId: role.sourceTemplateId ?? null,
          sourceTemplateVersion: role.sourceTemplateVersion ?? null,
          companyId: role.companyId ?? null,
          displayName: role.displayName,
          description: role.description,
          icon: role.icon,
          color: role.color,
          personalityId: role.personalityId,
          modelKey: role.modelKey,
          providerType: role.providerType,
          systemPrompt: role.systemPrompt,
          capabilities: role.capabilities,
          toolRestrictions: role.toolRestrictions,
          isActive: role.isActive,
          sortOrder: role.sortOrder,
          autonomyLevel: role.autonomyLevel,
          soul: role.soul,
        });
        if (updated) {
          setRoles((prev) =>
            prev.map((r) => (r.id === updated.id ? updated : r)),
          );
        }
      }
      setEditingRole(null);
      setIsCreating(false);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("digitalTwins.error.save", "Failed to save agent"),
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        t(
          "digitalTwins.confirm.delete",
          "Are you sure you want to delete this agent portrait?",
        ),
      )
    )
      return;
    try {
      const success = await window.electronAPI.deleteAgentRole(id);
      if (success) {
        setRoles((prev) => prev.filter((r) => r.id !== id));
      } else {
        setError(
          t(
            "digitalTwins.error.deleteSystem",
            "System agent role cannot be deleted",
          ),
        );
      }
    } catch {
      setError(t("digitalTwins.error.delete", "Failed to delete agent"));
    }
  };

  const handleToggleActive = async (role: AgentRole) => {
    try {
      const updated = await window.electronAPI.updateAgentRole({
        id: role.id,
        isActive: !role.isActive,
      });
      if (updated) {
        setRoles((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
      }
    } catch {
      setError(
        t("digitalTwins.error.updateStatus", "Failed to update agent state"),
      );
    }
  };

  const handleActivated = (agentRole: AgentRoleData) => {
    setRoles((prev) => [...prev, agentRole as AgentRole]);
    setGalleryOpen(false);
  };

  // Filter roles by search query
  const filteredRoles = roles.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.displayName?.toLowerCase().includes(q) ||
      r.name?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      getLocalizedAgentRoleText(r).name.toLowerCase().includes(q) ||
      getLocalizedAgentRoleText(r).description.toLowerCase().includes(q)
    );
  });

  const activeRoles = filteredRoles.filter((r) => r.isActive);
  const inactiveRoles = filteredRoles.filter((r) => !r.isActive);

  const sortByActivity = (roles: AgentRole[]) =>
    [...roles].sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100));

  const companyRoles = sortByActivity(
    selectedCompany
      ? activeRoles.filter((role) => role.companyId === selectedCompany.id)
      : [],
  );
  const companyInactiveRoles = selectedCompany
    ? inactiveRoles.filter((role) => role.companyId === selectedCompany.id)
    : [];
  const otherActiveRoles = sortByActivity(
    selectedCompany
      ? activeRoles.filter((role) => role.companyId !== selectedCompany.id)
      : activeRoles,
  );
  const otherInactiveRoles = selectedCompany
    ? inactiveRoles.filter((role) => role.companyId !== selectedCompany.id)
    : inactiveRoles;

  // Show editor if editing or creating
  if (editingRole) {
    return (
      <AgentRoleEditor
        role={editingRole}
        isCreating={isCreating}
        onSave={handleSave}
        onCancel={() => {
          setEditingRole(null);
          setIsCreating(false);
        }}
        error={error}
      />
    );
  }

  const renderTwinCard = (role: AgentRole, isInactive: boolean) => {
    const localizedRole = getLocalizedAgentRoleText(role);
    return (
      <div
        key={role.id}
        className={`dt-card ${isInactive ? "dt-card-inactive" : ""}`}
      >
        <div className="dt-card-header">
          <div
            className={`dt-card-avatar ${isInactive ? "dt-avatar-inactive" : ""}`}
          >
            {role.icon
              ? (() => {
                  const Icon = resolveTwinIcon(role.icon);
                  return <Icon size={20} strokeWidth={2} />;
                })()
              : null}
          </div>
          <div className="dt-card-title">
            <span className="dt-card-name">{localizedRole.name}</span>
            {role.autonomyLevel && !isInactive && (
              <span
                className={`dt-autonomy-badge dt-autonomy-${role.autonomyLevel}`}
              >
                {getLocalizedAutonomyLabel(role.autonomyLevel)}
              </span>
            )}
          </div>
          {!isInactive && (
            <div className="dt-status-area">
              <span className="dt-status-label">
                {t("digitalTwins.card.preset", "Default")}
              </span>
            </div>
          )}
        </div>

        {localizedRole.description && (
          <p className="dt-card-desc">{localizedRole.description}</p>
        )}

        {role.companyId && (
          <div className="dt-card-meta-row">
            <span className="dt-company-badge">
              {selectedCompany?.id === role.companyId
                ? t(
                    "digitalTwins.card.assignedThisCompany",
                    "Already assigned to this company",
                  )
                : t(
                    "digitalTwins.card.assignedOtherCompany",
                    "Assigned to other companies",
                  )}
            </span>
          </div>
        )}

        {role.capabilities && role.capabilities.length > 0 && (
          <div className="dt-card-caps">
            {role.capabilities.slice(0, 4).map((cap) => (
              <span key={cap} className="dt-cap-tag">
                {getLocalizedAgentCapability(cap)}
              </span>
            ))}
            {role.capabilities.length > 4 && (
              <span className="dt-cap-tag dt-cap-more">
                +{role.capabilities.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Actions row */}
        <div className="dt-card-actions">
          <div className="dt-action-spacer" />

          <button
            className="dt-card-action"
            onClick={() => handleEdit(role)}
            title={t("common.edit", "Edit")}
          >
            <Edit3 size={13} strokeWidth={1.5} />
          </button>
          <button
            className="dt-card-action"
            onClick={() => handleToggleActive(role)}
            title={
              isInactive
                ? t("digitalTwins.action.activate", "enable")
                : t("digitalTwins.action.deactivate", "deactivate")
            }
          >
            <Power size={13} strokeWidth={1.5} />
          </button>
          {!role.isSystem && (
            <button
              className="dt-card-action dt-card-action-danger"
              onClick={() => handleDelete(role.id)}
              title={t("common.delete", "Delete")}
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dt-panel">
      {/* Header */}
      <div className="dt-header">
        <div className="dt-header-top">
          <div className="dt-title-area">
            <h2>{t("digitalTwins.title", "Intelligent body portrait")}</h2>
            <span className="dt-count">
              {selectedCompany
                ? t("digitalTwins.count.company", "{count} for {company}", {
                    count: companyRoles.length,
                    company: selectedCompany.name,
                  })
                : t("digitalTwins.count.active", "{count} active", {
                    count: activeRoles.length,
                  })}
            </span>
          </div>
          <div className="dt-header-actions">
            <button className="dt-btn dt-btn-secondary" onClick={onOpenAgents}>
              <User size={14} strokeWidth={1.5} />
              {t("digitalTwins.openAgentsHub", "Open competency center")}
            </button>
            <button
              className="dt-btn dt-btn-secondary"
              onClick={handleCreateBlank}
            >
              <Plus size={14} strokeWidth={2} />
              {t("digitalTwins.newAgent", "Create a new agent")}
            </button>
            <button
              className="dt-btn dt-btn-primary"
              onClick={() => setGalleryOpen(true)}
            >
              <User size={14} strokeWidth={1.5} />
              {t("digitalTwins.fromTemplate", "Create from template")}
            </button>
          </div>
        </div>
        <p className="dt-subtitle">
          {t(
            "digitalTwins.description",
            "Create and manage agent character presets. Core automation is configured in the task hub, and managed agents can be managed in the capability center.",
          )}
        </p>
        {selectedCompany ? (
          <div className="dt-company-context">
            <div className="dt-company-context-copy">
              <div className="dt-company-context-title">
                {t(
                  "digitalTwins.companyContext.title",
                  "Company context: {company}",
                  {
                    company: selectedCompany.name,
                  },
                )}
              </div>
              <div className="dt-company-context-text">
                {t(
                  "digitalTwins.companyContext.description",
                  "First create an operator portrait for this company; if a general operator is required to take over core automation, this can be configured separately in the task console.",
                )}
              </div>
              <div className="dt-company-context-tags">
                {COMPANY_OPERATOR_TEMPLATE_NAMES.map((name) => (
                  <span key={name} className="dt-company-context-tag">
                    {getLocalizedCompanyOperatorTemplateName(name)}
                  </span>
                ))}
              </div>
            </div>
            <button
              className="dt-btn dt-btn-primary"
              onClick={() => setGalleryOpen(true)}
            >
              <User size={14} strokeWidth={1.5} />
              {t("digitalTwins.operatorTemplates", "Operator template")}
            </button>
          </div>
        ) : null}
        <div className="dt-toolbar">
          <div className="dt-search-wrapper">
            <Search size={14} strokeWidth={1.5} />
            <input
              type="text"
              className="dt-search"
              placeholder={t(
                "digitalTwins.search.placeholder",
                "Search for agents...",
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <label className="dt-toggle-inactive">
            <span>{t("digitalTwins.showInactive", "Show disabled")}</span>
            <span className="settings-toggle dt-toggle-control">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span className="toggle-slider" />
            </span>
          </label>
        </div>
      </div>

      {/* Content */}
      <div className="dt-content">
        {loading && (
          <div
            className="dt-skeleton-grid"
            aria-label={t("digitalTwins.loading", "Loading agent portrait...")}
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div className="dt-skeleton-card" key={index}>
                <span className="dt-skeleton-avatar" />
                <span className="dt-skeleton-line dt-skeleton-line-title" />
                <span className="dt-skeleton-line dt-skeleton-line-body" />
                <span className="dt-skeleton-line dt-skeleton-line-tags" />
              </div>
            ))}
          </div>
        )}
        {error && <div className="dt-error">{error}</div>}

        {!loading && roles.length === 0 && (
          <div className="dt-empty">
            <div className="dt-empty-icon">
              <User size={40} strokeWidth={1} />
            </div>
            <h3>
              {t(
                "digitalTwins.empty.title",
                "There is no portrait of the agent yet",
              )}
            </h3>
            <p>
              {t(
                "digitalTwins.empty.description",
                "Create your first agent persona from a template, or build a custom agent from scratch.",
              )}
            </p>
            <button
              className="dt-btn dt-btn-primary"
              onClick={() => setGalleryOpen(true)}
            >
              <User size={14} strokeWidth={1.5} />
              {t("digitalTwins.browseTemplates", "Browse templates")}
            </button>
          </div>
        )}

        {!loading && selectedCompany && companyRoles.length > 0 && (
          <div className="dt-section">
            <h3 className="dt-section-title">
              {t("digitalTwins.sections.companyOperators", "company operator")}
            </h3>
            <div className="dt-grid">
              {companyRoles.map((role) => renderTwinCard(role, false))}
            </div>
          </div>
        )}

        {!loading && selectedCompany && companyRoles.length === 0 && (
          <div className="dt-empty dt-empty-company">
            <h3>
              {t(
                "digitalTwins.emptyCompany.title",
                "{company} No operator has been assigned yet",
                {
                  company: selectedCompany.name,
                },
              )}
            </h3>
            <p>
              {t(
                "digitalTwins.emptyCompany.description",
                'Enable operator portraits or assign existing agents to this company in the "Company" tab.',
              )}
            </p>
            <button
              className="dt-btn dt-btn-primary"
              onClick={() => setGalleryOpen(true)}
            >
              <User size={14} strokeWidth={1.5} />
              {t(
                "digitalTwins.createCompanyOperator",
                "Create company operator",
              )}
            </button>
          </div>
        )}

        {!loading && otherActiveRoles.length > 0 && (
          <div className="dt-section">
            <h3 className="dt-section-title">
              {selectedCompany
                ? t(
                    "digitalTwins.sections.otherActiveAgents",
                    "Other active agents",
                  )
                : t("digitalTwins.sections.activeAgents", "active agent")}
            </h3>
            <div className="dt-grid">
              {otherActiveRoles.map((role) => renderTwinCard(role, false))}
            </div>
          </div>
        )}

        {!loading &&
          showInactive &&
          selectedCompany &&
          companyInactiveRoles.length > 0 && (
            <div className="dt-section">
              <h3 className="dt-section-title">
                {t(
                  "digitalTwins.sections.inactiveCompanyOperators",
                  "Company Operator Deactivated",
                )}
              </h3>
              <div className="dt-grid">
                {companyInactiveRoles.map((role) => renderTwinCard(role, true))}
              </div>
            </div>
          )}

        {!loading && showInactive && otherInactiveRoles.length > 0 && (
          <div className="dt-section">
            <h3 className="dt-section-title">
              {selectedCompany
                ? t(
                    "digitalTwins.sections.otherInactiveAgents",
                    "Other deactivated agents",
                  )
                : t(
                    "digitalTwins.sections.inactiveAgents",
                    "Agent deactivated",
                  )}
            </h3>
            <div className="dt-grid">
              {otherInactiveRoles.map((role) => renderTwinCard(role, true))}
            </div>
          </div>
        )}
      </div>

      {/* Template Gallery Modal */}
      {galleryOpen && (
        <PersonaTemplateGallery
          onClose={() => setGalleryOpen(false)}
          onActivated={handleActivated}
          initialCategory={selectedCompany ? "operations" : "all"}
          companyId={selectedCompany?.id ?? null}
          companyName={selectedCompany?.name ?? null}
          recommendedTemplateNames={
            selectedCompany ? COMPANY_OPERATOR_TEMPLATE_NAMES : []
          }
        />
      )}

      <style>{`
        .dt-panel {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          overflow: visible;
          color: var(--color-text-primary);
          font-family: var(--font-ui);
        }

        .dt-header {
          padding: 4px 0 18px;
          flex-shrink: 0;
        }

        .dt-header-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 8px;
        }

        .dt-title-area {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .dt-title-area h2 {
          margin: 0;
          font-size: 18px;
          font-weight: 650;
          line-height: 26px;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
        }

        .dt-count {
          display: inline-flex;
          min-height: 22px;
          align-items: center;
          padding: 0 8px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 999px;
          background: var(--color-bg-secondary);
          color: var(--color-text-muted);
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
        }

        .dt-header-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .dt-btn {
          box-sizing: border-box;
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          justify-content: center;
          gap: 5px;
          padding: 6px 11px;
          border: 1px solid transparent;
          border-radius: 8px;
          font-family: var(--font-ui);
          font-size: 13px;
          font-weight: 550;
          line-height: 20px;
          white-space: nowrap;
          cursor: pointer;
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            color 120ms ease,
            transform 120ms ease;
        }

        .dt-btn:active {
          transform: translateY(1px);
        }

        .dt-btn:focus-visible,
        .dt-card-action:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--color-accent), transparent 55%);
          outline-offset: 2px;
        }

        .dt-btn-primary {
          background: var(--color-accent);
          color: white;
        }

        .dt-btn-primary:hover {
          background: var(--color-accent-hover);
        }

        .dt-btn-secondary {
          background: var(--color-bg-primary);
          border-color: var(--color-border-subtle);
          color: var(--color-text-secondary);
        }

        .dt-btn-secondary:hover {
          background: var(--color-bg-hover);
          border-color: var(--color-border);
          color: var(--color-text-primary);
        }

        .dt-subtitle {
          max-width: 760px;
          margin: 0;
          font-size: 13px;
          color: var(--color-text-muted);
          line-height: 1.55;
        }

        .dt-company-context {
          margin: 16px 0 0;
          padding: 14px 16px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          background: var(--color-bg-secondary);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .dt-company-context-copy {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .dt-company-context-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .dt-company-context-text {
          font-size: 12px;
          color: var(--color-text-secondary);
          line-height: 1.4;
        }

        .dt-company-context-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .dt-company-context-tag {
          display: inline-flex;
          align-items: center;
          padding: 3px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 500;
          color: var(--color-text-secondary);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border-subtle);
        }

        .dt-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid var(--color-border-subtle);
        }

        .dt-search-wrapper {
          display: flex;
          min-height: 36px;
          align-items: center;
          gap: 8px;
          box-sizing: border-box;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border-subtle);
          border-radius: 9px;
          padding: 6px 11px;
          width: min(360px, 100%);
          color: var(--color-text-muted);
          transition:
            border-color 120ms ease,
            box-shadow 120ms ease;
        }

        .dt-search-wrapper:focus-within {
          border-color: color-mix(in srgb, var(--color-accent), transparent 35%);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent), transparent 88%);
        }

        .dt-search {
          min-width: 0;
          width: 100%;
          background: none;
          border: none;
          outline: none;
          color: var(--color-text-primary);
          font-family: var(--font-ui);
          font-size: 13px;
          line-height: 20px;
        }

        .dt-search::placeholder {
          color: var(--color-text-muted);
          opacity: 0.72;
        }

        .dt-toggle-inactive {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: var(--color-text-secondary);
          font-size: 13px;
          font-weight: 500;
          line-height: 20px;
          cursor: pointer;
          white-space: nowrap;
        }

        .dt-toggle-control {
          flex: 0 0 auto;
        }

        .dt-content {
          flex: 1;
          overflow: visible;
          padding: 18px 0 32px;
        }

        .dt-error {
          text-align: center;
          padding: 40px 0;
          color: var(--color-text-muted);
          font-size: 13px;
        }

        .dt-error {
          color: var(--color-error);
        }

        .dt-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;
        }

        .dt-empty-icon {
          color: var(--color-text-muted);
          opacity: 0.4;
          margin-bottom: 16px;
        }

        .dt-empty h3 {
          margin: 0 0 8px;
          font-size: 15px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .dt-empty p {
          margin: 0 0 20px;
          font-size: 13px;
          color: var(--color-text-muted);
          max-width: 360px;
          line-height: 1.5;
        }

        .dt-section {
          margin-bottom: 28px;
        }

        .dt-section-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--color-text-muted);
          letter-spacing: 0;
          margin: 0 0 10px;
        }

        .dt-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dt-card {
          min-width: 0;
          min-height: 148px;
          box-sizing: border-box;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          padding: 15px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          box-shadow: 0 1px 2px color-mix(in srgb, var(--color-text-primary), transparent 96%);
          transition:
            background-color 140ms ease,
            border-color 140ms ease,
            box-shadow 140ms ease,
            transform 140ms ease;
        }

        .dt-card:hover {
          border-color: color-mix(in srgb, var(--color-accent), var(--color-border-subtle) 72%);
          background: color-mix(in srgb, var(--color-accent), var(--color-bg-primary) 98%);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--color-text-primary), transparent 94%);
          transform: translateY(-1px);
        }

        .dt-card-inactive {
          opacity: 0.55;
        }

        .dt-card-header {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .dt-card-avatar {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--color-accent);
          background: color-mix(in srgb, var(--color-accent), transparent 92%);
          border: 1px solid color-mix(in srgb, var(--color-accent), transparent 82%);
        }

        .dt-avatar-inactive {
          filter: grayscale(1);
          opacity: 0.55;
        }

        .dt-card-title {
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          flex: 1;
        }

        .dt-card-name {
          font-size: 14px;
          font-weight: 620;
          line-height: 20px;
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dt-autonomy-badge {
          display: inline-flex;
          min-height: 19px;
          align-items: center;
          padding: 0 6px;
          border-radius: 5px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0;
          flex-shrink: 0;
          background: var(--color-bg-tertiary);
          color: var(--color-text-muted);
          border: 1px solid var(--color-border-subtle);
        }

        .dt-autonomy-lead {
          background: var(--color-bg-tertiary);
          color: var(--color-text-muted);
        }

        .dt-autonomy-specialist {
          background: var(--color-bg-tertiary);
          color: var(--color-text-muted);
        }

        .dt-autonomy-intern {
          background: var(--color-bg-tertiary);
          color: var(--color-text-muted);
        }

        .dt-status-area {
          display: inline-flex;
          min-height: 20px;
          align-items: center;
          padding: 0 7px;
          border-radius: 6px;
          background: var(--color-bg-secondary);
          flex-shrink: 0;
        }

        .dt-status-label {
          font-size: 10px;
          color: var(--color-text-muted);
          font-weight: 550;
          line-height: 1;
        }

        .dt-card-desc {
          min-height: 39px;
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .dt-card-meta-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dt-company-badge {
          display: inline-flex;
          align-items: center;
          min-height: 21px;
          padding: 0 7px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
          color: var(--color-text-secondary);
          background: var(--color-bg-tertiary);
          border: 1px solid var(--color-border-subtle);
        }

        .dt-card-caps {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .dt-cap-tag {
          display: inline-flex;
          min-height: 21px;
          align-items: center;
          padding: 0 7px;
          border-radius: 5px;
          border: 1px solid var(--color-border-subtle);
          background: var(--color-bg-secondary);
          color: var(--color-text-secondary);
          font-size: 11px;
          line-height: 1;
        }

        .dt-cap-more {
          font-weight: 600;
        }

        /* Heartbeat info */
        .dt-heartbeat-info {
          display: flex;
          gap: 12px;
        }

        .dt-hb-detail {
          font-size: 10px;
          color: var(--color-text-muted);
        }

        /* Actions */
        .dt-card-actions {
          display: flex;
          gap: 5px;
          align-items: center;
          margin-top: auto;
          padding-top: 2px;
        }

        .dt-action-spacer {
          flex: 1;
        }

        .dt-card-action {
          width: 28px;
          height: 28px;
          box-sizing: border-box;
          padding: 0;
          background: var(--color-bg-secondary);
          border: 1px solid transparent;
          color: var(--color-text-muted);
          border-radius: 7px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition:
            background-color 120ms ease,
            border-color 120ms ease,
            color 120ms ease,
            transform 120ms ease;
        }

        .dt-card-action:hover {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
          border-color: var(--color-border);
        }

        .dt-card-action:active {
          transform: translateY(1px);
        }

        .dt-card-action:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .dt-card-action:disabled:hover {
          background: transparent;
          color: var(--color-text-muted);
          border-color: var(--color-border-subtle);
        }

        .dt-action-start {
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.3);
        }

        .dt-action-start:hover {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          border-color: rgba(34, 197, 94, 0.5);
        }

        .dt-action-stop {
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.3);
        }

        .dt-action-stop:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border-color: rgba(239, 68, 68, 0.5);
        }

        .dt-action-wake {
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.3);
        }

        .dt-action-wake:hover:not(:disabled) {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.5);
        }

        .dt-card-action-danger:hover {
          color: var(--color-error);
          border-color: color-mix(in srgb, var(--color-error), transparent 55%);
          background: color-mix(in srgb, var(--color-error), transparent 92%);
        }

        .dt-skeleton-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .dt-skeleton-card {
          position: relative;
          min-height: 148px;
          box-sizing: border-box;
          overflow: hidden;
          padding: 15px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          background: var(--color-bg-primary);
        }

        .dt-skeleton-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            100deg,
            transparent 20%,
            color-mix(in srgb, var(--color-bg-hover), transparent 25%) 45%,
            transparent 70%
          );
          transform: translateX(-100%);
        }

        .dt-skeleton-avatar,
        .dt-skeleton-line {
          display: block;
          border-radius: 6px;
          background: var(--color-bg-tertiary);
        }

        .dt-skeleton-avatar {
          width: 36px;
          height: 36px;
          margin-bottom: 14px;
          border-radius: 10px;
        }

        .dt-skeleton-line {
          height: 9px;
          margin-top: 9px;
        }

        .dt-skeleton-line-title {
          width: 32%;
        }

        .dt-skeleton-line-body {
          width: 72%;
        }

        .dt-skeleton-line-tags {
          width: 44%;
        }

        @media (prefers-reduced-motion: no-preference) {
          .dt-skeleton-card::after {
            animation: dt-skeleton-shimmer 1.5s ease-in-out infinite;
          }
        }

        @keyframes dt-skeleton-shimmer {
          to {
            transform: translateX(100%);
          }
        }

        @media (max-width: 900px) {
          .dt-company-context,
          .dt-header-top,
          .dt-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .dt-header-actions {
            justify-content: stretch;
          }

          .dt-header-actions .dt-btn,
          .dt-company-context .dt-btn {
            justify-content: center;
          }

          .dt-search-wrapper {
            width: 100%;
          }

          .dt-grid,
          .dt-skeleton-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
