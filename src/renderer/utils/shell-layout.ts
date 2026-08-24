export const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "neoworker:left-sidebar-collapsed";

export const ARTIFACT_FOCUS_MIN_SIDEBAR_WIDTH = 520;
export const ARTIFACT_FOCUS_MIN_MAIN_WIDTH = 420;
export const ARTIFACT_FOCUS_DIVIDER_WIDTH = 8;
export const ARTIFACT_FOCUS_MIN_SPLIT_WIDTH =
  ARTIFACT_FOCUS_MIN_SIDEBAR_WIDTH +
  ARTIFACT_FOCUS_MIN_MAIN_WIDTH +
  ARTIFACT_FOCUS_DIVIDER_WIDTH;

type SidebarShortcutEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target"
>;

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as Partial<HTMLElement>;
  if (candidate.isContentEditable) return true;
  return Boolean(
    typeof candidate.closest === "function" &&
    candidate.closest("input, textarea, select, [contenteditable='true']"),
  );
}

export function isLeftSidebarToggleShortcut(
  event: SidebarShortcutEvent,
): boolean {
  if (event.altKey || event.shiftKey || isEditableShortcutTarget(event.target))
    return false;
  return event.key.toLowerCase() === "b" && (event.metaKey || event.ctrlKey);
}

export function getLeftSidebarShortcutLabel(platform: string): string {
  return platform === "darwin" ? "⌘B" : "Ctrl+B";
}

export function getArtifactOpenMode(
  availableWidth: number,
): "sidebar" | "fullscreen" {
  return availableWidth >= ARTIFACT_FOCUS_MIN_SPLIT_WIDTH
    ? "sidebar"
    : "fullscreen";
}

export function clampArtifactFocusSidebarWidth(
  preferredWidth: number,
  availableWidth: number,
): number {
  const maxWidth = Math.max(
    ARTIFACT_FOCUS_MIN_SIDEBAR_WIDTH,
    availableWidth -
      ARTIFACT_FOCUS_MIN_MAIN_WIDTH -
      ARTIFACT_FOCUS_DIVIDER_WIDTH,
  );
  return Math.min(
    Math.max(preferredWidth, ARTIFACT_FOCUS_MIN_SIDEBAR_WIDTH),
    maxWidth,
  );
}
