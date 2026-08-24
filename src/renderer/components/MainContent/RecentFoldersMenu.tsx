import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { ChevronRight, Folder, FolderPlus } from "lucide-react";
import type { Workspace } from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";

interface RecentFoldersMenuProps {
  activeWorkspaceId?: string;
  onClose: () => void;
  onSelect: (workspace: Workspace) => void;
  onSelectNewFolder: () => void;
  workspaces: Workspace[];
}

export function RecentFoldersMenu({
  activeWorkspaceId,
  onClose,
  onSelect,
  onSelectNewFolder,
  workspaces,
}: RecentFoldersMenuProps) {
  useLanguage();
  const visibleWorkspaces = useMemo(
    () => workspaces.slice(0, 10),
    [workspaces],
  );
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const newFolderRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const activeIndex = visibleWorkspaces.findIndex(
      (workspace) => workspace.id === activeWorkspaceId,
    );
    const focusIndex = activeIndex >= 0 ? activeIndex : 0;
    const focusFrame = window.requestAnimationFrame(() => {
      (itemRefs.current[focusIndex] ?? newFolderRef.current)?.focus();
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [activeWorkspaceId, visibleWorkspaces]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const menuItems = [...itemRefs.current, newFolderRef.current].filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    if (!menuItems.length) return;

    event.preventDefault();
    const activeIndex = menuItems.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? menuItems.length - 1
          : event.key === "ArrowUp"
            ? (activeIndex - 1 + menuItems.length) % menuItems.length
            : (activeIndex + 1) % menuItems.length;

    menuItems[nextIndex]?.focus();
  };

  return (
    <div
      aria-label={translate("composer.recentFolders", "Recent Folders")}
      className="workspace-dropdown"
      onKeyDown={handleKeyDown}
      role="menu"
    >
      {visibleWorkspaces.length > 0 && (
        <>
          <div className="workspace-dropdown-header">
            {translate("composer.recentFolders", "Recent Folders")}
          </div>
          <div className="workspace-dropdown-list">
            {visibleWorkspaces.map((workspace, index) => {
              const isActive = workspace.id === activeWorkspaceId;
              return (
                <button
                  aria-current={isActive ? "true" : undefined}
                  className={`workspace-dropdown-item ${isActive ? "active" : ""}`}
                  key={workspace.id}
                  onClick={() => onSelect(workspace)}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  role="menuitem"
                  title={workspace.path}
                  type="button"
                >
                  <span className="workspace-item-icon" aria-hidden="true">
                    <Folder size={18} strokeWidth={1.8} />
                  </span>
                  <span className="workspace-item-info">
                    <span className="workspace-item-name">
                      {workspace.name}
                    </span>
                    <span className="workspace-item-path">
                      {workspace.path}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="workspace-item-chevron"
                    size={17}
                    strokeWidth={2}
                  />
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="workspace-dropdown-footer">
        <button
          className="workspace-dropdown-item new-folder"
          onClick={onSelectNewFolder}
          ref={newFolderRef}
          role="menuitem"
          type="button"
        >
          <FolderPlus aria-hidden="true" size={19} strokeWidth={1.8} />
          <span>
            {translate(
              "composer.workInAnotherFolder",
              "Work in another folder...",
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
