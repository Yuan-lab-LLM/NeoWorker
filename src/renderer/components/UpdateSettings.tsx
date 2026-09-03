import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download, CheckCircle, XCircle } from "lucide-react";
import { transformReleaseNotesUrl } from "../utils/release-notes-markdown";
import { translate, useLanguage } from "../i18n";

interface VersionInfo {
  version: string;
  isDev: boolean;
  isGitRepo: boolean;
  isNpmGlobal: boolean;
  gitBranch?: string;
  gitCommit?: string;
}

interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseUrl?: string;
  publishedAt?: string;
  updateMode: "git" | "npm" | "electron-updater";
}

interface UpdateProgress {
  phase:
    | "checking"
    | "downloading"
    | "extracting"
    | "installing"
    | "complete"
    | "error";
  percent?: number;
  message: string;
}

function ReleaseNotesLink({
  href,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"a">) {
  if (!href) {
    return <>{children}</>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

export function UpdateSettings() {
  useLanguage();
  const t = translate;
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [manualInstallerReady, setManualInstallerReady] = useState(false);

  useEffect(() => {
    loadVersionInfo();

    // Subscribe to update events
    const unsubProgress = window.electronAPI.onUpdateProgress((prog) => {
      setProgress(prog);
      if (prog.phase === "error") {
        setError(prog.message);
        setUpdating(false);
      }
    });

    const unsubDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateReady(true);
      setManualInstallerReady(Boolean(info?.manual));
      setUpdating(false);
    });

    const unsubError = window.electronAPI.onUpdateError((err) => {
      setError(err.error);
      setUpdating(false);
    });

    return () => {
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, []);

  const loadVersionInfo = async () => {
    try {
      setLoading(true);
      const info = await window.electronAPI.getAppVersion();
      setVersionInfo(info);
    } catch (err: Any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      setChecking(true);
      setError(null);
      setUpdateInfo(null);
      const info = await window.electronAPI.checkForUpdates();
      setUpdateInfo(info);
    } catch (err: Any) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo) return;

    try {
      setUpdating(true);
      setError(null);
      await window.electronAPI.downloadUpdate(updateInfo);
    } catch (err: Any) {
      setError(err.message);
      setUpdating(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await window.electronAPI.installUpdate();
    } catch (err: Any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("updates.loading", "Loading version info...")}
      </div>
    );
  }

  return (
    <div className="update-settings">
      <div className="settings-section">
        <h3>{t("updates.currentVersion", "Current Version")}</h3>
        <div className="version-info">
          <div className="version-number">
            v{versionInfo?.version || t("updates.unknown", "Unknown")}
          </div>
          {versionInfo?.isDev && (
            <span className="version-badge dev">
              {t("updates.developmentMode", "Development Mode")}
            </span>
          )}
          {versionInfo?.isNpmGlobal && (
            <span className="version-badge npm">
              {t("updates.installedViaNpm", "Installed via npm")}
            </span>
          )}
          {versionInfo?.isGitRepo && (
            <div className="git-info">
              <span className="git-branch">{versionInfo.gitBranch}</span>
              {versionInfo.gitCommit && (
                <span className="git-commit">@ {versionInfo.gitCommit}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("updates.check.title", "Check for Updates")}</h3>
        <p className="settings-description">
          {versionInfo?.isNpmGlobal
            ? t("updates.check.npm", "Updates will be installed via npm.")
            : versionInfo?.isGitRepo
              ? t(
                  "updates.check.git",
                  "Updates will be pulled from GitHub and rebuilt automatically.",
                )
              : t(
                  "updates.check.auto",
                  "Updates will be downloaded and installed automatically.",
                )}
        </p>

        <div className="update-actions">
          <button
            className="button-primary"
            onClick={handleCheckForUpdates}
            disabled={checking || updating}
          >
            {checking
              ? t("updates.checking", "Checking...")
              : t("updates.check.action", "Check for Updates")}
          </button>
        </div>

        {updateInfo && (
          <div
            className={`update-status ${updateInfo.available ? "available" : "up-to-date"}`}
          >
            {updateInfo.available ? (
              <>
                <div className="update-header">
                  <Download size={20} strokeWidth={2} />
                  <span>{t("updates.available", "Update Available!")}</span>
                </div>
                <div className="update-versions">
                  <span className="current">
                    {t("updates.current", "Current")}:{" "}
                    {updateInfo.currentVersion}
                  </span>
                  <span className="arrow">→</span>
                  <span className="latest">
                    {t("updates.latest", "Latest")}: {updateInfo.latestVersion}
                  </span>
                </div>
                {updateInfo.publishedAt && (
                  <div className="update-date">
                    {t("updates.released", "Released")}:{" "}
                    {new Date(updateInfo.publishedAt).toLocaleDateString()}
                  </div>
                )}
                {updateInfo.releaseNotes && (
                  <div className="release-notes">
                    <h4>{t("updates.releaseNotes", "Release Notes")}</h4>
                    <div className="release-notes-content markdown-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        urlTransform={(url) =>
                          transformReleaseNotesUrl(url, updateInfo.releaseUrl)
                        }
                        components={{ a: ReleaseNotesLink }}
                      >
                        {updateInfo.releaseNotes}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
                {updateInfo.releaseUrl && (
                  <a
                    href={updateInfo.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="release-link"
                  >
                    {t("updates.viewOnGithub", "View on GitHub")} →
                  </a>
                )}
                <div className="update-mode">
                  {t("updates.method", "Update method")}:{" "}
                  <strong>
                    {updateInfo.updateMode === "npm"
                      ? "npm update"
                      : updateInfo.updateMode === "git"
                        ? "Git Pull + Rebuild"
                        : "Auto-download"}
                  </strong>
                </div>
              </>
            ) : (
              <div className="update-header up-to-date">
                <CheckCircle size={20} strokeWidth={2} />
                <span>{t("updates.upToDate", "You're up to date!")}</span>
              </div>
            )}
          </div>
        )}

        {progress && (
          <div className="update-progress">
            <div className="progress-message">{progress.message}</div>
            {progress.percent !== undefined && (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="update-error">
            <XCircle size={16} strokeWidth={2} />
            {error}
          </div>
        )}

        {updateInfo?.available && !updating && !updateReady && (
          <button
            className="button-primary update-button"
            onClick={handleDownloadUpdate}
            disabled={updating}
          >
            {versionInfo?.isNpmGlobal
              ? t("updates.updateNowNpm", "Update Now (npm install)")
              : versionInfo?.isGitRepo
                ? t("updates.updateNowGit", "Update Now (Git Pull + Rebuild)")
                : t("updates.downloadInstall", "Download & Install Update")}
          </button>
        )}

        {updateReady && (
          <button
            className="button-primary update-button restart"
            onClick={handleInstallUpdate}
          >
            {manualInstallerReady
              ? t("updates.openInstaller", "Open Installer")
              : t("updates.restart", "Restart to Apply Update")}
          </button>
        )}
      </div>

      <div className="settings-section">
        <h3>{t("updates.manual.title", "Manual Update")}</h3>
        <p className="settings-description">
          {t(
            versionInfo?.isNpmGlobal
              ? "updates.manual.description.command"
              : "updates.manual.description.commands",
            versionInfo?.isNpmGlobal
              ? "You can also manually update by running this command in the terminal:"
              : "You can also manually update by running these commands in the terminal:",
          )}
        </p>
        <div className="manual-update-commands">
          {versionInfo?.isNpmGlobal ? (
            <code>npm update -g neoworker</code>
          ) : (
            <code>
              git fetch origin{"\n"}
              git pull origin main{"\n"}
              npm install{"\n"}
              npm run build
            </code>
          )}
        </div>
        <p className="settings-hint">
          {t(
            "updates.manual.restartHint",
            "After updating, restart the application to apply changes.",
          )}
        </p>
      </div>
    </div>
  );
}
