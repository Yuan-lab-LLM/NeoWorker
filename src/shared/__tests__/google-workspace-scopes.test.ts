import { describe, expect, it } from "vitest";
import {
  GMAIL_DEFAULT_SCOPES,
  GOOGLE_SCOPE_PRESENTATIONS,
  GOOGLE_SCOPE_TASKS,
  GOOGLE_WORKSPACE_DEFAULT_SCOPES,
  getMissingGoogleScopesForMode,
  getMissingGoogleWorkspaceScopes,
  inferGoogleWorkspaceConnectionMode,
  getGoogleWorkspaceSettingsForAccount,
  mergeGoogleScopesForMode,
  mergeGoogleWorkspaceScopes,
  removeGoogleWorkspaceAccount,
  upsertGoogleWorkspaceAccount,
} from "../google-workspace";

describe("Google Workspace OAuth scopes", () => {
  it("includes Tasks and Slides scopes in the default Workspace consent set", () => {
    expect(GOOGLE_WORKSPACE_DEFAULT_SCOPES).toEqual(
      expect.arrayContaining([GOOGLE_SCOPE_TASKS, GOOGLE_SCOPE_PRESENTATIONS]),
    );
  });

  it("merges new required Workspace scopes into older saved scope lists", () => {
    expect(mergeGoogleWorkspaceScopes(["https://www.googleapis.com/auth/drive"])).toEqual(
      expect.arrayContaining([GOOGLE_SCOPE_TASKS, GOOGLE_SCOPE_PRESENTATIONS]),
    );
  });

  it("reports missing scopes only when a saved scope list is available", () => {
    expect(getMissingGoogleWorkspaceScopes(undefined)).toEqual([]);
    expect(getMissingGoogleWorkspaceScopes(["https://www.googleapis.com/auth/drive"])).toEqual(
      expect.arrayContaining([GOOGLE_SCOPE_TASKS, GOOGLE_SCOPE_PRESENTATIONS]),
    );
  });

  it("keeps Gmail-only consent scoped to Gmail services", () => {
    expect(mergeGoogleScopesForMode(undefined, "gmail")).toEqual(GMAIL_DEFAULT_SCOPES);
    expect(getMissingGoogleScopesForMode(GMAIL_DEFAULT_SCOPES, "gmail")).toEqual([]);
    expect(getMissingGoogleScopesForMode(GMAIL_DEFAULT_SCOPES, "workspace")).toEqual(
      expect.arrayContaining([GOOGLE_SCOPE_TASKS, GOOGLE_SCOPE_PRESENTATIONS]),
    );
  });

  it("infers full Workspace mode from non-Gmail scopes", () => {
    expect(inferGoogleWorkspaceConnectionMode(undefined, GMAIL_DEFAULT_SCOPES)).toBe("gmail");
    expect(inferGoogleWorkspaceConnectionMode(undefined, GOOGLE_WORKSPACE_DEFAULT_SCOPES)).toBe(
      "workspace",
    );
  });

  it("stores and selects multiple Google accounts", () => {
    const first = upsertGoogleWorkspaceAccount(
      { enabled: true, connectionMode: "gmail", scopes: GMAIL_DEFAULT_SCOPES },
      {
        email: "First@Example.com",
        accessToken: "first-access",
        refreshToken: "first-refresh",
        scopes: GMAIL_DEFAULT_SCOPES,
        connectionMode: "gmail",
      },
    );
    const second = upsertGoogleWorkspaceAccount(first, {
      email: "second@example.com",
      accessToken: "second-access",
      refreshToken: "second-refresh",
      scopes: GMAIL_DEFAULT_SCOPES,
      connectionMode: "gmail",
    });

    expect(second.accounts?.map((account) => account.email)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(second.activeAccountEmail).toBe("second@example.com");
    expect(getGoogleWorkspaceSettingsForAccount(second, "first@example.com").accessToken).toBe(
      "first-access",
    );
    expect(removeGoogleWorkspaceAccount(second, "second@example.com").activeAccountEmail).toBe(
      "first@example.com",
    );
  });
});
