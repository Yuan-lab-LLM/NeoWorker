import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GMAIL_DEFAULT_SCOPES,
  GOOGLE_SCOPE_DRIVE,
  GOOGLE_SCOPE_TASKS,
} from "../../../shared/google-workspace";
import { gmailRequest } from "../gmail-api";
import { testGoogleWorkspaceConnection } from "../google-workspace-api";

vi.mock("../gmail-api", () => ({
  gmailRequest: vi.fn(),
}));

vi.mock("../google-workspace-auth", () => ({
  getGoogleWorkspaceAccessToken: vi.fn(),
  refreshGoogleWorkspaceAccessToken: vi.fn(),
}));

describe("testGoogleWorkspaceConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails fast when saved Google Workspace scopes are missing required services", async () => {
    const result = await testGoogleWorkspaceConnection({
      enabled: true,
      connectionMode: "workspace",
      accessToken: "token",
      scopes: [GOOGLE_SCOPE_DRIVE],
    });

    expect(result.success).toBe(false);
    expect(result.missingScopes).toContain(GOOGLE_SCOPE_TASKS);
    expect(result.error).toContain("Reconnect Google Workspace");
  });

  it("accepts the Gmail-only connection mode without requiring Workspace scopes", async () => {
    const gmailRequestMock = gmailRequest as unknown as ReturnType<typeof vi.fn>;
    gmailRequestMock.mockResolvedValueOnce({
      status: 200,
      data: { emailAddress: "person@example.com", historyId: "history-1" },
    });

    const result = await testGoogleWorkspaceConnection({
      enabled: true,
      connectionMode: "gmail",
      accessToken: "token",
      scopes: GMAIL_DEFAULT_SCOPES,
    });

    expect(result).toMatchObject({
      success: true,
      email: "person@example.com",
      userId: "history-1",
    });
    expect(gmailRequestMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        method: "GET",
        path: "/users/me/profile",
      }),
    );
  });
});
