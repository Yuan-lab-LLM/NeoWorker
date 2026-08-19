import { useState, useEffect } from "react";
import { Check, Copy, Plug, Zap, Package, Dna } from "lucide-react";
import type {
  CapabilitySecurityReport,
  QuarantinedImportRecord,
} from "../../shared/types";
import { getEmojiIcon } from "../utils/emoji-icon-map";
import { getLocalizedSkillText } from "../utils/localized-skills";
import { getLocalizedPluginTryAskingPrompt } from "../utils/localized-plugin-prompts";
import { MESSAGE_SHORTCUTS_UPDATED_EVENT } from "../utils/message-slash-options";
import {
  isPluginPackVisibleForCurrentProductSupport,
  isProductIntegrationVisible,
  isSkillVisibleForCurrentProductSupport,
} from "../utils/product-availability";
import { PluginStore } from "./PluginStore";
import { getCurrentLanguage, translate, useLanguage } from "../i18n";

interface PluginPackData {
  name: string;
  displayName: string;
  version: string;
  description: string;
  icon?: string;
  category?: string;
  scope?: "personal" | "organization";
  personaTemplateId?: string;
  recommendedConnectors?: string[];
  tryAsking?: string[];
  bestFitWorkflows?: ("support_ops" | "it_ops" | "sales_ops")[];
  outcomeExamples?: string[];
  skills: {
    id: string;
    name: string;
    description: string;
    icon?: string;
    enabled?: boolean;
  }[];
  slashCommands: { name: string; description: string; skillId: string }[];
  agentRoles: {
    name: string;
    displayName: string;
    description?: string;
    icon: string;
    color: string;
  }[];
  state: string;
  enabled: boolean;
  policyBlocked?: boolean;
  policyRequired?: boolean;
  securityReport?: CapabilitySecurityReport;
}

type DetailTab = "commands" | "skills" | "agents";

const ZH_PACK_OUTCOMES: Record<string, string[]> = {
  "ai-governance-legal-pack": [
    translate(
      "generated.components.customizepanel.49.0",
      "Establish an AI system ledger with lawyer review levels.",
    ),
    translate(
      "generated.components.customizepanel.50.1",
      "Complete the impact assessment and risk classification of AI usage scenarios.",
    ),
    translate(
      "generated.components.customizepanel.51.2",
      "Form review opinions and follow-up actions on the supplier’s AI terms.",
    ),
  ],
};

interface CustomizePanelProps {
  onNavigateToConnectors?: () => void;
  onNavigateToSkills?: () => void;
  onCreateTask?: (title: string, prompt: string) => void;
  managementOnly?: boolean;
}

export function CustomizePanel({
  onNavigateToConnectors,
  onNavigateToSkills,
  onCreateTask,
  managementOnly = false,
}: CustomizePanelProps) {
  useLanguage();
  const t = translate;
  const [packs, setPacks] = useState<PluginPackData[]>([]);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("commands");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStore, setShowStore] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [packUpdates, setPackUpdates] = useState<Map<string, string>>(
    new Map(),
  );
  const [quarantinedPacks, setQuarantinedPacks] = useState<
    QuarantinedImportRecord[]
  >([]);
  const [actioningRecordId, setActioningRecordId] = useState<string | null>(
    null,
  );
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const getPackText = (pack: PluginPackData) => ({
    name: t(`extensions.catalog.${pack.name}.name`, pack.displayName),
    description: t(
      `extensions.catalog.${pack.name}.description`,
      pack.description,
    ),
  });

  const getOutcomeExamples = (pack: PluginPackData) => {
    if (getCurrentLanguage() !== "zh-CN") return pack.outcomeExamples || [];
    return (
      ZH_PACK_OUTCOMES[pack.name] ||
      (pack.outcomeExamples || []).map((_, index) =>
        t(
          "customize.reviewableOutcome",
          "Reviewable {name} deliverable {number}.",
          { name: getPackText(pack).name, number: index + 1 },
        ),
      )
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPacks() {
      try {
        setLoading(true);
        const data = await window.electronAPI.listPluginPacks();
        const quarantine = await window.electronAPI.listQuarantinedImports();
        if (cancelled) return;
        setPacks(data);
        setQuarantinedPacks(
          quarantine.filter((entry) => entry.bundleKind === "plugin-pack"),
        );
        const firstVisiblePack = data.find((pack) =>
          isPluginPackVisibleForCurrentProductSupport(pack.name),
        );
        if (
          firstVisiblePack &&
          (!selectedPack ||
            !data.some(
              (pack) =>
                pack.name === selectedPack &&
                isPluginPackVisibleForCurrentProductSupport(pack.name),
            ))
        ) {
          setSelectedPack(firstVisiblePack.name);
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : t("customize.error.load", "Failed to load plugin packs"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPacks();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  // Check for pack updates in the background
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const updates = await window.electronAPI.checkPackUpdates();
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const u of updates) {
          map.set(u.name, u.latestVersion);
        }
        setPackUpdates(map);
      } catch {
        // Update check failed silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const visiblePacks = packs
    .filter((pack) => isPluginPackVisibleForCurrentProductSupport(pack.name))
    .map((pack) => {
      const skills = pack.skills.filter(isSkillVisibleForCurrentProductSupport);
      const skillIds = new Set(skills.map((skill) => skill.id));
      return {
        ...pack,
        skills,
        slashCommands: pack.slashCommands.filter((command) =>
          skillIds.has(command.skillId),
        ),
        recommendedConnectors: (pack.recommendedConnectors || []).filter(
          isProductIntegrationVisible,
        ),
      };
    });
  const activePack = visiblePacks.find((p) => p.name === selectedPack);
  const activePackText = activePack ? getPackText(activePack) : null;

  // Filter packs by search query
  const query = searchQuery.toLowerCase().trim();
  const matchesPack = (p: PluginPackData) => {
    if (!query) return true;
    return (
      p.displayName.toLowerCase().includes(query) ||
      getPackText(p).name.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query) ||
      (p.description || "").toLowerCase().includes(query) ||
      getPackText(p).description.toLowerCase().includes(query) ||
      (p.category || "").toLowerCase().includes(query) ||
      p.skills.some(
        (s) =>
          s.name.toLowerCase().includes(query) ||
          s.id.toLowerCase().includes(query),
      )
    );
  };

  const personalPacks = visiblePacks.filter(
    (p) => p.scope === "personal" && matchesPack(p),
  );
  const orgPacks = visiblePacks.filter(
    (p) => p.scope === "organization" && matchesPack(p),
  );
  const bundledPacks = visiblePacks.filter(
    (p) =>
      (!p.scope || (p.scope !== "personal" && p.scope !== "organization")) &&
      matchesPack(p),
  );

  const handleToggle = async (packName: string, enabled: boolean) => {
    try {
      await window.electronAPI.togglePluginPack(packName, enabled);
      setPacks((prev) =>
        prev.map((p) =>
          p.name === packName
            ? { ...p, enabled, state: enabled ? "registered" : "disabled" }
            : p,
        ),
      );
      window.dispatchEvent(new Event(MESSAGE_SHORTCUTS_UPDATED_EVENT));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("customize.error.updatePack", "Failed to update plugin pack"),
      );
    }
  };

  const handleSkillToggle = async (
    packName: string,
    skillId: string,
    enabled: boolean,
  ) => {
    try {
      await window.electronAPI.togglePluginPackSkill(
        packName,
        skillId,
        enabled,
      );
      setPacks((prev) =>
        prev.map((p) =>
          p.name === packName
            ? {
                ...p,
                skills: p.skills.map((s) =>
                  s.id === skillId ? { ...s, enabled } : s,
                ),
              }
            : p,
        ),
      );
      window.dispatchEvent(new Event(MESSAGE_SHORTCUTS_UPDATED_EVENT));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("customize.error.updateSkill", "Failed to update plugin skill"),
      );
    }
  };

  const handleTryAsking = (prompt: string) => {
    if (onCreateTask) {
      onCreateTask(prompt.slice(0, 60), prompt);
    }
  };

  const getSecurityBadge = (report?: CapabilitySecurityReport) => {
    if (!report || report.verdict === "clean") {
      return null;
    }
    return (
      <span
        className={`settings-badge ${report.verdict === "quarantined" ? "settings-badge--error" : "settings-badge--warning"}`}
      >
        {report.verdict === "quarantined"
          ? t("customize.security.quarantined", "Quarantined")
          : t("customize.security.warning", "Security Warning")}
      </span>
    );
  };

  const handleRetryQuarantined = async (recordId: string) => {
    setActioningRecordId(recordId);
    try {
      await window.electronAPI.retryQuarantinedImport(recordId);
      setLoadKey((k) => k + 1);
    } finally {
      setActioningRecordId(null);
    }
  };

  const handleRemoveQuarantined = async (recordId: string) => {
    setActioningRecordId(recordId);
    try {
      await window.electronAPI.removeQuarantinedImport(recordId);
      setLoadKey((k) => k + 1);
    } finally {
      setActioningRecordId(null);
    }
  };

  const handleCopyCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(`/${command}`);
      setCopiedCommand(command);
      window.setTimeout(() => {
        setCopiedCommand((current) => (current === command ? null : current));
      }, 1600);
    } catch {
      setCopiedCommand(null);
    }
  };

  // Derive command cards from skills (each skill acts as a /command)
  const commandCards = activePack
    ? [
        ...activePack.slashCommands.map((c) => ({
          command: c.name,
          ...getLocalizedSkillText({
            id: c.skillId,
            name: c.name,
            description: c.description,
          }),
        })),
        ...activePack.skills
          .filter(
            (s) => !activePack.slashCommands.some((c) => c.skillId === s.id),
          )
          .map((s) => ({
            command: s.id,
            ...getLocalizedSkillText(s),
          })),
      ]
    : [];

  return (
    <div
      className={`cp-container${managementOnly ? " cp-container--management" : ""}`}
    >
      {/* Sidebar */}
      <div className="cp-sidebar">
        <div className="cp-sidebar-header">
          <h3>{t("customize.featurePacks", "Feature Packs")}</h3>
          <button
            className="cp-store-btn"
            onClick={() => setShowStore(true)}
            title={t("customize.browseStore", "Browse plugin store")}
          >
            +
          </button>
        </div>
        <p className="cp-sidebar-note">
          {t(
            "customize.featurePacks.description",
            "Enable bundled workflows like Legal, SMB, finance, and other domain packs.",
          )}
        </p>

        {/* Search */}
        <div className="cp-search-wrapper">
          <input
            type="text"
            className="cp-search-input"
            placeholder={t(
              "customize.search.placeholder",
              "Search packs & skills...",
            )}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="cp-search-clear"
              onClick={() => setSearchQuery("")}
            >
              &times;
            </button>
          )}
        </div>

        {/* Top-level navigation */}
        {!managementOnly && (
          <div className="cp-sidebar-section">
            <button
              className="cp-sidebar-item cp-sidebar-item--nav"
              onClick={onNavigateToConnectors}
            >
              <span className="cp-sidebar-icon">
                <Plug size={16} strokeWidth={1.5} />
              </span>
              <span>{t("customize.nav.connectors", "Connectors")}</span>
            </button>
            <button
              className="cp-sidebar-item cp-sidebar-item--nav"
              onClick={onNavigateToSkills}
            >
              <span className="cp-sidebar-icon">
                <Zap size={16} strokeWidth={1.5} />
              </span>
              <span>{t("customize.nav.skills", "Skills")}</span>
            </button>
          </div>
        )}

        {/* Personal plugins */}
        {personalPacks.length > 0 && (
          <>
            <div className="cp-sidebar-group-header">
              <span>{t("customize.group.personal", "Personal plugins")}</span>
            </div>
            {personalPacks.map((p) => (
              <button
                key={p.name}
                className={`cp-sidebar-item ${selectedPack === p.name ? "cp-sidebar-item--active" : ""}`}
                onClick={() => {
                  setSelectedPack(p.name);
                  setDetailTab("commands");
                }}
              >
                <span className="cp-sidebar-icon">
                  {p.icon || <Package size={16} strokeWidth={1.5} />}
                </span>
                <span>{getPackText(p).name}</span>
              </button>
            ))}
          </>
        )}

        {/* Organization plugins */}
        {orgPacks.length > 0 && (
          <>
            <div className="cp-sidebar-group-header">
              <span>
                {t("customize.group.organization", "Organization plugins")}
              </span>
            </div>
            {orgPacks.map((p) => (
              <button
                key={p.name}
                className={`cp-sidebar-item ${selectedPack === p.name ? "cp-sidebar-item--active" : ""}`}
                onClick={() => {
                  setSelectedPack(p.name);
                  setDetailTab("commands");
                }}
              >
                <span className="cp-sidebar-icon">
                  {p.icon || <Package size={16} strokeWidth={1.5} />}
                </span>
                <span>{getPackText(p).name}</span>
              </button>
            ))}
          </>
        )}

        {/* Bundled packs */}
        {bundledPacks.length > 0 && (
          <>
            <div className="cp-sidebar-group-header">
              <span>{t("customize.group.builtin", "Built-in packs")}</span>
            </div>
            {bundledPacks.map((p) => (
              <button
                key={p.name}
                className={`cp-sidebar-item ${selectedPack === p.name ? "cp-sidebar-item--active" : ""}`}
                onClick={() => {
                  setSelectedPack(p.name);
                  setDetailTab("commands");
                }}
              >
                <span className="cp-sidebar-icon">
                  {p.icon || <Package size={16} strokeWidth={1.5} />}
                </span>
                <span>{getPackText(p).name}</span>
                <span className="cp-pack-indicators">
                  {!p.enabled && (
                    <span
                      className="cp-disabled-dot"
                      title={t("common.disabled", "Disabled")}
                    />
                  )}
                  {packUpdates.has(p.name) && (
                    <span
                      className="cp-update-dot"
                      title={t(
                        "customize.update.available",
                        "Update available",
                      )}
                    />
                  )}
                </span>
              </button>
            ))}
          </>
        )}

        {quarantinedPacks.length > 0 && (
          <>
            <div className="cp-sidebar-group-header">
              <span>{t("customize.group.quarantined", "Quarantined")}</span>
            </div>
            {quarantinedPacks.map((record) => (
              <button
                key={record.id}
                className="cp-sidebar-item"
                onClick={() =>
                  setExpandedReportId((current) =>
                    current === record.id ? null : record.id,
                  )
                }
              >
                <span className="cp-sidebar-icon">🛡️</span>
                <span>{record.displayName || record.bundleId}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Detail Panel */}
      <div className="cp-detail">
        {loading && (
          <div className="cp-empty">
            {t("customize.loading", "Loading plugin packs...")}
          </div>
        )}
        {error && <div className="cp-empty cp-error">{error}</div>}
        {!loading && !error && !activePack && (
          <div className="cp-empty">
            {t(
              "customize.empty.selectPack",
              "Select a plugin pack from the sidebar",
            )}
          </div>
        )}

        {activePack && (
          <>
            {/* Header */}
            <div className="cp-detail-header">
              <div className="cp-detail-title-row">
                <h2>{activePackText?.name}</h2>
                <div className="cp-detail-actions">
                  <label className="cp-toggle">
                    <input
                      type="checkbox"
                      checked={activePack.enabled}
                      disabled={
                        activePack.policyBlocked ||
                        (activePack.policyRequired && activePack.enabled)
                      }
                      onChange={(e) =>
                        handleToggle(activePack.name, e.target.checked)
                      }
                    />
                    <span className="cp-toggle-slider" />
                  </label>
                </div>
              </div>
              <div className="cp-pack-status-row">
                <span
                  className={`cp-pack-status ${activePack.enabled ? "enabled" : "disabled"}`}
                >
                  {activePack.policyBlocked
                    ? t("customize.status.blockedByPolicy", "Blocked by policy")
                    : activePack.enabled
                      ? t("common.enabled", "Enabled")
                      : t("common.disabled", "Disabled")}
                </span>
                {activePack.policyRequired && (
                  <span className="settings-badge">
                    {t(
                      "customize.status.requiredByPolicy",
                      "Required by policy",
                    )}
                  </span>
                )}
              </div>
              <p className="cp-detail-description">
                {activePackText?.description}
              </p>
              {getSecurityBadge(activePack.securityReport)}
              {activePack.securityReport?.verdict === "warning" && (
                <div className="cp-update-badge">
                  <span>{activePack.securityReport.summary}</span>
                </div>
              )}
              {packUpdates.has(activePack.name) && (
                <div className="cp-update-badge">
                  <span>
                    {t(
                      "customize.update.availableVersion",
                      "Update available: v{version}",
                      { version: packUpdates.get(activePack.name) || "" },
                    )}
                  </span>
                </div>
              )}
              {activePack.personaTemplateId && (
                <div className="cp-detail-twin-badge">
                  <span>
                    <Dna size={14} strokeWidth={1.5} />
                  </span>
                  <span>
                    {t("customize.persona.included", "Includes Agent Persona")}
                  </span>
                </div>
              )}
              {!managementOnly &&
                activePack.bestFitWorkflows &&
                activePack.bestFitWorkflows.length > 0 && (
                  <div className="cp-best-fit-row">
                    <span className="cp-rc-label">
                      {t("customize.bestFor", "Best for:")}
                    </span>
                    {activePack.bestFitWorkflows.map((lane) => (
                      <span
                        key={lane}
                        className={`cp-best-fit-badge cp-best-fit-badge--${lane}`}
                      >
                        {lane === "support_ops"
                          ? t("customize.workflow.supportOps", "Support Ops")
                          : lane === "it_ops"
                            ? t("customize.workflow.itOps", "IT Ops")
                            : t("customize.workflow.salesOps", "Sales Ops")}
                      </span>
                    ))}
                  </div>
                )}
              {!managementOnly &&
                activePack.outcomeExamples &&
                activePack.outcomeExamples.length > 0 && (
                  <div className="cp-outcome-examples">
                    <span className="cp-rc-label">
                      {t("customize.outcomeExamples", "Outcome examples:")}
                    </span>
                    <ul className="cp-outcome-list">
                      {getOutcomeExamples(activePack).map((ex, i) => (
                        <li key={i} className="cp-outcome-item">
                          {ex}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {activePack.recommendedConnectors &&
                activePack.recommendedConnectors.length > 0 && (
                  <div className="cp-recommended-connectors">
                    <span className="cp-rc-label">
                      {t(
                        "customize.recommendedConnectors",
                        "Recommended connectors:",
                      )}
                    </span>
                    {activePack.recommendedConnectors.map((c) => (
                      <button
                        key={c}
                        className="cp-rc-chip"
                        onClick={onNavigateToConnectors}
                        title={t("customize.setupConnector", "Set up {name}", {
                          name: c,
                        })}
                      >
                        <span>
                          <Plug size={12} strokeWidth={1.5} />
                        </span>
                        <span>{c}</span>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            {/* Tabs */}
            {!managementOnly && (
              <div className="cp-tabs">
                <button
                  className={`cp-tab ${detailTab === "commands" ? "cp-tab--active" : ""}`}
                  onClick={() => setDetailTab("commands")}
                >
                  {t("customize.tabs.commands", "Commands")}
                </button>
                <button
                  className={`cp-tab ${detailTab === "skills" ? "cp-tab--active" : ""}`}
                  onClick={() => setDetailTab("skills")}
                >
                  {t("customize.tabs.skills", "Skills")}
                </button>
                <button
                  className={`cp-tab ${detailTab === "agents" ? "cp-tab--active" : ""}`}
                  onClick={() => setDetailTab("agents")}
                >
                  {t("customize.tabs.agents", "Agents")}
                </button>
              </div>
            )}

            {/* Tab content */}
            <div className="cp-tab-content">
              {managementOnly && (
                <div className="cp-management-intro">
                  <div>
                    <strong>
                      {translate(
                        "generated.components.customizepanel.583.3",
                        "Contains skills",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.customizepanel.583.4",
                        "Here you control whether the combination and the skills in it are enabled. Commands, trial suggestions, and direct access have been moved to Tools & Skills.",
                      )}
                    </span>
                  </div>
                  <div className="cp-management-counts">
                    <span>
                      <strong>{activePack.skills.length}</strong>{" "}
                      {translate(
                        "generated.components.customizepanel.585.5",
                        "skills",
                      )}
                    </span>
                    <span>
                      <strong>{activePack.agentRoles.length}</strong>{" "}
                      {translate(
                        "generated.components.customizepanel.586.6",
                        "expert",
                      )}
                    </span>
                    <span>
                      <strong>
                        {activePack.recommendedConnectors?.length || 0}
                      </strong>{" "}
                      {translate(
                        "generated.components.customizepanel.587.7",
                        "recommended connectors",
                      )}
                    </span>
                  </div>
                </div>
              )}
              {!managementOnly && detailTab === "commands" && (
                <>
                  <p className="cp-tab-hint">
                    {t(
                      "customize.commands.hint",
                      "Use these shortcuts to trigger a workflow by name. Search your list of commands at any time by typing / in the chat window.",
                    )}
                  </p>
                  <div className="cp-command-grid">
                    {commandCards.map((c) => (
                      <div key={c.command} className="cp-command-card">
                        <div className="cp-command-copy">
                          <strong className="cp-command-title">{c.name}</strong>
                          <p className="cp-command-desc">{c.description}</p>
                        </div>
                        {getCurrentLanguage() === "zh-CN" ? (
                          <button
                            type="button"
                            className="cp-command-name cp-command-name--copy"
                            title={`/${c.command}`}
                            aria-label={t(
                              "customize.copyCommand",
                              "Copy command /{command}",
                              { command: c.command },
                            )}
                            onClick={() => void handleCopyCommand(c.command)}
                          >
                            {copiedCommand === c.command ? (
                              <Check size={12} strokeWidth={1.7} />
                            ) : (
                              <Copy size={12} strokeWidth={1.7} />
                            )}
                            {copiedCommand === c.command
                              ? t("common.copied", "Copied")
                              : t("customize.copyCommandShort", "Copy command")}
                          </button>
                        ) : (
                          <span className="cp-command-name">/{c.command}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {commandCards.length === 0 && (
                    <p className="cp-tab-empty">
                      {t(
                        "customize.commands.empty",
                        "No commands in this pack",
                      )}
                    </p>
                  )}
                </>
              )}

              {(managementOnly || detailTab === "skills") && (
                <div className="cp-skill-list">
                  {activePack.skills.map((s) => {
                    const localizedSkill = getLocalizedSkillText(s);
                    return (
                      <div
                        key={s.id}
                        className={`cp-skill-row ${s.enabled === false ? "cp-skill-row--disabled" : ""}`}
                      >
                        <span className="cp-skill-icon">
                          {s.icon || <Zap size={16} strokeWidth={1.5} />}
                        </span>
                        <div className="cp-skill-info">
                          <span className="cp-skill-name">
                            {localizedSkill.name}
                          </span>
                          <span className="cp-skill-desc">
                            {localizedSkill.description}
                          </span>
                        </div>
                        <label className="cp-toggle cp-skill-toggle">
                          <input
                            type="checkbox"
                            checked={s.enabled !== false}
                            onChange={(e) =>
                              handleSkillToggle(
                                activePack.name,
                                s.id,
                                e.target.checked,
                              )
                            }
                          />
                          <span className="cp-toggle-slider" />
                        </label>
                      </div>
                    );
                  })}
                  {activePack.skills.length === 0 && (
                    <p className="cp-tab-empty">
                      {t("customize.skills.empty", "No skills in this pack")}
                    </p>
                  )}
                </div>
              )}

              {!managementOnly && detailTab === "agents" && (
                <div className="cp-agent-list">
                  {activePack.agentRoles.map((a) => {
                    const localizedAgent = getLocalizedSkillText({
                      id: a.name,
                      name: a.displayName,
                      description: a.description,
                    });
                    return (
                      <div key={a.name} className="cp-agent-row">
                        <span className="cp-agent-icon">
                          {a.icon
                            ? (() => {
                                const Icon = getEmojiIcon(a.icon);
                                return <Icon size={18} strokeWidth={2} />;
                              })()
                            : null}
                        </span>
                        <div className="cp-agent-info">
                          <span className="cp-agent-name">
                            {localizedAgent.name}
                          </span>
                          <span className="cp-agent-desc">
                            {localizedAgent.description}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {activePack.personaTemplateId && (
                    <div className="cp-agent-twin">
                      <span className="cp-agent-icon">
                        <Dna size={18} strokeWidth={1.5} />
                      </span>
                      <div className="cp-agent-info">
                        <span className="cp-agent-name">
                          {t(
                            "customize.persona.available",
                            "Agent Persona Available",
                          )}
                        </span>
                        <span className="cp-agent-desc">
                          {t(
                            "customize.persona.description",
                            "This pack includes an optional digital twin persona. Activate it from Agent Personas as a preset; core automation is configured separately.",
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  {activePack.agentRoles.length === 0 &&
                    !activePack.personaTemplateId && (
                      <p className="cp-tab-empty">
                        {t("customize.agents.empty", "No agents in this pack")}
                      </p>
                    )}
                </div>
              )}
            </div>

            {/* Try asking section */}
            {!managementOnly &&
              activePack.tryAsking &&
              activePack.tryAsking.length > 0 && (
                <div className="cp-try-asking">
                  <h4>{t("customize.tryAsking", "Try asking ..")}</h4>
                  <div className="cp-try-list">
                    {activePack.tryAsking.map((prompt, i) => {
                      const localizedPrompt = getLocalizedPluginTryAskingPrompt(
                        activePack.name,
                        prompt,
                        i,
                        getCurrentLanguage(),
                        commandCards[i]?.name,
                      );
                      return (
                        <button
                          key={i}
                          className="cp-try-item"
                          onClick={() => handleTryAsking(localizedPrompt)}
                        >
                          <span>{localizedPrompt}</span>
                          <span className="cp-try-arrow">&rarr;</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {quarantinedPacks.length > 0 && (
              <div className="cp-try-asking">
                <h4>
                  {t("customize.quarantine.title", "Quarantined Imports")}
                </h4>
                <div className="cp-try-list">
                  {quarantinedPacks.map((record) => (
                    <div
                      key={record.id}
                      className="cp-try-item"
                      style={{ display: "block", cursor: "default" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div>
                          <strong>
                            {record.displayName || record.bundleId}
                          </strong>
                          <div>{record.summary}</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="button-secondary button-small"
                            onClick={() =>
                              setExpandedReportId((current) =>
                                current === record.id ? null : record.id,
                              )
                            }
                          >
                            {expandedReportId === record.id
                              ? t(
                                  "customize.quarantine.hideReport",
                                  "Hide Report",
                                )
                              : t(
                                  "customize.quarantine.viewReport",
                                  "View Report",
                                )}
                          </button>
                          <button
                            className="button-secondary button-small"
                            onClick={() => handleRetryQuarantined(record.id)}
                            disabled={actioningRecordId === record.id}
                          >
                            {actioningRecordId === record.id
                              ? t(
                                  "customize.quarantine.scanning",
                                  "Scanning...",
                                )
                              : t(
                                  "customize.quarantine.retryScan",
                                  "Retry Scan",
                                )}
                          </button>
                          <button
                            className="button-danger button-small"
                            onClick={() => handleRemoveQuarantined(record.id)}
                            disabled={actioningRecordId === record.id}
                          >
                            {t("common.remove", "Remove")}
                          </button>
                        </div>
                      </div>
                      {expandedReportId === record.id && (
                        <div style={{ marginTop: 8 }}>
                          {record.report.findings.map((finding, index) => (
                            <div key={`${record.id}-${index}`}>
                              <strong>{finding.severity}</strong>:{" "}
                              {finding.message}
                              {finding.path ? ` (${finding.path})` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Plugin Store Modal */}
      {showStore && (
        <PluginStore
          onClose={() => setShowStore(false)}
          onInstalled={() => setLoadKey((k) => k + 1)}
        />
      )}

      <style>{`
        .cp-container {
          display: flex;
          height: 100%;
          min-height: 0;
          gap: 24px;
          padding: 32px 40px;
          background: transparent;
          color: var(--color-text-primary);
        }

        /* Search */
        .cp-search-wrapper {
          position: relative;
          padding: 0 14px 10px;
        }

        .cp-search-input {
          width: 100%;
          padding: 9px 30px 9px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          background: var(--color-bg-glass);
          color: var(--color-text-primary);
          font-size: 13px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .cp-search-input:focus {
          border-color: var(--color-accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 14%, transparent);
          background: var(--color-bg-elevated);
        }

        .cp-search-input::placeholder {
          color: var(--color-text-muted);
        }

        .cp-search-clear {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(calc(-50% - 4px));
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: 14px;
          cursor: pointer;
          padding: 0 2px;
          line-height: 1;
        }

        .cp-search-clear:hover {
          color: var(--color-text-primary);
        }

        /* Sidebar */
        .cp-sidebar {
          width: 280px;
          min-width: 280px;
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-xl);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-glass) 100%);
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding: 18px 0;
          scrollbar-width: none;
        }

        .cp-sidebar::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .cp-sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 2px 18px 12px;
        }

        .cp-store-btn {
          width: 32px;
          height: 32px;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg-glass);
          color: var(--color-text-secondary);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .cp-store-btn:hover {
          color: var(--color-accent);
          border-color: var(--color-accent-subtle);
          background: var(--color-accent-subtle);
          transform: translateY(-1px);
        }

        .cp-sidebar-header h3 {
          font-size: 17px;
          font-weight: 600;
          margin: 0;
          color: var(--color-text-primary);
        }

        .cp-sidebar-note {
          margin: -4px 18px 14px;
          color: var(--color-text-muted);
          font-size: 13px;
          line-height: 1.45;
        }

        .cp-sidebar-section {
          padding: 0;
          margin-bottom: 8px;
        }

        .cp-sidebar-group-header {
          padding: 16px 18px 8px;
          font-size: 11px;
          font-weight: 600;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .cp-sidebar-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 10px;
          padding: 10px 12px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 14px;
          color: var(--color-text-secondary);
          font-size: 13px;
          line-height: 20px;
          cursor: pointer;
          text-align: left;
          margin: 2px 12px;
          width: calc(100% - 24px);
          transition: background 0.18s ease, border-color 0.18s ease, transform 0.18s ease, color 0.18s ease;
        }

        .cp-sidebar-item > span:nth-child(2) {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 20px;
        }

        .cp-pack-indicators {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          flex: 0 0 auto;
          margin-left: auto;
        }

        .cp-sidebar-item:hover {
          border-color: var(--color-border-light);
          background: var(--color-bg-glass-hover);
          color: var(--color-text-primary);
          transform: translateX(2px);
        }

        .cp-sidebar-item--active {
          border-color: color-mix(in srgb, var(--color-accent) 42%, transparent);
          background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent-subtle) 72%, transparent), var(--color-bg-glass));
          color: var(--color-text-primary);
          font-weight: 600;
        }

        .cp-sidebar-item--nav {
          color: var(--color-text-primary);
        }

        .cp-sidebar-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          line-height: 1;
          width: 26px;
          min-width: 26px;
          height: 26px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--color-accent-subtle) 62%, transparent);
          color: var(--color-accent);
          flex-shrink: 0;
        }

        /* Detail panel */
        .cp-detail {
          flex: 1;
          overflow-y: auto;
          padding: 8px 8px 24px;
          min-width: 0;
          max-width: 1100px;
          scrollbar-width: none;
          animation: dp-fade-in 0.6s ease-out;
        }

        .cp-detail::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }

        .cp-empty {
          color: var(--color-text-muted);
          font-size: 14px;
          padding: 40px 0;
          text-align: center;
        }

        .cp-error {
          color: var(--color-text-danger, #ef4444);
        }

        .cp-detail-header {
          margin-bottom: 28px;
          padding: 24px 28px 22px;
          border: 1px solid var(--color-border-light);
          border-radius: var(--radius-xl);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, color-mix(in srgb, var(--color-bg-elevated) 80%, var(--color-accent-subtle)) 100%);
          box-shadow: var(--shadow-lg), var(--shadow-glow);
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
          -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
        }

        .cp-detail-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .cp-detail-title-row h2 {
          font-family: var(--font-ui);
          font-size: 22px;
          font-weight: 600;
          margin: 0;
          color: var(--color-text);
        }

        .cp-detail-description {
          font-size: 15px;
          color: var(--color-text-secondary);
          margin: 0 0 16px;
          line-height: 1.6;
          max-width: 940px;
        }

        .cp-pack-status-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: -2px 0 10px;
        }

        .cp-pack-status {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 3px 9px;
          font-size: 11px;
          font-weight: 650;
          border: 1px solid transparent;
        }

        .cp-pack-status.enabled {
          color: var(--color-accent);
          background: var(--color-accent-subtle);
          border-color: color-mix(in srgb, var(--color-accent) 30%, transparent);
        }

        .cp-pack-status.disabled {
          color: var(--color-text-muted);
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border-subtle);
        }

        .cp-detail-twin-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: var(--color-accent-subtle, rgba(17, 24, 39, 0.1));
          color: var(--color-accent);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
        }

        .cp-detail-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Best-fit workflow badges */
        .cp-best-fit-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .cp-best-fit-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .cp-best-fit-badge--support_ops {
          background: rgba(17, 24, 39, 0.15);
          color: #374151;
          border: 1px solid rgba(17, 24, 39, 0.3);
        }

        .cp-best-fit-badge--it_ops {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .cp-best-fit-badge--sales_ops {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        /* Outcome examples */
        .cp-outcome-examples {
          margin-top: 14px;
        }

        .cp-outcome-list {
          margin: 6px 0 0 0;
          padding-left: 18px;
          list-style: disc;
        }

        .cp-outcome-item {
          font-size: 13px;
          color: var(--color-text-secondary);
          line-height: 1.6;
          margin-bottom: 2px;
        }

        /* Recommended connectors */
        .cp-recommended-connectors {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 14px;
        }

        .cp-rc-label {
          font-size: 13px;
          color: var(--color-text-muted);
          margin-right: 2px;
        }

        .cp-rc-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 999px;
          background: var(--color-bg-glass);
          color: var(--color-text-secondary);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cp-rc-chip:hover {
          border-color: var(--color-accent, #1e8df6);
          color: var(--color-accent, #1e8df6);
          background: var(--color-accent-subtle, rgba(17, 24, 39, 0.1));
        }

        /* Update indicators */
        .cp-update-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-warning, #f59e0b);
          flex: 0 0 8px;
          min-width: 8px;
          flex-shrink: 0;
        }

        .cp-disabled-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-text-muted);
          flex: 0 0 8px;
          min-width: 8px;
          opacity: 0.7;
        }

        .cp-update-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 10px;
          background: rgba(245, 158, 11, 0.12);
          color: var(--color-warning, #f59e0b);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          margin-top: 6px;
        }

        /* Toggle switch */
        .cp-toggle {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
          cursor: pointer;
        }

        .cp-toggle input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .cp-toggle-slider {
          position: absolute;
          inset: 0;
          background: var(--color-bg-tertiary);
          border-radius: 999px;
          transition: background 0.2s;
        }

        .cp-toggle-slider::before {
          content: "";
          position: absolute;
          width: 20px;
          height: 20px;
          left: 2px;
          top: 2px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }

        .cp-toggle input:checked + .cp-toggle-slider {
          background: var(--color-accent, #1e8df6);
        }

        .cp-toggle input:checked + .cp-toggle-slider::before {
          transform: translateX(20px);
        }

        .cp-toggle input:disabled + .cp-toggle-slider {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* Tabs */
        .cp-tabs {
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: none;
          margin: 0 0 18px;
        }

        .cp-tab {
          padding: 8px 14px;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border-subtle);
          border-radius: 999px;
          color: var(--color-text-muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .cp-tab:hover {
          color: var(--color-text-primary);
          border-color: var(--color-border-light);
          background: var(--color-bg-glass-hover);
        }

        .cp-tab--active {
          color: var(--color-accent);
          border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);
          background: var(--color-accent-subtle);
        }

        .cp-tab-content {
          min-height: 100px;
        }

        .cp-tab-hint {
          font-size: 13px;
          color: var(--color-text-muted);
          margin: 0 0 18px;
          line-height: 1.4;
        }

        .cp-tab-empty {
          color: var(--color-text-muted);
          font-size: 13px;
          font-style: italic;
        }

        /* Command cards */
        .cp-command-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 14px;
        }

        .cp-command-card {
          min-height: 156px;
          padding: 22px 24px;
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-bg-glass) 0%, var(--color-accent-subtle) 100%);
          cursor: default;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 18px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .cp-command-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
          pointer-events: none;
        }

        .cp-command-card:hover {
          border-color: var(--color-accent-subtle);
          background: linear-gradient(135deg, var(--color-bg-glass-hover) 0%, color-mix(in srgb, var(--color-accent-subtle) 80%, white 20%) 100%);
          box-shadow: var(--shadow-lg), 0 10px 20px -10px color-mix(in srgb, var(--color-accent) 20%, transparent);
          transform: translateY(-3px);
        }

        .cp-command-desc {
          font-size: 14px;
          color: var(--color-text-primary);
          margin: 0;
          line-height: 1.5;
        }

        .cp-command-name {
          font-size: 12px;
          color: var(--color-text-muted);
          font-family: var(--font-mono);
          overflow-wrap: anywhere;
        }

        /* Skill list */
        .cp-skill-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .cp-skill-row {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) auto;
          align-items: center;
          gap: 16px;
          padding: 18px 20px;
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-glass) 100%);
          transition: all 0.25s ease;
        }

        .cp-skill-row:hover {
          border-color: var(--color-accent-subtle);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-hover) 100%);
          transform: translateX(4px);
          box-shadow: var(--shadow-md);
        }

        .cp-skill-row--disabled {
          opacity: 0.5;
        }

        .cp-skill-toggle {
          margin-left: auto;
          flex-shrink: 0;
        }

        .cp-skill-icon {
          font-size: 16px;
          width: 44px;
          height: 44px;
          border-radius: var(--radius-lg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border-subtle);
          color: var(--color-accent);
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
        }

        .cp-skill-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .cp-skill-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .cp-skill-desc {
          font-size: 13px;
          color: var(--color-text-muted);
          line-height: 1.45;
        }

        /* Agent list */
        .cp-agent-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .cp-agent-row,
        .cp-agent-twin {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr);
          align-items: flex-start;
          gap: 16px;
          padding: 18px 20px;
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-lg);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-glass) 100%);
          transition: all 0.25s ease;
        }

        .cp-agent-row:hover,
        .cp-agent-twin:hover {
          border-color: var(--color-accent-subtle);
          background: linear-gradient(135deg, var(--color-bg-elevated) 0%, var(--color-bg-hover) 100%);
          transform: translateX(4px);
          box-shadow: var(--shadow-md);
        }

        .cp-agent-twin {
          border-style: dashed;
          background: linear-gradient(135deg, var(--color-accent-subtle), var(--color-bg-glass));
        }

        .cp-agent-icon {
          font-size: 18px;
          width: 44px;
          height: 44px;
          border-radius: var(--radius-lg);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-glass);
          border: 1px solid var(--color-border-subtle);
          color: var(--color-accent);
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
        }

        .cp-agent-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .cp-agent-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .cp-agent-desc {
          font-size: 13px;
          color: var(--color-text-muted);
          line-height: 1.45;
        }

        /* Try asking section */
        .cp-try-asking {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--color-border-subtle);
        }

        .cp-try-asking h4 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 12px;
          color: var(--color-text-primary);
        }

        .cp-try-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .cp-try-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          background: none;
          border: none;
          border-bottom: 1px solid var(--color-border-subtle);
          color: var(--color-text-primary);
          font-size: 14px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          transition: color 0.15s;
        }

        .cp-try-item:last-child {
          border-bottom: none;
        }

        .cp-try-item:hover {
          color: var(--color-accent);
        }

        .cp-try-arrow {
          color: var(--color-text-muted);
          font-size: 16px;
          flex-shrink: 0;
          margin-left: 12px;
          transition: color 0.15s;
        }

        .cp-try-item:hover .cp-try-arrow {
          color: var(--color-accent);
        }

        @media (max-width: 980px) {
          .cp-container {
            flex-direction: column;
            padding: 20px;
            gap: 16px;
          }

          .cp-sidebar {
            width: 100%;
            min-width: 0;
            max-height: 300px;
          }

          .cp-detail {
            max-width: none;
            padding: 0 0 20px;
          }

          .cp-command-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .cp-container {
            padding: 12px;
          }

          .cp-detail-header {
            padding: 20px;
          }

          .cp-detail-title-row,
          .cp-pack-status-row,
          .cp-recommended-connectors {
            align-items: flex-start;
          }

          .cp-detail-title-row {
            gap: 12px;
          }

          .cp-tabs {
            overflow-x: auto;
            padding-bottom: 2px;
          }

          .cp-skill-row {
            grid-template-columns: 38px minmax(0, 1fr);
          }

          .cp-skill-toggle {
            grid-column: 2;
            justify-self: start;
            margin-left: 0;
          }

          .cp-agent-row,
          .cp-agent-twin {
            grid-template-columns: 38px minmax(0, 1fr);
          }

          .cp-skill-icon,
          .cp-agent-icon {
            width: 38px;
            height: 38px;
          }
        }

        /*
         * Compact product-settings treatment.
         * Keep this block last so the feature-pack surface follows the same
         * restrained density and hierarchy as the rest of the settings UI.
         */
        .cp-container {
          display: grid;
          grid-template-columns: 252px minmax(0, 860px);
          align-items: start;
          justify-content: start;
          gap: 28px;
          height: 100%;
          padding: 20px 28px 32px;
          font-family: var(--font-ui);
        }

        .cp-sidebar {
          width: auto;
          min-width: 0;
          max-height: 100%;
          padding: 0 16px 24px 0;
          border: 0;
          border-right: 1px solid var(--color-border-subtle);
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          scrollbar-width: thin;
          scrollbar-color: var(--color-border) transparent;
        }

        .cp-sidebar::-webkit-scrollbar {
          display: block;
          width: 5px;
        }

        .cp-sidebar::-webkit-scrollbar-thumb {
          border-radius: 5px;
          background: var(--color-border);
        }

        .cp-sidebar-header {
          padding: 0 6px 8px;
        }

        .cp-sidebar-header h3 {
          font-size: 15px;
          font-weight: 650;
          letter-spacing: -0.01em;
        }

        .cp-store-btn {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: transparent;
          font-size: 15px;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }

        .cp-store-btn:hover {
          color: var(--color-text-primary);
          border-color: var(--color-border-light);
          background: var(--color-bg-hover);
          transform: none;
        }

        .cp-sidebar-note {
          margin: 0 6px 12px;
          font-size: 12px;
          line-height: 1.45;
        }

        .cp-search-wrapper {
          padding: 0 4px 10px;
        }

        .cp-search-input {
          height: 34px;
          padding: 7px 28px 7px 10px;
          border-radius: 8px;
          background: var(--color-bg-input);
          font-size: 12.5px;
          transition: border-color 0.12s ease, box-shadow 0.12s ease;
        }

        .cp-search-input:focus {
          background: var(--color-bg-input);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent) 12%, transparent);
        }

        .cp-search-clear {
          right: 10px;
        }

        .cp-sidebar-section {
          margin-bottom: 5px;
        }

        .cp-sidebar-group-header {
          padding: 13px 8px 5px;
          color: var(--color-text-muted);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0;
          text-transform: none;
        }

        .cp-sidebar-item {
          width: 100%;
          min-height: 34px;
          margin: 1px 0;
          padding: 6px 8px;
          gap: 8px;
          border: 0;
          border-radius: 8px;
          font-size: 13px;
          line-height: 20px;
          transition: background 0.12s ease, color 0.12s ease;
        }

        .cp-sidebar-item:hover {
          border-color: transparent;
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
          transform: none;
        }

        .cp-sidebar-item--active {
          border-color: transparent;
          background: var(--color-accent-subtle);
          color: var(--color-accent);
          font-weight: 600;
        }

        .cp-sidebar-icon {
          width: 24px;
          min-width: 24px;
          height: 24px;
          border-radius: 7px;
          background: var(--color-bg-secondary);
          font-size: 14px;
        }

        .cp-sidebar-item--active .cp-sidebar-icon {
          background: color-mix(in srgb, var(--color-accent) 11%, var(--color-bg-elevated));
        }

        .cp-pack-indicators {
          gap: 5px;
        }

        .cp-update-dot,
        .cp-disabled-dot {
          width: 6px;
          min-width: 6px;
          height: 6px;
          flex-basis: 6px;
        }

        .cp-detail {
          width: 100%;
          max-width: 860px;
          padding: 0 0 24px;
          animation: none;
          scrollbar-width: thin;
          scrollbar-color: var(--color-border) transparent;
        }

        .cp-detail::-webkit-scrollbar {
          display: block;
          width: 5px;
        }

        .cp-detail::-webkit-scrollbar-thumb {
          border-radius: 5px;
          background: var(--color-border);
        }

        .cp-empty {
          padding: 48px 20px;
          border: 1px dashed var(--color-border);
          border-radius: 10px;
          background: var(--color-bg-subtle);
          font-size: 13px;
        }

        .cp-detail-header {
          margin-bottom: 16px;
          padding: 18px 20px;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg-elevated);
          box-shadow: none;
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }

        .cp-detail-title-row {
          margin-bottom: 4px;
        }

        .cp-detail-title-row h2 {
          color: var(--color-text-primary);
          font-size: 18px;
          font-weight: 650;
          letter-spacing: -0.015em;
        }

        .cp-detail-description {
          max-width: 72ch;
          margin: 0 0 12px;
          color: var(--color-text-secondary);
          font-size: 13px;
          line-height: 1.55;
        }

        .cp-pack-status-row {
          margin: 0 0 10px;
        }

        .cp-pack-status,
        .cp-detail-twin-badge,
        .cp-update-badge {
          border-radius: 6px;
        }

        .cp-pack-status {
          padding: 2px 7px;
          font-size: 10.5px;
        }

        .cp-detail-twin-badge {
          padding: 3px 8px;
          font-size: 11px;
        }

        .cp-update-badge {
          padding: 3px 8px;
          font-size: 11px;
        }

        .cp-best-fit-row,
        .cp-recommended-connectors {
          gap: 5px;
          margin-top: 10px;
        }

        .cp-rc-label {
          font-size: 12px;
        }

        .cp-best-fit-badge {
          padding: 3px 7px;
          border-radius: 6px;
          font-size: 10.5px;
          letter-spacing: 0;
          text-transform: none;
        }

        .cp-best-fit-badge--support_ops,
        .cp-best-fit-badge--it_ops,
        .cp-best-fit-badge--sales_ops {
          color: var(--color-text-secondary);
          border-color: var(--color-border);
          background: var(--color-bg-secondary);
        }

        .cp-outcome-examples {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--color-border-subtle);
        }

        .cp-outcome-list {
          margin-top: 5px;
        }

        .cp-outcome-item {
          margin-bottom: 2px;
          font-size: 12.5px;
          line-height: 1.5;
        }

        .cp-rc-chip {
          min-height: 26px;
          padding: 4px 8px;
          border-radius: 7px;
          background: var(--color-bg-secondary);
          font-size: 11.5px;
          transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
        }

        .cp-toggle {
          width: 36px;
          height: 20px;
        }

        .cp-toggle-slider::before {
          width: 16px;
          height: 16px;
        }

        .cp-toggle input:checked + .cp-toggle-slider::before {
          transform: translateX(16px);
        }

        .cp-tabs {
          gap: 0;
          margin: 0 0 14px;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .cp-tab {
          margin-bottom: -1px;
          padding: 8px 12px;
          border: 0;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          background: transparent;
          font-size: 12.5px;
          font-weight: 600;
          transition: color 0.12s ease, border-color 0.12s ease;
        }

        .cp-tab:hover {
          border-color: transparent;
          background: transparent;
          color: var(--color-text-primary);
        }

        .cp-tab--active,
        .cp-tab--active:hover {
          border-bottom-color: var(--color-accent);
          background: transparent;
          color: var(--color-accent);
        }

        .cp-tab-hint {
          max-width: 74ch;
          margin-bottom: 12px;
          font-size: 12.5px;
          line-height: 1.5;
        }

        .cp-command-grid,
        .cp-skill-list,
        .cp-agent-list {
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow: hidden;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          background: var(--color-bg-elevated);
        }

        .cp-command-card {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 16px;
          min-height: 0;
          padding: 13px 15px;
          overflow: visible;
          border: 0;
          border-bottom: 1px solid var(--color-border-subtle);
          border-radius: 0;
          background: transparent;
          transition: background 0.12s ease;
        }

        .cp-command-card:last-child {
          border-bottom: 0;
        }

        .cp-command-card::before {
          display: none;
        }

        .cp-command-card:hover {
          border-color: var(--color-border-subtle);
          background: var(--color-bg-hover);
          box-shadow: none;
          transform: none;
        }

        .cp-command-desc {
          margin: 3px 0 0;
          font-size: 13px;
          line-height: 1.45;
        }

        .cp-command-copy {
          min-width: 0;
        }

        .cp-command-title {
          display: block;
          color: var(--color-text-primary);
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }

        .cp-command-name {
          padding: 3px 6px;
          border-radius: 5px;
          background: var(--color-bg-secondary);
          color: var(--color-text-secondary);
          font-size: 11.5px;
          white-space: nowrap;
        }

        .cp-command-name--copy {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border: 0;
          font-family: inherit;
          line-height: 1.4;
          cursor: pointer;
        }

        .cp-command-name--copy:hover {
          color: var(--color-accent);
          background: var(--color-accent-subtle);
        }

        .cp-skill-row,
        .cp-agent-row,
        .cp-agent-twin {
          padding: 11px 13px;
          border: 0;
          border-bottom: 1px solid var(--color-border-subtle);
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          transition: background 0.12s ease;
        }

        .cp-skill-row {
          grid-template-columns: 32px minmax(0, 1fr) auto;
          gap: 11px;
        }

        .cp-agent-row,
        .cp-agent-twin {
          grid-template-columns: 32px minmax(0, 1fr);
          gap: 11px;
        }

        .cp-skill-row:last-child,
        .cp-agent-row:last-child,
        .cp-agent-twin:last-child {
          border-bottom: 0;
        }

        .cp-skill-row:hover,
        .cp-agent-row:hover,
        .cp-agent-twin:hover {
          border-color: var(--color-border-subtle);
          background: var(--color-bg-hover);
          box-shadow: none;
          transform: none;
        }

        .cp-agent-twin {
          border-style: solid;
          background: var(--color-bg-subtle);
        }

        .cp-skill-icon,
        .cp-agent-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--color-bg-secondary);
          box-shadow: none;
        }

        .cp-skill-name,
        .cp-agent-name {
          font-size: 13.5px;
          font-weight: 600;
        }

        .cp-skill-desc,
        .cp-agent-desc {
          font-size: 12px;
          line-height: 1.4;
        }

        .cp-try-asking {
          margin-top: 18px;
          padding-top: 16px;
        }

        .cp-try-asking h4 {
          margin-bottom: 9px;
          font-size: 13px;
        }

        .cp-try-list {
          overflow: hidden;
          border: 1px solid var(--color-border);
          border-radius: 10px;
          background: var(--color-bg-elevated);
        }

        .cp-try-item {
          min-height: 42px;
          padding: 10px 13px;
          font-size: 12.5px;
          transition: background 0.12s ease, color 0.12s ease;
        }

        .cp-try-item:hover {
          background: var(--color-bg-hover);
        }

        .cp-container--management .cp-detail-header {
          padding-bottom: 18px;
        }

        .cp-container--management .cp-tab-content {
          padding-top: 18px;
        }

        .cp-management-intro {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 14px;
          padding: 15px 16px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          background: var(--color-bg-secondary);
        }

        .cp-management-intro > div:first-child {
          display: flex;
          max-width: 540px;
          flex-direction: column;
          gap: 4px;
        }

        .cp-management-intro strong {
          color: var(--color-text-primary);
          font-size: 14px;
        }

        .cp-management-intro span {
          color: var(--color-text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }

        .cp-management-counts {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .cp-management-counts > span {
          padding: 6px 8px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-bg-elevated);
          white-space: nowrap;
        }

        .cp-management-counts strong {
          color: var(--color-accent);
        }

        @media (max-width: 1080px) {
          .cp-container {
            grid-template-columns: 220px minmax(0, 1fr);
            gap: 20px;
            padding: 18px 20px 28px;
          }
        }

        @media (max-width: 760px) {
          .cp-container {
            grid-template-columns: 1fr;
            gap: 18px;
            padding: 14px;
          }

          .cp-sidebar {
            width: 100%;
            max-height: 320px;
            padding: 0 0 14px;
            border-right: 0;
            border-bottom: 1px solid var(--color-border-subtle);
          }

          .cp-detail {
            max-width: none;
          }

          .cp-command-card {
            grid-template-columns: 1fr;
            gap: 7px;
          }

          .cp-command-name {
            justify-self: start;
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
