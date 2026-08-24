import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildComposerPermissionOverrides,
  resolveComposerPermissionAccessMode,
  resolveComposerPermissionAccessModeForContext,
} from "../composer-permission";

const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent.tsx", import.meta.url)),
  "utf8",
);

describe("composer permission state", () => {
  it("shows full access for a task persisted with bypass permissions", () => {
    expect(
      resolveComposerPermissionAccessMode("bypass_permissions", "default"),
    ).toBe("full");
  });

  it("honors an explicit standard task mode even when the global default is full", () => {
    expect(resolveComposerPermissionAccessMode("default", "full")).toBe(
      "default",
    );
    expect(resolveComposerPermissionAccessMode("plan", "full")).toBe("default");
  });

  it("uses the configured composer default when a task has no override", () => {
    expect(resolveComposerPermissionAccessMode(undefined, "full")).toBe("full");
  });

  it("builds explicit overrides for both full access and a downgrade", () => {
    expect(buildComposerPermissionOverrides("full", false)).toEqual({
      permissionMode: "bypass_permissions",
      shellAccess: true,
    });
    expect(buildComposerPermissionOverrides("default", false)).toEqual({
      permissionMode: "default",
      shellAccess: false,
    });
    expect(buildComposerPermissionOverrides("default", true)).toEqual({
      permissionMode: "default",
      shellAccess: true,
    });
  });

  it("preserves a user selection while a newly selected task is hydrating", () => {
    expect(
      resolveComposerPermissionAccessModeForContext({
        selectedTaskId: "new-task",
        taskId: null,
        permissionMode: undefined,
        fallback: "default",
        current: "full",
        hasUserSelection: true,
      }),
    ).toBe("full");
    expect(
      resolveComposerPermissionAccessModeForContext({
        selectedTaskId: "new-task",
        taskId: "new-task",
        permissionMode: undefined,
        fallback: "default",
        current: "full",
        hasUserSelection: true,
      }),
    ).toBe("full");
  });

  it("uses the canonical permission after task hydration completes", () => {
    expect(
      resolveComposerPermissionAccessModeForContext({
        selectedTaskId: "new-task",
        taskId: "new-task",
        permissionMode: "bypass_permissions",
        fallback: "default",
        current: "default",
        hasUserSelection: true,
      }),
    ).toBe("full");
    expect(
      resolveComposerPermissionAccessModeForContext({
        selectedTaskId: "new-task",
        taskId: "new-task",
        permissionMode: "default",
        fallback: "full",
        current: "full",
        hasUserSelection: false,
      }),
    ).toBe("default");
  });

  it("does not reset an explicit home selection when defaults hydrate", () => {
    expect(
      resolveComposerPermissionAccessModeForContext({
        selectedTaskId: null,
        taskId: null,
        permissionMode: undefined,
        fallback: "default",
        current: "full",
        hasUserSelection: true,
      }),
    ).toBe("full");
  });

  it("submits the synchronous permission selection and rerenders on policy changes", () => {
    expect(mainContentSource).toContain(
      "permissionAccessModeRef.current,\n      shellEnabled,",
    );
    expect(mainContentSource).toContain(
      'task.agentConfig?.permissionMode ?? ""',
    );
    expect(mainContentSource).toContain(
      'task.agentConfig?.shellAccess ? "shell" : "no-shell"',
    );
  });
});
