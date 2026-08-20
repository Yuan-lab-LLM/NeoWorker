import { useState, useEffect } from "react";
import { FolderIcon } from "./LineIcons";
import { Workspace } from "../../shared/types";
import { PRODUCT_DISPLAY_VERSION } from "../../shared/product-brand";
import { translate, useLanguage } from "../i18n";

interface WorkspaceSelectorProps {
  onWorkspaceSelected: (workspace: Workspace) => void;
}

export function WorkspaceSelector({
  onWorkspaceSelected,
}: WorkspaceSelectorProps) {
  useLanguage();
  const t = translate;
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const loadWorkspaces = async () => {
    try {
      const loaded = await window.electronAPI.listWorkspaces();
      setWorkspaces(loaded);
    } catch (error) {
      console.error("Failed to load workspaces:", error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder();
      if (!folderPath) return;

      const folderName =
        folderPath.split("/").pop() ||
        t("workspaceSelector.defaultName", "Workspace");
      const permissionSettings = await window.electronAPI
        .getPermissionSettings()
        .catch(() => null);

      const workspace = await window.electronAPI.createWorkspace({
        name: folderName,
        path: folderPath,
        permissions: {
          read: true,
          write: true,
          delete: true,
          network: false,
          shell: permissionSettings?.defaultShellEnabled === true,
        },
      });

      onWorkspaceSelected(workspace);
    } catch (error) {
      console.error("Failed to create workspace:", error);
    }
  };

  return (
    <div className="workspace-selector cli-workspace-selector">
      <div className="workspace-selector-content cli-workspace-content">
        {/* Terminal Header */}
        <div className="cli-terminal-header terminal-only">
          <div className="cli-terminal-dots">
            <span className="cli-dot"></span>
            <span className="cli-dot"></span>
            <span className="cli-dot active"></span>
          </div>
          <span className="cli-terminal-title">NeoWorker — init</span>
        </div>

        {/* Logo Section */}
        <div className="cli-logo-section">
          <img
            src="./neoworker-home.svg"
            alt="NeoWorker"
            className="cli-brand-wordmark terminal-only logo-for-dark"
          />
          <img
            src="./neoworker-home.svg"
            alt="NeoWorker"
            className="cli-brand-wordmark terminal-only logo-for-light"
          />
          <img
            src="./neoworker-home.svg"
            alt="NeoWorker"
            className="modern-logo-text modern-only logo-for-dark"
          />
          <img
            src="./neoworker-home.svg"
            alt="NeoWorker"
            className="modern-logo-text modern-only logo-for-light"
          />
          <pre className="cli-ascii-logo terminal-only">{`
  ██████╗ ██████╗ ██╗    ██╗ ██████╗ ██████╗ ██╗  ██╗       ██████╗ ███████╗
 ██╔════╝██╔═══██╗██║    ██║██╔═══██╗██╔══██╗██║ ██╔╝      ██╔═══██╗██╔════╝
 ██║     ██║   ██║██║ █╗ ██║██║   ██║██████╔╝█████╔╝ █████╗██║   ██║███████╗
 ██║     ██║   ██║██║███╗██║██║   ██║██╔══██╗██╔═██╗ ╚════╝██║   ██║╚════██║
 ╚██████╗╚██████╔╝╚███╔███╔╝╚██████╔╝██║  ██║██║  ██╗      ╚██████╔╝███████║
  ╚═════╝ ╚═════╝  ╚══╝╚══╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝       ╚═════╝ ╚══════╝`}</pre>
          <div className="cli-version">
            {PRODUCT_DISPLAY_VERSION}
          </div>
          <div className="workspace-modern-title modern-only">
            {t("workspaceSelector.choose", "Choose a workspace")}
          </div>
          <div className="workspace-modern-subtitle modern-only">
            {t("workspaceSelector.pickFolder", "Pick a folder to get started.")}
          </div>
        </div>

        {/* Terminal Info */}
        <div className="cli-init-info">
          <div className="cli-line">
            <span className="cli-prompt">$</span>
            <span className="cli-text">
              <span className="terminal-only">
                {t("workspaceSelector.welcome", "Welcome to NeoWorker")}
              </span>
              <span className="modern-only">
                {t("workspaceSelector.welcome", "Welcome to NeoWorker")}
              </span>
            </span>
          </div>
          <div className="cli-line">
            <span className="cli-prompt">$</span>
            <span className="cli-text">
              <span className="terminal-only">
                {t(
                  "workspaceSelector.selectFolderInit",
                  "Select a workspace folder to initialize your environment",
                )}
              </span>
              <span className="modern-only">
                {t(
                  "workspaceSelector.selectFolderInit",
                  "Select a workspace folder to initialize your environment",
                )}
              </span>
            </span>
          </div>
          <div className="cli-line cli-blink">
            <span className="cli-prompt">$</span>
            <span className="cli-text">
              <span className="terminal-only">
                {t(
                  "workspaceSelector.waiting",
                  "Waiting for workspace selection...",
                )}
              </span>
              <span className="modern-only">
                {t(
                  "workspaceSelector.waitingYourSelection",
                  "Waiting for your workspace selection...",
                )}
              </span>
            </span>
            <span className="cli-cursor-block">_</span>
          </div>
        </div>

        {/* Recent Workspaces */}
        {workspaces.length > 0 && (
          <div className="cli-workspace-list">
            <div className="cli-section-header">
              <span className="cli-section-prompt">&gt;</span>
              <span className="cli-section-title">
                <span className="terminal-only">
                  {t("workspaceSelector.recentTerminal", "RECENT_WORKSPACES")}
                </span>
                <span className="modern-only">
                  {t("workspaceSelector.recent", "Recent workspaces")}
                </span>
              </span>
            </div>
            {workspaces.map((workspace, index) => (
              <div
                key={workspace.id}
                className="cli-workspace-item"
                onClick={() => onWorkspaceSelected(workspace)}
              >
                <span className="cli-item-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="cli-item-icon">
                  <span className="terminal-only">[dir]</span>
                  <span className="modern-only">
                    <FolderIcon size={16} />
                  </span>
                </span>
                <div className="cli-item-info">
                  <span className="cli-item-name">{workspace.name}/</span>
                  <span className="cli-item-path">{workspace.path}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Select Folder Action */}
        <div className="cli-workspace-actions">
          <button className="cli-action-btn" onClick={handleSelectFolder}>
            <span className="terminal-only">
              <span className="cli-btn-bracket">[</span>
              <span className="cli-btn-icon">+</span>
              <span className="cli-btn-bracket">]</span>
            </span>
            <span className="cli-btn-text">
              <span className="terminal-only">select_folder</span>
              <span className="modern-only">
                {t("workspaceSelector.selectFolder", "Select folder")}
              </span>
            </span>
          </button>
          <p className="cli-hint">
            <span className="terminal-only">
              {t(
                "workspaceSelector.chooseDirectoryTerminal",
                "# choose a directory for NeoWorker to operate in",
              )}
            </span>
            <span className="modern-only">
              {t(
                "workspaceSelector.chooseDirectory",
                "Choose a directory for NeoWorker to operate in.",
              )}
            </span>
          </p>
        </div>

        {/* Footer */}
        <div className="cli-init-footer">
          <span className="cli-footer-prompt">$</span>
          <span className="cli-footer-text">
            <span className="terminal-only">ready</span>
            <span className="modern-only">
              {t("workspaceSelector.ready", "Ready to continue")}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
