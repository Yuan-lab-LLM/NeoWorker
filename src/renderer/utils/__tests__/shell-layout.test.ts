import { describe, expect, it } from "vitest";
import {
  ARTIFACT_FOCUS_MIN_SPLIT_WIDTH,
  clampArtifactFocusSidebarWidth,
  getArtifactOpenMode,
  getLeftSidebarShortcutLabel,
  isLeftSidebarToggleShortcut,
} from "../shell-layout";

describe("shell layout", () => {
  it("recognizes the platform sidebar shortcut without hijacking editable fields", () => {
    const target = {
      isContentEditable: false,
      closest: () => null,
    } as unknown as EventTarget;
    expect(
      isLeftSidebarToggleShortcut({
        altKey: false,
        ctrlKey: false,
        key: "b",
        metaKey: true,
        shiftKey: false,
        target,
      }),
    ).toBe(true);

    const input = {
      isContentEditable: false,
      closest: () => ({ tagName: "INPUT" }),
    } as unknown as EventTarget;
    expect(
      isLeftSidebarToggleShortcut({
        altKey: false,
        ctrlKey: true,
        key: "B",
        metaKey: false,
        shiftKey: false,
        target: input,
      }),
    ).toBe(false);
  });

  it("uses a split view only when both panes retain their minimum width", () => {
    expect(getArtifactOpenMode(ARTIFACT_FOCUS_MIN_SPLIT_WIDTH - 1)).toBe(
      "fullscreen",
    );
    expect(getArtifactOpenMode(ARTIFACT_FOCUS_MIN_SPLIT_WIDTH)).toBe("sidebar");
  });

  it("keeps artifact focus at least 520px without shrinking the timeline below 420px", () => {
    expect(clampArtifactFocusSidebarWidth(420, 1200)).toBe(520);
    expect(clampArtifactFocusSidebarWidth(900, 1200)).toBe(772);
  });

  it("formats shortcut labels by platform", () => {
    expect(getLeftSidebarShortcutLabel("darwin")).toBe("⌘B");
    expect(getLeftSidebarShortcutLabel("win32")).toBe("Ctrl+B");
  });
});
