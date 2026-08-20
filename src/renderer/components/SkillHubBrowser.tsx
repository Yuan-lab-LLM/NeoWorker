import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, FolderOpen, Search, Trash2 } from "lucide-react";
import {
  CapabilitySecurityReport,
  CustomSkill,
  InstallSecurityOutcome,
  QuarantinedImportRecord,
  SkillRegistryEntry,
  SkillStatusReport,
  SkillStatusEntry,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";
import {
  getLocalizedSkillSource,
  getLocalizedSkillTag,
  getLocalizedSkillText,
} from "../utils/localized-skills";
import { getSemanticIconVisual } from "../utils/semantic-icon-map";
import { notifySkillInventoryUpdated } from "../utils/skill-inventory-events";
import { isSkillVisibleForCurrentProductSupport } from "../utils/product-availability";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function isLikelyGitSkillSource(rawValue: string): boolean {
  const value = rawValue.trim();
  if (!value) {
    return false;
  }

  if (/^git@/i.test(value) || /^github:/i.test(value)) {
    return true;
  }

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathParts = parsed.pathname
      .replace(/\/+$/g, "")
      .split("/")
      .filter(Boolean);
    const lastSegment = pathParts[pathParts.length - 1]?.toLowerCase() || "";
    return (
      lastSegment.endsWith(".git") ||
      host === "github.com" ||
      host.endsWith(".github.com")
    );
  } catch {
    return false;
  }
}

function formatCompactCount(value?: number): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return compactNumberFormatter.format(value);
}

function isClawHubSkillSource(rawValue: string): boolean {
  const value = rawValue.trim();
  if (!value) {
    return false;
  }

  if (/^clawhub:/i.test(value)) {
    return true;
  }

  if (!/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathParts = parsed.pathname
      .replace(/\/+$/g, "")
      .split("/")
      .filter(Boolean);
    return (
      host === "clawhub.ai" &&
      pathParts.length >= 2 &&
      pathParts[0] !== "skills"
    );
  } catch {
    return false;
  }
}

function getClawHubSlug(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  if (/^clawhub:/i.test(value)) {
    const slug = value.slice("clawhub:".length).trim().toLowerCase();
    return slug || null;
  }

  if (!/^https?:\/\//i.test(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "clawhub.ai") {
      return null;
    }
    const pathParts = parsed.pathname
      .replace(/\/+$/g, "")
      .split("/")
      .filter(Boolean);
    if (pathParts.length === 0 || pathParts[0] === "skills") {
      return null;
    }
    return pathParts[pathParts.length - 1]?.toLowerCase() || null;
  } catch {
    return null;
  }
}

interface SkillHubBrowserProps {
  onSkillInstalled?: (skill: CustomSkill) => void;
  onClose?: () => void;
}

export function SkillHubBrowser({
  onSkillInstalled,
  onClose,
}: SkillHubBrowserProps) {
  useLanguage();
  const t = translate;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SkillRegistryEntry[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [clawHubQuery, setClawHubQuery] = useState("");
  const [clawHubResults, setClawHubResults] = useState<SkillRegistryEntry[]>(
    [],
  );
  const [isSearchingClawHub, setIsSearchingClawHub] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillRegistryEntry | null>(
    null,
  );
  const [installedSkills, setInstalledSkills] = useState<Set<string>>(
    new Set(),
  );
  const [skillStatus, setSkillStatus] = useState<SkillStatusReport | null>(
    null,
  );
  const [installing, setInstalling] = useState<string | null>(null);
  const [externalSource, setExternalSource] = useState("");
  const [installedQuery, setInstalledQuery] = useState("");
  const [installedFilter, setInstalledFilter] = useState<
    "all" | "ready" | "attention"
  >("all");
  const [error, setError] = useState<string | null>(null);
  const [quarantinedSkills, setQuarantinedSkills] = useState<
    QuarantinedImportRecord[]
  >([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"browse" | "clawhub">("browse");
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadSkillStatus();
  }, []);

  const loadSkillStatus = async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    }
    try {
      const status = await window.electronAPI.getSkillStatus();
      const quarantine = await window.electronAPI.listQuarantinedImports();
      const visibleSkills = status.skills.filter(
        isSkillVisibleForCurrentProductSupport,
      );
      setSkillStatus({
        ...status,
        skills: visibleSkills,
        summary: {
          total: visibleSkills.length,
          eligible: visibleSkills.filter(
            (skill) => skill.eligible && !skill.disabled,
          ).length,
          disabled: visibleSkills.filter((skill) => skill.disabled).length,
          missingRequirements: visibleSkills.filter(
            (skill) => !skill.eligible && !skill.disabled,
          ).length,
        },
      });
      setQuarantinedSkills(
        quarantine.filter((entry) => entry.bundleKind === "skill"),
      );

      const installed = new Set<string>();
      visibleSkills.forEach((skill) => {
        if (skill.source === "managed") {
          installed.add(skill.id);
          const clawHubSlug =
            getClawHubSlug(skill.metadata?.homepage || "") ||
            getClawHubSlug(skill.metadata?.repository || "");
          if (clawHubSlug) {
            installed.add(clawHubSlug);
          }
        }
      });
      setInstalledSkills(installed);
    } catch (err) {
      console.error("Failed to load skill status:", err);
      setError("Failed to load skill status");
    } finally {
      setIsLoadingStatus(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await window.electronAPI.reloadCustomSkills();
      await loadSkillStatus();
      notifySkillInventoryUpdated();
    } catch (err) {
      console.error("Failed to refresh skills:", err);
      setError("Failed to refresh skills");
    } finally {
      setIsRefreshing(false);
    }
  };

  const installMessageForOutcome = (
    outcome: InstallSecurityOutcome | undefined,
    fallback: string,
  ): string => {
    if (!outcome) {
      return fallback;
    }

    switch (outcome.state) {
      case "installed_with_warning":
        return outcome.summary || "Installed with security warning";
      case "quarantined":
        return outcome.summary || "Import quarantined";
      case "installed":
        return outcome.summary || fallback;
      default:
        return fallback;
    }
  };

  const getSecurityBadge = (report?: CapabilitySecurityReport) => {
    if (!report) {
      return null;
    }
    if (report.verdict === "quarantined") {
      return (
        <span className="settings-badge settings-badge--error">
          {t("skillhub.quarantine.badge", "Quarantined")}
        </span>
      );
    }
    if (report.verdict === "warning") {
      return (
        <span className="settings-badge settings-badge--warning">
          {t("skillhub.securityWarning", "Security Warning")}
        </span>
      );
    }
    return null;
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const result = await window.electronAPI.searchSkillRegistry(searchQuery);
      setSearchResults(
        result.results.filter(isSkillVisibleForCurrentProductSupport),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      setError(message);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleClawHubSearch = useCallback(async () => {
    setIsSearchingClawHub(true);
    setError(null);

    try {
      const trimmed = clawHubQuery.trim();
      const result = await window.electronAPI.searchClawHubSkills(
        trimmed,
        trimmed ? undefined : { pageSize: 10 },
      );
      setClawHubResults(
        result.results.filter(isSkillVisibleForCurrentProductSupport),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "ClawHub search failed";
      setError(message);
      setClawHubResults([]);
    } finally {
      setIsSearchingClawHub(false);
    }
  }, [clawHubQuery]);

  useEffect(() => {
    if (activeTab !== "clawhub" || clawHubQuery.trim()) {
      return;
    }

    void handleClawHubSearch();
  }, [activeTab, clawHubQuery, handleClawHubSearch]);

  const renderStatsLine = (skill: SkillRegistryEntry) => {
    const stars = formatCompactCount(skill.stars);
    const downloads = formatCompactCount(skill.downloads);
    const installsCurrent = formatCompactCount(skill.installsCurrent);
    const installsAllTime = formatCompactCount(skill.installsAllTime);
    const parts = [
      stars ? `⭐ ${stars}` : null,
      downloads
        ? t("skillhub.stats.downloads", "{count} downloads", {
            count: downloads,
          })
        : null,
      installsCurrent
        ? t("skillhub.stats.currentInstalls", "Current {count} installations", {
            count: installsCurrent,
          })
        : null,
      installsAllTime
        ? t(
            "skillhub.stats.allTimeInstalls",
            "Cumulative {count} installations",
            { count: installsAllTime },
          )
        : null,
    ].filter((value): value is string => Boolean(value));

    if (parts.length === 0) {
      return null;
    }

    return <p className="skillhub-meta">{parts.join(" · ")}</p>;
  };

  const installSucceeded = async (skill: CustomSkill) => {
    setInstalledSkills((prev) => new Set([...prev, skill.id]));
    onSkillInstalled?.(skill);
    await loadSkillStatus();
    notifySkillInventoryUpdated();
  };

  const handleInstall = async (skillId: string) => {
    setInstalling(skillId);
    setError(null);

    try {
      const result = await window.electronAPI.installSkillFromRegistry(skillId);

      if (result.success && result.skill) {
        await installSucceeded(result.skill);
      } else {
        setError(
          installMessageForOutcome(
            result.security,
            result.error || "Installation failed",
          ),
        );
        await loadSkillStatus();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Installation failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleClawHubInstall = async (skillId: string) => {
    setInstalling(skillId);
    setError(null);

    try {
      const result = await window.electronAPI.installSkillFromClawHub(skillId);

      if (result.success && result.skill) {
        await installSucceeded(result.skill);
      } else {
        setError(
          installMessageForOutcome(
            result.security,
            result.error || "Installation failed",
          ),
        );
        await loadSkillStatus();
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Installation failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleExternalInstall = async () => {
    const source = externalSource.trim();
    if (!source) {
      setError("Paste a Git repository, ClawHub URL, or raw skill URL first");
      return;
    }

    setInstalling("__external__");
    setError(null);

    try {
      const result = isClawHubSkillSource(source)
        ? await window.electronAPI.installSkillFromClawHub(source)
        : isLikelyGitSkillSource(source)
          ? await window.electronAPI.installSkillFromGit(source)
          : await window.electronAPI.installSkillFromUrl(source);

      if (result.success && result.skill) {
        setExternalSource("");
        await installSucceeded(result.skill);
      } else {
        setError(
          installMessageForOutcome(
            result.security,
            result.error || "Import failed",
          ),
        );
        await loadSkillStatus();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (skillId: string) => {
    if (!confirm(`Are you sure you want to uninstall "${skillId}"?`)) {
      return;
    }

    setInstalling(skillId);
    setError(null);

    try {
      const result = await window.electronAPI.uninstallSkill(skillId);

      if (result.success) {
        setInstalledSkills((prev) => {
          const next = new Set(prev);
          next.delete(skillId);
          return next;
        });
        await loadSkillStatus();
        notifySkillInventoryUpdated();
      } else {
        setError(result.error || "Uninstall failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Uninstall failed";
      setError(message);
    } finally {
      setInstalling(null);
    }
  };

  const handleOpenFolder = async () => {
    await window.electronAPI.openCustomSkillsFolder();
  };

  const handleRetryQuarantined = async (recordId: string) => {
    setInstalling(recordId);
    setError(null);
    try {
      const result = await window.electronAPI.retryQuarantinedImport(recordId);
      if (!result.success) {
        setError(result.outcome.summary || result.error || "Retry scan failed");
      } else {
        notifySkillInventoryUpdated();
      }
      await loadSkillStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Retry scan failed");
    } finally {
      setInstalling(null);
    }
  };

  const handleRemoveQuarantined = async (recordId: string) => {
    setInstalling(recordId);
    setError(null);
    try {
      const result = await window.electronAPI.removeQuarantinedImport(recordId);
      if (!result.success) {
        setError(result.error || "Failed to remove quarantined import");
      }
      await loadSkillStatus();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to remove quarantined import",
      );
    } finally {
      setInstalling(null);
    }
  };

  const getStatusBadge = (entry: SkillStatusEntry) => {
    if (entry.disabled) {
      return (
        <span className="settings-badge settings-badge--warning">
          {t("common.disabled", "Disabled")}
        </span>
      );
    }
    if (entry.eligible) {
      return (
        <span className="settings-badge settings-badge--success">
          {t("skillhub.status.ready", "Ready")}
        </span>
      );
    }
    if (entry.blockedByAllowlist) {
      return (
        <span className="settings-badge settings-badge--error">
          {t("skillhub.status.blocked", "Blocked")}
        </span>
      );
    }
    return (
      <span className="settings-badge settings-badge--neutral">
        {t("skillhub.status.missingRequirements", "Missing Requirements")}
      </span>
    );
  };

  const renderSkillIcon = (
    name: string,
    description?: string,
    category?: string,
  ) => {
    const { Icon, tone } = getSemanticIconVisual({
      name,
      description,
      category,
    });
    return (
      <span
        className="skillhub-icon semantic-icon"
        data-icon-tone={tone}
        aria-hidden="true"
      >
        <Icon size={18} strokeWidth={1.8} />
      </span>
    );
  };

  const renderSearchResults = (
    results: SkillRegistryEntry[],
    onInstall: (skillId: string) => void,
  ) => (
    <div className="skillhub-list">
      {results.map((skill) =>
        (() => {
          const localizedSkill = getLocalizedSkillText(skill);
          return (
            <div
              key={`${skill.source || "neoworker"}:${skill.id}`}
              className={`settings-card skillhub-card ${selectedSkill?.id === skill.id ? "is-selected" : ""}`}
              onClick={() => setSelectedSkill(skill)}
            >
              <div className="skillhub-card-header">
                <div className="skillhub-card-info">
                  {renderSkillIcon(
                    localizedSkill.name,
                    localizedSkill.description,
                    skill.category,
                  )}
                  <div>
                    <div className="skillhub-title-row">
                      <h4 className="skillhub-title">{localizedSkill.name}</h4>
                      {skill.source === "clawhub" && (
                        <span className="settings-badge settings-badge--outline">
                          ClawHub
                        </span>
                      )}
                    </div>
                    <p className="settings-description skillhub-description">
                      {localizedSkill.description}
                    </p>
                    {(skill.author || skill.version) && (
                      <p className="skillhub-meta">
                        {skill.author ? `${skill.author} · ` : ""}v
                        {skill.version}
                      </p>
                    )}
                    {renderStatsLine(skill)}
                  </div>
                </div>
                <div className="skillhub-card-actions">
                  {installedSkills.has(skill.id) ? (
                    <span className="settings-badge settings-badge--success">
                      {t("skillhub.installed", "Installed")}
                    </span>
                  ) : (
                    <button
                      className="button-primary button-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInstall(skill.id);
                      }}
                      disabled={installing === skill.id}
                    >
                      {installing === skill.id
                        ? t("skillhub.installing", "Installing...")
                        : t("skillhub.install", "Install")}
                    </button>
                  )}
                </div>
              </div>
              {skill.tags && skill.tags.length > 0 && (
                <div className="skillhub-tags">
                  {skill.tags.map((tag) => (
                    <span
                      key={tag}
                      className="settings-badge settings-badge--outline"
                    >
                      {getLocalizedSkillTag(tag)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })(),
      )}
    </div>
  );

  const renderExternalImportCard = () => (
    <div className="settings-card">
      <div className="settings-section-header">
        <div>
          <h4>{t("skillhub.importExternal.title", "Import External Skill")}</h4>
          <p className="settings-description">
            {t(
              "skillhub.importExternal.description",
              "Paste a Git repository, ClawHub skill page URL, raw skill JSON URL, or raw SKILL.md URL to bring third-party skills into NeoWorker.",
            )}
          </p>
        </div>
      </div>
      <div className="input-with-button">
        <input
          type="text"
          placeholder="https://clawhub.ai/owner/skill or https://github.com/org/skill-repo"
          className="settings-input"
          value={externalSource}
          onChange={(e) => setExternalSource(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleExternalInstall()}
        />
        <button
          className="button-primary button-small"
          onClick={handleExternalInstall}
          disabled={installing === "__external__"}
        >
          {installing === "__external__"
            ? t("skillhub.installing", "Installing...")
            : t("skillhub.import", "Import")}
        </button>
      </div>
    </div>
  );

  const renderBrowseTab = () => (
    <div className="skillhub-tab">
      {renderExternalImportCard()}

      <div className="input-with-button">
        <input
          type="text"
          placeholder={t(
            "skillhub.searchRegistry.placeholder",
            "Search NeoWorker registry...",
          )}
          className="settings-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <button
          className="button-secondary button-small"
          onClick={handleSearch}
          disabled={isSearching}
        >
          {isSearching
            ? t("common.searching", "Searching...")
            : t("common.search", "Search")}
        </button>
      </div>

      {searchQuery && !isSearching ? (
        searchResults.length > 0 ? (
          renderSearchResults(searchResults, handleInstall)
        ) : (
          <div className="settings-empty">
            {t(
              "skillhub.registry.empty",
              "No skills found. Try a different search term.",
            )}
          </div>
        )
      ) : searchQuery && isSearching ? (
        <div className="settings-empty">
          {t("skillhub.registry.searching", "Searching registry...")}
        </div>
      ) : (
        <div className="settings-empty">
          {t(
            "skillhub.registry.prompt",
            "Search the NeoWorker registry to discover and install curated skills.",
          )}
        </div>
      )}
    </div>
  );

  const renderClawHubTab = () => (
    <div className="skillhub-tab">
      {renderExternalImportCard()}

      <div className="settings-card">
        <div className="settings-section-header">
          <div>
            <h4>{t("skillhub.clawhub.title", "Browse ClawHub")}</h4>
            <p className="settings-description">
              {t(
                "skillhub.clawhub.description",
                "Search live ClawHub skills and install them directly.",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="input-with-button">
        <input
          type="text"
          placeholder={t(
            "skillhub.clawhub.placeholder",
            "Search ClawHub skills...",
          )}
          className="settings-input"
          value={clawHubQuery}
          onChange={(e) => setClawHubQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleClawHubSearch()}
        />
        <button
          className="button-secondary button-small"
          onClick={handleClawHubSearch}
          disabled={isSearchingClawHub}
        >
          {isSearchingClawHub
            ? t("common.searching", "Searching...")
            : t("common.search", "Search")}
        </button>
      </div>

      {!clawHubQuery.trim() &&
        clawHubResults.length > 0 &&
        !isSearchingClawHub && (
          <div className="settings-section-header">
            <div>
              <h4>{t("skillhub.clawhub.topDownloads", "Top Downloads")}</h4>
              <p className="settings-description">
                {t(
                  "skillhub.clawhub.topDownloadsDescription",
                  "The 10 most-downloaded public ClawHub skills right now.",
                )}
              </p>
            </div>
          </div>
        )}

      {clawHubResults.length > 0 && !isSearchingClawHub ? (
        renderSearchResults(clawHubResults, handleClawHubInstall)
      ) : clawHubQuery && !isSearchingClawHub ? (
        <div className="settings-empty">
          {t(
            "skillhub.clawhub.empty",
            "No ClawHub skills found. Try the exact slug, or paste the ClawHub page URL above.",
          )}
        </div>
      ) : isSearchingClawHub ? (
        <div className="settings-empty">
          {clawHubQuery.trim()
            ? t("skillhub.clawhub.searching", "Searching ClawHub...")
            : t(
                "skillhub.clawhub.loadingPopular",
                "Loading popular ClawHub skills...",
              )}
        </div>
      ) : (
        <div className="settings-empty">
          {t(
            "skillhub.clawhub.prompt",
            "Search ClawHub by name or slug, or paste a ClawHub page URL above.",
          )}
        </div>
      )}
    </div>
  );

  const _renderInstalledTab = () => {
    const managedSkills =
      skillStatus?.skills.filter((s) => s.source === "managed") || [];
    const readyCount = managedSkills.filter(
      (skill) => skill.eligible && !skill.disabled,
    ).length;
    const attentionCount = managedSkills.length - readyCount;
    const normalizedQuery = installedQuery.trim().toLocaleLowerCase();
    const visibleSkills = managedSkills.filter((skill) => {
      const matchesFilter =
        installedFilter === "all" ||
        (installedFilter === "ready" && skill.eligible && !skill.disabled) ||
        (installedFilter === "attention" &&
          (!skill.eligible || skill.disabled));
      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const localizedSkill = getLocalizedSkillText(skill);
      return [
        localizedSkill.name,
        localizedSkill.description,
        skill.category,
        skill.metadata?.author,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase().includes(normalizedQuery),
        );
    });

    return (
      <div className="skillhub-tab">
        <div className="settings-section-header skillhub-installed-toolbar">
          <div className="skillhub-installed-intro">
            <div className="skillhub-installed-heading">
              <h3>{t("skillhub.installed.title", "Installed Skills")}</h3>
              {managedSkills.length > 0 && (
                <span className="skillhub-installed-count">
                  {t("skillhub.installed.count", "{count} installed", {
                    count: managedSkills.length,
                  })}
                </span>
              )}
            </div>
            <p className="settings-description">
              {t(
                "skillhub.installed.description",
                "Search, review, and remove skills available to NeoWorker.",
              )}
            </p>
          </div>
          <div className="settings-section-actions skillhub-installed-actions">
            <label className="skillhub-installed-search">
              <Search size={15} strokeWidth={1.8} aria-hidden="true" />
              <input
                type="search"
                value={installedQuery}
                onChange={(event) => setInstalledQuery(event.target.value)}
                placeholder={t(
                  "skillhub.installed.searchPlaceholder",
                  "Search installed skills",
                )}
                aria-label={t(
                  "skillhub.installed.searchLabel",
                  "Search installed skills",
                )}
              />
            </label>
            <button
              className="button-secondary button-small button-with-icon"
              onClick={handleOpenFolder}
            >
              <FolderOpen size={15} strokeWidth={1.7} aria-hidden="true" />
              {t("skillhub.installed.openFolder", "Open Folder")}
            </button>
          </div>
        </div>

        {managedSkills.length > 0 && (
          <div
            className="skillhub-installed-filters"
            role="group"
            aria-label={t(
              "skillhub.installed.filterLabel",
              "Filter installed skills",
            )}
          >
            <button
              type="button"
              aria-pressed={installedFilter === "all"}
              className={installedFilter === "all" ? "active" : ""}
              onClick={() => setInstalledFilter("all")}
            >
              {t("skillhub.installed.filterAll", "All")}
              <span>{managedSkills.length}</span>
            </button>
            <button
              type="button"
              aria-pressed={installedFilter === "ready"}
              className={installedFilter === "ready" ? "active" : ""}
              onClick={() => setInstalledFilter("ready")}
            >
              {t("skillhub.installed.filterReady", "Ready")}
              <span>{readyCount}</span>
            </button>
            {attentionCount > 0 && (
              <button
                type="button"
                aria-pressed={installedFilter === "attention"}
                className={installedFilter === "attention" ? "active" : ""}
                onClick={() => setInstalledFilter("attention")}
              >
                {t("skillhub.installed.filterAttention", "Needs attention")}
                <span>{attentionCount}</span>
              </button>
            )}
          </div>
        )}

        {quarantinedSkills.length > 0 && (
          <div className="settings-card skillhub-quarantine-card">
            <div className="settings-section-header">
              <div>
                <h4>{t("skillhub.quarantine.title", "Quarantined Imports")}</h4>
                <p className="settings-description">
                  {t(
                    "skillhub.quarantine.description",
                    "These skill imports were stored safely and blocked from activation.",
                  )}
                </p>
              </div>
            </div>
            <div className="skillhub-quarantine-list">
              {quarantinedSkills.map((record) => (
                <div key={record.id} className="skillhub-quarantine-item">
                  <div>
                    <div className="skillhub-title-row">
                      <strong>{record.displayName || record.bundleId}</strong>
                      <span className="settings-badge settings-badge--error">
                        {t("skillhub.quarantine.badge", "Quarantined")}
                      </span>
                    </div>
                    <p className="settings-description skillhub-description">
                      {record.summary}
                    </p>
                  </div>
                  <div className="skillhub-quarantine-actions">
                    <button
                      className="button-secondary button-small"
                      onClick={() =>
                        setExpandedReportId((current) =>
                          current === record.id ? null : record.id,
                        )
                      }
                    >
                      {expandedReportId === record.id
                        ? t("skillhub.quarantine.hideReport", "Hide Report")
                        : t("skillhub.quarantine.viewReport", "View Report")}
                    </button>
                    <button
                      className="button-secondary button-small"
                      onClick={() => handleRetryQuarantined(record.id)}
                      disabled={installing === record.id}
                    >
                      {installing === record.id
                        ? t("skillhub.quarantine.scanning", "Scanning...")
                        : t("skillhub.quarantine.retryScan", "Retry Scan")}
                    </button>
                    <button
                      className="button-danger button-small"
                      onClick={() => handleRemoveQuarantined(record.id)}
                      disabled={installing === record.id}
                    >
                      {t("common.remove", "Remove")}
                    </button>
                  </div>
                  {expandedReportId === record.id && (
                    <div className="skillhub-report">
                      {record.report.findings.map((finding, index) => (
                        <p key={`${record.id}-${index}`}>
                          <strong>{finding.severity}</strong>: {finding.message}
                          {finding.path ? ` (${finding.path})` : ""}
                        </p>
                      ))}
                      {record.report.findings.length === 0 && (
                        <p>
                          {t(
                            "skillhub.quarantine.noFindings",
                            "No detailed findings available.",
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {managedSkills.length > 0 && visibleSkills.length > 0 ? (
          <div className="skillhub-list skillhub-directory-list">
            {visibleSkills.map((skill) => {
              const localizedSkill = getLocalizedSkillText(skill);
              return (
                <article
                  key={skill.id}
                  className="settings-card skillhub-card skillhub-directory-item"
                >
                  {renderSkillIcon(
                    localizedSkill.name,
                    localizedSkill.description,
                    skill.category,
                  )}
                  <div className="skillhub-directory-copy">
                    <div className="skillhub-title-row">
                      <h4 className="skillhub-title">{localizedSkill.name}</h4>
                      {skill.category === "ClawHub" && (
                        <span className="settings-badge settings-badge--outline">
                          ClawHub
                        </span>
                      )}
                    </div>
                    <p className="settings-description skillhub-description">
                      {localizedSkill.description}
                    </p>
                    {(skill.category || skill.metadata?.version) && (
                      <p className="skillhub-meta">
                        {[
                          skill.category,
                          skill.metadata?.version
                            ? `v${skill.metadata.version}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    )}
                  </div>
                  <div className="skillhub-directory-actions">
                    <div className="skillhub-directory-badges">
                      {skill.eligible && !skill.disabled ? (
                        <span className="skillhub-ready-label">
                          <CheckCircle2
                            size={14}
                            strokeWidth={1.9}
                            aria-hidden="true"
                          />
                          {t("skillhub.status.ready", "Ready")}
                        </span>
                      ) : (
                        getStatusBadge(skill)
                      )}
                      {getSecurityBadge(skill.securityReport)}
                    </div>
                    <button
                      className="skillhub-uninstall-button"
                      onClick={() => handleUninstall(skill.id)}
                      disabled={installing === skill.id}
                      title={t("skillhub.installed.uninstall", "Uninstall")}
                    >
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                      {installing === skill.id
                        ? t(
                            "skillhub.installed.uninstalling",
                            "Uninstalling...",
                          )
                        : t("skillhub.installed.uninstall", "Uninstall")}
                    </button>
                  </div>

                  {!skill.eligible && (
                    <div className="skillhub-warnings">
                      {skill.missing.bins.length > 0 && (
                        <p>
                          {t(
                            "skillhub.installed.missingBinaries",
                            "Missing binaries: {items}",
                            {
                              items: skill.missing.bins.join(", "),
                            },
                          )}
                        </p>
                      )}
                      {skill.missing.env.length > 0 && (
                        <p>
                          {t(
                            "skillhub.installed.missingEnvVars",
                            "Missing env vars: {items}",
                            {
                              items: skill.missing.env.join(", "),
                            },
                          )}
                        </p>
                      )}
                    </div>
                  )}
                  {skill.securityReport?.verdict === "warning" && (
                    <div className="skillhub-warnings">
                      <p>{skill.securityReport.summary}</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : managedSkills.length === 0 ? (
          <div className="settings-empty">
            {t("skillhub.installed.empty", "No managed skills installed yet.")}
            <br />
            {t(
              "skillhub.installed.emptyHint",
              "Browse the registry, ClawHub, or import a bundle to add one.",
            )}
          </div>
        ) : (
          <div className="settings-empty skillhub-installed-empty-search">
            {t(
              "skillhub.installed.noResults",
              "No installed skills match your search.",
            )}
          </div>
        )}
      </div>
    );
  };

  const _renderStatusTab = () => {
    if (!skillStatus) {
      return (
        <div className="settings-empty">
          {t("skillhub.loadingStatus", "Loading skill status...")}
        </div>
      );
    }

    return (
      <div className="skillhub-tab">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">
              {t("skillhub.stats.totalSkills", "Total Skills")}
            </div>
            <div className="stat-value">{skillStatus.summary.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              {t("skillhub.status.ready", "Ready")}
            </div>
            <div className="stat-value stat-value--success">
              {skillStatus.summary.eligible}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t("common.disabled", "Disabled")}</div>
            <div className="stat-value stat-value--warning">
              {skillStatus.summary.disabled}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              {t("skillhub.stats.missingDeps", "Missing Deps")}
            </div>
            <div className="stat-value stat-value--error">
              {skillStatus.summary.missingRequirements}
            </div>
          </div>
        </div>

        {["bundled", "managed", "workspace"].map((source) => {
          const skills = skillStatus.skills.filter((s) => s.source === source);
          if (skills.length === 0) return null;

          return (
            <details
              key={source}
              className="skillhub-group"
              open={source !== "bundled"}
            >
              <summary>
                <span className="skillhub-group-title">
                  {t("skillhub.group.skills", "{source} Skills", {
                    source: getLocalizedSkillSource(source) || source,
                  })}
                </span>
                <span className="settings-badge settings-badge--neutral">
                  {skills.length}
                </span>
              </summary>
              <div className="skillhub-group-content">
                {skills.map((skill) => {
                  const localizedSkill = getLocalizedSkillText(skill);
                  return (
                    <div key={skill.id} className="skillhub-group-item">
                      <div className="skillhub-group-info">
                        {renderSkillIcon(
                          localizedSkill.name,
                          localizedSkill.description,
                          skill.category,
                        )}
                        <span>{localizedSkill.name}</span>
                      </div>
                      <div className="skillhub-group-badges">
                        {getStatusBadge(skill)}
                        {getSecurityBadge(skill.securityReport)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    );
  };

  if (isLoadingStatus) {
    return (
      <div className="settings-loading">
        {t("skillhub.loading", "Loading skills...")}
      </div>
    );
  }

  return (
    <div className="skillhub-settings">
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3>{t("skillhub.title", "SkillHub")}</h3>
            <p className="settings-description">
              {t(
                "skillhub.description",
                "Manage curated skills, browse ClawHub, and import third-party skill bundles.",
              )}
            </p>
          </div>
          <div className="settings-section-actions">
            <button
              className="button-secondary button-small"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing
                ? t("common.refreshing", "Refreshing...")
                : t("common.refresh", "Refresh")}
            </button>
            {onClose && (
              <button
                className="button-secondary button-small"
                onClick={onClose}
              >
                {t("common.close", "Close")}
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="settings-alert settings-alert-error">
          <span>{error}</span>
          <button
            className="button-secondary button-small"
            onClick={() => setError(null)}
          >
            {t("common.dismiss", "Dismiss")}
          </button>
        </div>
      )}

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === "browse" ? "active" : ""}`}
          onClick={() => setActiveTab("browse")}
        >
          {t("skillhub.tab.registry", "NeoWorker Registry")}
        </button>
        <button
          className={`settings-tab ${activeTab === "clawhub" ? "active" : ""}`}
          onClick={() => setActiveTab("clawhub")}
        >
          ClawHub
        </button>
      </div>

      <div className="skillhub-tab-content">
        {activeTab === "browse" && renderBrowseTab()}
        {activeTab === "clawhub" && renderClawHubTab()}
      </div>
    </div>
  );
}
