import { useEffect, useState } from "react";
import { Download, LogIn } from "lucide-react";
import type { AppProfileSummary } from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function ProfileSettings() {
  useLanguage();
  const [profiles, setProfiles] = useState<AppProfileSummary[]>([]);
  const [newProfileName, setNewProfileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importProfileName, setImportProfileName] = useState("");

  const loadProfiles = async () => {
    if (!window.electronAPI?.listProfiles) return;
    try {
      const nextProfiles = await window.electronAPI.listProfiles();
      setProfiles(nextProfiles);
    } catch (loadError: Any) {
      setError(
        loadError?.message ||
          translate("profileSettings.error.load", "Failed to load profiles."),
      );
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const handleCreate = async () => {
    const trimmed = newProfileName.trim();
    if (!trimmed || !window.electronAPI?.createProfile) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const created = await window.electronAPI.createProfile(trimmed);
      setNewProfileName("");
      setStatus(
        translate(
          "profileSettings.status.created",
          `Created profile "${created.label}".`,
          {
            profile: created.label,
          },
        ),
      );
      await loadProfiles();
    } catch (createError: Any) {
      setError(
        createError?.message ||
          translate(
            "profileSettings.error.create",
            "Failed to create profile.",
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSwitch = async (profileId: string) => {
    if (!window.electronAPI?.switchProfile) return;
    setBusy(true);
    setError(null);
    setStatus(
      translate(
        "profileSettings.status.switching",
        `Switching to profile "${profileId}" and restarting...`,
        {
          profile: profileId,
        },
      ),
    );
    try {
      await window.electronAPI.switchProfile(profileId);
    } catch (switchError: Any) {
      setError(
        switchError?.message ||
          translate(
            "profileSettings.error.switch",
            "Failed to switch profile.",
          ),
      );
      setStatus(null);
      setBusy(false);
    }
  };

  const handleExport = async (profileId: string) => {
    if (!window.electronAPI?.selectFolder || !window.electronAPI?.exportProfile)
      return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const destinationRoot = await window.electronAPI.selectFolder();
      if (!destinationRoot) {
        setBusy(false);
        return;
      }
      const result = await window.electronAPI.exportProfile(
        profileId,
        destinationRoot,
      );
      setStatus(
        translate(
          "profileSettings.status.exported",
          `Exported "${result.profile.label}" to ${result.bundlePath}.`,
          {
            profile: result.profile.label,
            path: result.bundlePath,
          },
        ),
      );
    } catch (exportError: Any) {
      setError(
        exportError?.message ||
          translate(
            "profileSettings.error.export",
            "Failed to export profile.",
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!window.electronAPI?.selectFolder || !window.electronAPI?.importProfile)
      return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const sourcePath = await window.electronAPI.selectFolder();
      if (!sourcePath) {
        setBusy(false);
        return;
      }
      const imported = await window.electronAPI.importProfile(
        sourcePath,
        importProfileName.trim() || undefined,
      );
      setImportProfileName("");
      setStatus(
        translate(
          "profileSettings.status.imported",
          `Imported profile "${imported.label}".`,
          {
            profile: imported.label,
          },
        ),
      );
      await loadProfiles();
    } catch (importError: Any) {
      setError(
        importError?.message ||
          translate(
            "profileSettings.error.import",
            "Failed to import profile.",
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const activeProfile = profiles.find((profile) => profile.isActive) ?? null;

  return (
    <div className="settings-section profile-settings">
      <p className="settings-description profile-settings-intro">
        {translate(
          "profileSettings.description",
          "Profiles keep NeoWorker data isolated by user data directory. Switching restarts the app into the selected profile.",
        )}
      </p>

      <div className="settings-card profile-settings-active-card">
        <div className="profile-settings-card-header">
          <div>
            <div className="profile-settings-card-title">
              {translate(
                "profileSettings.activeProfile",
                "Active profile: {profile}",
                {
                  profile: activeProfile?.label || "default",
                },
              )}
            </div>
            <div className="settings-description profile-settings-card-path">
              {activeProfile?.userDataDir ||
                translate(
                  "profileSettings.defaultDirectory",
                  "Using the default data directory.",
                )}
            </div>
          </div>
          <span className="settings-badge">
            {activeProfile?.id || "default"}
          </span>
        </div>
      </div>

      <div className="profile-settings-list">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`settings-card ${profile.isActive ? "is-selected" : ""}`}
          >
            <div className="profile-settings-card-header">
              <div>
                <div className="profile-settings-card-title">
                  {profile.label}
                </div>
                <div className="settings-description profile-settings-card-path">
                  {profile.userDataDir}
                </div>
              </div>
              <span className="settings-badge">
                {profile.isDefault
                  ? translate("profileSettings.default", "Default")
                  : profile.id}
              </span>
            </div>
            <div className="profile-settings-actions">
              <div className="profile-settings-action-row">
                <span className="profile-settings-action-label">
                  <LogIn size={16} aria-hidden="true" />
                  {profile.isActive
                    ? translate(
                        "profileSettings.currentProfile",
                        "Current Profile",
                      )
                    : translate(
                        "profileSettings.switchProfile",
                        "Switch Profile",
                      )}
                </span>
                <button
                  type="button"
                  className={
                    profile.isActive ? "button-secondary" : "button-primary"
                  }
                  onClick={() => void handleSwitch(profile.id)}
                  disabled={busy || profile.isActive}
                >
                  {profile.isActive
                    ? translate(
                        "profileSettings.currentProfile",
                        "Current Profile",
                      )
                    : translate(
                        "profileSettings.switchProfile",
                        "Switch Profile",
                      )}
                </button>
              </div>
              <div className="profile-settings-action-row">
                <span className="profile-settings-action-label">
                  <Download size={16} aria-hidden="true" />
                  {translate("profileSettings.export", "Export")}
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => void handleExport(profile.id)}
                  disabled={busy}
                >
                  {translate("profileSettings.export", "Export")}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="profile-settings-form">
        <div className="profile-settings-form-title">
          {translate("profileSettings.create.title", "Create profile")}
        </div>
        <p className="settings-description">
          {translate(
            "profileSettings.create.description",
            "Enter a label like `work`, `personal`, or a project/team name. The storage path is created automatically.",
          )}
        </p>
        <div className="profile-settings-form-controls">
          <input
            type="text"
            value={newProfileName}
            onChange={(event) => setNewProfileName(event.target.value)}
            placeholder={translate(
              "profileSettings.create.placeholder",
              "New profile name",
            )}
            disabled={busy}
          />
          <button
            type="button"
            className="button-primary"
            onClick={() => void handleCreate()}
            disabled={busy || newProfileName.trim().length === 0}
          >
            {translate("profileSettings.create.action", "Create")}
          </button>
        </div>
        {status ? (
          <p className="settings-description profile-settings-feedback">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="settings-description profile-settings-feedback profile-settings-feedback-error">
            {error}
          </p>
        ) : null}
      </div>

      <div className="profile-settings-form">
        <div className="profile-settings-form-title">
          {translate("profileSettings.import.title", "Import profile")}
        </div>
        <p className="settings-description">
          {translate(
            "profileSettings.import.description",
            "Pick a previously exported profile folder. Leave the name blank to reuse the imported profile label.",
          )}
        </p>
        <div className="profile-settings-form-controls">
          <input
            type="text"
            value={importProfileName}
            onChange={(event) => setImportProfileName(event.target.value)}
            placeholder={translate(
              "profileSettings.import.placeholder",
              "Optional profile name override",
            )}
            disabled={busy}
          />
          <button
            type="button"
            className="button-secondary"
            onClick={() => void handleImport()}
            disabled={busy}
          >
            {translate("profileSettings.import.action", "Import")}
          </button>
        </div>
      </div>
    </div>
  );
}
