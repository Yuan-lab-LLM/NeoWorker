import { useState, useEffect, useId } from "react";
import { X } from "lucide-react";
import type { InstallSecurityOutcome } from "../../shared/types";
import { classifyPluginStoreInstallSource } from "../utils/plugin-store-install";
import { translate, useLanguage } from "../i18n";

interface PackRegistryEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: string;
  icon?: string;
  category?: string;
  tags?: string[];
  downloadUrl?: string;
  gitUrl?: string;
  skillCount?: number;
  agentCount?: number;
  downloads?: number;
}

interface PluginStoreProps {
  onClose: () => void;
  onInstalled?: () => void;
}

function installMessage(
  outcome: InstallSecurityOutcome | undefined,
  fallback: string,
): string {
  if (!outcome) {
    return fallback;
  }

  return outcome.summary || fallback;
}

function urlInstallErrorMessage(
  errorCode: string | undefined,
  fallback: string,
  t: typeof translate,
): string {
  if (errorCode === "plugin_manifest_expected_json") {
    return t(
      "pluginStore.error.expectedManifestJson",
      "This address is a web page, not a plugin manifest. Use a Git repository, a direct neoworker.plugin.json link, or paste a ClawHub skill page here for automatic skill installation.",
    );
  }
  if (errorCode === "plugin_manifest_invalid_json") {
    return t(
      "pluginStore.error.invalidManifestJson",
      "This address did not return a valid neoworker.plugin.json manifest.",
    );
  }
  return fallback;
}

export function PluginStore({ onClose, onInstalled }: PluginStoreProps) {
  useLanguage();
  const t = translate;
  const titleId = useId();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [results, setResults] = useState<PackRegistryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<{
    id: string;
    success: boolean;
    message: string;
  } | null>(null);

  // Install from git URL or URL
  const [showInstallUrl, setShowInstallUrl] = useState(false);
  const [installUrl, setInstallUrl] = useState("");

  // Scaffold new pack
  const [showScaffold, setShowScaffold] = useState(false);
  const [scaffoldName, setScaffoldName] = useState("");
  const [scaffoldDisplayName, setScaffoldDisplayName] = useState("");
  const [scaffoldCategory, setScaffoldCategory] = useState("Custom");
  const [scaffoldIcon, setScaffoldIcon] = useState("📦");

  // Load categories on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        const cats = await window.electronAPI.getPackRegistryCategories();
        setCategories(cats);
      } catch {
        // Categories not available
      }
    }
    loadCategories();
  }, []);

  // Search when query/category/page changes
  useEffect(() => {
    let cancelled = false;

    async function doSearch() {
      setLoading(true);
      setError(null);
      try {
        const data = await window.electronAPI.searchPackRegistry(query, {
          page,
          pageSize: 12,
          category: category || undefined,
        });
        if (cancelled) return;
        setResults(data.results);
        setTotal(data.total);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : t("pluginStore.error.search", "Failed to search registry"),
        );
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const debounce = setTimeout(doSearch, 300);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [query, category, page]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleInstall = async (entry: PackRegistryEntry) => {
    setInstalling(entry.id);
    setInstallResult(null);

    try {
      let result: {
        success: boolean;
        packName?: string;
        error?: string;
        security?: InstallSecurityOutcome;
      };

      if (entry.gitUrl) {
        result = await window.electronAPI.installPluginPackFromGit(
          entry.gitUrl,
        );
      } else if (entry.downloadUrl) {
        result = await window.electronAPI.installPluginPackFromUrl(
          entry.downloadUrl,
        );
      } else {
        result = {
          success: false,
          error: t(
            "pluginStore.error.noDownload",
            "No download URL available for this pack",
          ),
        };
      }

      setInstallResult({
        id: entry.id,
        success: result.success,
        message: result.success
          ? installMessage(
              result.security,
              t("pluginStore.installed", "Installed {name}", {
                name: result.packName || entry.displayName,
              }),
            )
          : installMessage(
              result.security,
              result.error || t("pluginStore.error.install", "Install failed"),
            ),
      });

      if (result.success) {
        onInstalled?.();
      }
    } catch (err) {
      setInstallResult({
        id: entry.id,
        success: false,
        message:
          err instanceof Error
            ? err.message
            : t("pluginStore.error.install", "Install failed"),
      });
    } finally {
      setInstalling(null);
    }
  };

  const handleUrlInstall = async () => {
    const source = installUrl.trim();
    if (!source) return;
    setInstalling("url");
    setInstallResult(null);

    try {
      const sourceKind = classifyPluginStoreInstallSource(source);
      let result: {
        success: boolean;
        packName?: string;
        skill?: { id: string; name: string };
        error?: string;
        errorCode?: string;
        security?: InstallSecurityOutcome;
      };

      if (sourceKind === "clawhub-skill") {
        result = await window.electronAPI.installSkillFromClawHub(source);
      } else if (sourceKind === "git-plugin") {
        result = await window.electronAPI.installPluginPackFromGit(source);
      } else {
        result = await window.electronAPI.installPluginPackFromUrl(source);
      }

      setInstallResult({
        id: "url",
        success: result.success,
        message: result.success
          ? installMessage(
              result.security,
              t("pluginStore.installed", "Installed {name}", {
                name: result.packName || result.skill?.name || "pack",
              }),
            )
          : installMessage(
              result.security,
              urlInstallErrorMessage(
                result.errorCode,
                result.error ||
                  t("pluginStore.error.install", "Install failed"),
                t,
              ),
            ),
      });

      if (result.success) {
        setInstallUrl("");
        setShowInstallUrl(false);
        onInstalled?.();
      }
    } catch (err) {
      setInstallResult({
        id: "url",
        success: false,
        message:
          err instanceof Error
            ? err.message
            : t("pluginStore.error.install", "Install failed"),
      });
    } finally {
      setInstalling(null);
    }
  };

  const handleScaffold = async () => {
    if (!scaffoldName.trim() || !scaffoldDisplayName.trim()) return;
    setInstalling("scaffold");
    setInstallResult(null);

    try {
      const result = await window.electronAPI.scaffoldPluginPack({
        name: scaffoldName.trim().toLowerCase().replace(/\s+/g, "-"),
        displayName: scaffoldDisplayName.trim(),
        category: scaffoldCategory,
        icon: scaffoldIcon,
      });

      setInstallResult({
        id: "scaffold",
        success: result.success,
        message: result.success
          ? t("pluginStore.createdAt", "Created pack at {path}", {
              path: result.path,
            })
          : result.error || t("pluginStore.error.scaffold", "Scaffold failed"),
      });

      if (result.success) {
        setScaffoldName("");
        setScaffoldDisplayName("");
        setShowScaffold(false);
        onInstalled?.();
      }
    } catch (err) {
      setInstallResult({
        id: "scaffold",
        success: false,
        message:
          err instanceof Error
            ? err.message
            : t("pluginStore.error.scaffold", "Scaffold failed"),
      });
    } finally {
      setInstalling(null);
    }
  };

  const pageCount = Math.ceil(total / 12);
  const normalizeAuthor = (author?: string): string => {
    const trimmed = typeof author === "string" ? author.trim() : "";
    if (!trimmed) return t("common.unknown", "Unknown");
    return /^neoworker$/i.test(trimmed) ? "NeoWorker" : trimmed;
  };

  return (
    <div
      className="ps-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ps-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div className="ps-header">
          <h2 id={titleId}>{t("pluginStore.title", "Plugin Store")}</h2>
          <div className="ps-header-actions">
            <button
              className="ps-btn ps-btn--secondary"
              onClick={() => {
                setShowScaffold(true);
                setShowInstallUrl(false);
              }}
            >
              {t("pluginStore.createPack", "+ Create Pack")}
            </button>
            <button
              className="ps-btn ps-btn--secondary"
              onClick={() => {
                setShowInstallUrl(true);
                setShowScaffold(false);
              }}
            >
              {t("pluginStore.installFromUrl", "Install from URL")}
            </button>
            <button
              type="button"
              className="ps-close"
              onClick={onClose}
              aria-label={t("common.close", "Close")}
              title={t("common.close", "Close")}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Install from URL panel */}
        {showInstallUrl && (
          <div className="ps-action-panel">
            <h4>
              {t(
                "pluginStore.installUrl.title",
                "Install from URL or Git Repository",
              )}
            </h4>
            <p className="ps-hint">
              {t(
                "pluginStore.installUrl.hint",
                "Paste a GitHub repository, a direct neoworker.plugin.json link, or a ClawHub skill page URL. ClawHub links are installed as skills automatically.",
              )}
            </p>
            <div className="ps-input-row">
              <input
                type="text"
                className="ps-input"
                placeholder="github:owner/repo or https://..."
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUrlInstall()}
              />
              <button
                className="ps-btn ps-btn--primary"
                onClick={handleUrlInstall}
                disabled={!installUrl.trim() || installing === "url"}
              >
                {installing === "url"
                  ? t("pluginStore.installing", "Installing...")
                  : t("pluginStore.install", "Install")}
              </button>
              <button
                className="ps-btn ps-btn--ghost"
                onClick={() => setShowInstallUrl(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
            </div>
            {installResult?.id === "url" && (
              <div
                className={`ps-result ${installResult.success ? "ps-result--success" : "ps-result--error"}`}
              >
                {installResult.message}
              </div>
            )}
          </div>
        )}

        {/* Create new pack panel */}
        {showScaffold && (
          <div className="ps-action-panel">
            <h4>{t("pluginStore.scaffold.title", "Create New Plugin Pack")}</h4>
            <p className="ps-hint">
              {t(
                "pluginStore.scaffold.hint",
                "Creates a new pack skeleton in your extensions directory (~/.neoworker/extensions/)",
              )}
            </p>
            <div className="ps-scaffold-form">
              <div className="ps-input-row">
                <input
                  type="text"
                  className="ps-input"
                  placeholder="my-custom-pack (kebab-case)"
                  value={scaffoldName}
                  onChange={(e) => setScaffoldName(e.target.value)}
                />
                <input
                  type="text"
                  className="ps-input"
                  placeholder="My Custom Pack (display name)"
                  value={scaffoldDisplayName}
                  onChange={(e) => setScaffoldDisplayName(e.target.value)}
                />
              </div>
              <div className="ps-input-row">
                <select
                  className="ps-input ps-select"
                  value={scaffoldCategory}
                  onChange={(e) => setScaffoldCategory(e.target.value)}
                >
                  {[
                    "Custom",
                    "Engineering",
                    "Sales",
                    "Finance",
                    "HR",
                    "Design",
                    "Data",
                    "Marketing",
                    "Operations",
                    "Security",
                    "Productivity",
                    "Management",
                    "Product",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {t(`pluginStore.category.${c}`, c)}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="ps-input ps-icon-input"
                  placeholder="📦"
                  value={scaffoldIcon}
                  onChange={(e) => setScaffoldIcon(e.target.value)}
                  maxLength={4}
                />
                <button
                  className="ps-btn ps-btn--primary"
                  onClick={handleScaffold}
                  disabled={
                    !scaffoldName.trim() ||
                    !scaffoldDisplayName.trim() ||
                    installing === "scaffold"
                  }
                >
                  {installing === "scaffold"
                    ? t("common.creating", "Creating...")
                    : t("common.create", "Create")}
                </button>
                <button
                  className="ps-btn ps-btn--ghost"
                  onClick={() => setShowScaffold(false)}
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            </div>
            {installResult?.id === "scaffold" && (
              <div
                className={`ps-result ${installResult.success ? "ps-result--success" : "ps-result--error"}`}
              >
                {installResult.message}
              </div>
            )}
          </div>
        )}

        {/* Search + Category filter */}
        <div className="ps-search-bar">
          <input
            type="text"
            className="ps-input ps-search-input"
            placeholder={t(
              "pluginStore.searchPlaceholder",
              "Search plugin packs...",
            )}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          {categories.length > 0 && (
            <div className="ps-category-chips">
              <button
                className={`ps-chip ${!category ? "ps-chip--active" : ""}`}
                onClick={() => {
                  setCategory(null);
                  setPage(1);
                }}
              >
                {t("common.all", "All")}
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  className={`ps-chip ${category === c ? "ps-chip--active" : ""}`}
                  onClick={() => {
                    setCategory(c);
                    setPage(1);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="ps-results">
          {loading && (
            <div className="ps-empty">
              {t("common.searching", "Searching...")}
            </div>
          )}
          {error && <div className="ps-empty ps-error">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="ps-empty">
              {query
                ? t(
                    "pluginStore.empty.search",
                    "No packs found matching your search",
                  )
                : t(
                    "pluginStore.empty.registry",
                    "No packs available in the registry",
                  )}
            </div>
          )}

          <div className="ps-grid">
            {results.map((entry) => (
              <div key={entry.id} className="ps-card">
                <div className="ps-card-header">
                  <span className="ps-card-icon">{entry.icon || "📦"}</span>
                  <div className="ps-card-meta">
                    <span className="ps-card-name">{entry.displayName}</span>
                    <span className="ps-card-author">
                      {t("pluginStore.byAuthor", "by {author}", {
                        author: normalizeAuthor(entry.author),
                      })}
                    </span>
                  </div>
                </div>
                <p className="ps-card-desc">{entry.description}</p>
                <div className="ps-card-footer">
                  <div className="ps-card-stats">
                    {entry.skillCount != null && (
                      <span>
                        {t("pluginStore.skillCount", "{count} skills", {
                          count: entry.skillCount,
                        })}
                      </span>
                    )}
                    {entry.agentCount != null && (
                      <span>
                        {t("pluginStore.agentCount", "{count} agents", {
                          count: entry.agentCount,
                        })}
                      </span>
                    )}
                    {entry.category && (
                      <span className="ps-card-category">{entry.category}</span>
                    )}
                  </div>
                  <button
                    className="ps-btn ps-btn--primary ps-btn--sm"
                    onClick={() => handleInstall(entry)}
                    disabled={installing === entry.id}
                  >
                    {installing === entry.id
                      ? t("pluginStore.installing", "Installing...")
                      : t("pluginStore.install", "Install")}
                  </button>
                </div>
                {installResult?.id === entry.id && (
                  <div
                    className={`ps-result ${installResult.success ? "ps-result--success" : "ps-result--error"}`}
                  >
                    {installResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="ps-pagination">
              <button
                className="ps-btn ps-btn--ghost"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                {t("common.previous", "Previous")}
              </button>
              <span className="ps-page-info">
                {t("pluginStore.pageInfo", "Page {page} of {pageCount}", {
                  page,
                  pageCount,
                })}
              </span>
              <button
                className="ps-btn ps-btn--ghost"
                onClick={() => setPage(Math.min(pageCount, page + 1))}
                disabled={page >= pageCount}
              >
                {t("common.next", "Next")}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .ps-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .ps-container {
          background: var(--color-bg-primary);
          border-radius: 12px;
          width: 90%;
          max-width: 800px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .ps-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .ps-header h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
          color: var(--color-text-primary);
        }

        .ps-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ps-close {
          width: 32px;
          height: 32px;
          background: none;
          border: none;
          font-size: 20px;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .ps-close:hover {
          color: var(--color-text-primary);
          background: var(--color-bg-hover);
        }

        /* Action panels (install from URL, scaffold) */
        .ps-action-panel {
          padding: 16px 20px;
          border-bottom: 1px solid var(--color-border-subtle);
          background: var(--color-bg-secondary);
        }

        .ps-action-panel h4 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px;
          color: var(--color-text-primary);
        }

        .ps-hint {
          font-size: 12px;
          color: var(--color-text-muted);
          margin: 0 0 10px;
        }

        .ps-input-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }

        .ps-input-row:last-child {
          margin-bottom: 0;
        }

        .ps-input {
          flex: 1;
          padding: 7px 10px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 6px;
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
          font-size: 13px;
          outline: none;
        }

        .ps-input:focus {
          border-color: var(--color-accent);
        }

        .ps-select {
          max-width: 160px;
        }

        .ps-icon-input {
          max-width: 60px;
          text-align: center;
        }

        .ps-scaffold-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Buttons */
        .ps-btn {
          padding: 7px 14px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }

        .ps-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ps-btn--primary {
          background: var(--color-accent, #1e8df6);
          color: #000;
        }

        .ps-btn--primary:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .ps-btn--secondary {
          background: var(--color-bg-tertiary);
          color: var(--color-text-primary);
        }

        .ps-btn--secondary:hover:not(:disabled) {
          background: var(--color-bg-hover);
        }

        .ps-btn--ghost {
          background: none;
          color: var(--color-text-secondary);
        }

        .ps-btn--ghost:hover:not(:disabled) {
          color: var(--color-text-primary);
          background: var(--color-bg-hover);
        }

        .ps-btn--sm {
          padding: 5px 10px;
          font-size: 12px;
        }

        /* Result messages */
        .ps-result {
          margin-top: 8px;
          padding: 6px 10px;
          border-radius: 4px;
          font-size: 12px;
        }

        .ps-result--success {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }

        .ps-result--error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        /* Search */
        .ps-search-bar {
          padding: 12px 20px;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .ps-search-input {
          width: 100%;
          margin-bottom: 8px;
        }

        .ps-category-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .ps-chip {
          padding: 4px 10px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          background: none;
          color: var(--color-text-muted);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ps-chip:hover {
          border-color: var(--color-text-secondary);
          color: var(--color-text-secondary);
        }

        .ps-chip--active {
          background: var(--color-accent, #1e8df6);
          color: #000;
          border-color: var(--color-accent, #1e8df6);
        }

        /* Results grid */
        .ps-results {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }

        .ps-empty {
          text-align: center;
          color: var(--color-text-muted);
          font-size: 14px;
          padding: 40px 0;
        }

        .ps-error {
          color: var(--color-text-danger, #ef4444);
        }

        .ps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 12px;
        }

        .ps-card {
          border: 1px solid var(--color-border-subtle);
          border-radius: 8px;
          padding: 14px 16px;
          background: var(--color-bg-secondary);
          transition: border-color 0.15s;
        }

        .ps-card:hover {
          border-color: var(--color-border);
        }

        .ps-card-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .ps-card-icon {
          font-size: 24px;
          flex-shrink: 0;
        }

        .ps-card-meta {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .ps-card-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .ps-card-author {
          font-size: 11px;
          color: var(--color-text-muted);
        }

        .ps-card-desc {
          font-size: 12px;
          color: var(--color-text-secondary);
          margin: 0 0 10px;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .ps-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .ps-card-stats {
          display: flex;
          gap: 8px;
          font-size: 11px;
          color: var(--color-text-muted);
        }

        .ps-card-category {
          padding: 1px 6px;
          border-radius: 4px;
          background: var(--color-bg-tertiary);
        }

        /* Pagination */
        .ps-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 16px 0 4px;
        }

        .ps-page-info {
          font-size: 12px;
          color: var(--color-text-muted);
        }
      `}</style>
    </div>
  );
}
