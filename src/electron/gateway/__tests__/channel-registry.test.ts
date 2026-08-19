import { describe, expect, it } from "vitest";
import { getChannelRegistry } from "../channel-registry";

describe("ChannelRegistry", () => {
  const registry = getChannelRegistry();

  it("requires email mode fields for IMAP/SMTP email configs", () => {
    const result = registry.validateConfig("email", {
      protocol: "imap-smtp",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required field: email");
    expect(result.errors).toContain("Missing required field: password");
    expect(result.errors).toContain("Missing required field: imapHost");
    expect(result.errors).toContain("Missing required field: smtpHost");
  });

  it("requires Loom credentials for Loom email configs", () => {
    const result = registry.validateConfig("email", {
      protocol: "loom",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required field: loomBaseUrl");
    expect(result.errors).toContain("Missing required field: loomAccessToken");
  });

  it("rejects invalid LOOM folder names", () => {
    const result = registry.validateConfig("email", {
      protocol: "loom",
      loomBaseUrl: "http://127.0.0.1",
      loomAccessToken: "token",
      loomMailboxFolder: "INBOX/../Work",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("LOOM mailbox folder contains invalid characters");
  });

  it("rejects invalid email protocols", () => {
    const result = registry.validateConfig("email", {
      protocol: "smtp2",
      imapHost: "imap.example.com",
      smtpHost: "smtp.example.com",
      email: "test@example.com",
      password: "secret",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid email protocol: smtp2");
  });

  it("rejects Outlook.com-family accounts for manual IMAP/SMTP setup", () => {
    const result = registry.validateConfig("email", {
      protocol: "imap-smtp",
      email: "user@msn.com",
      password: "secret",
      imapHost: "imap-mail.outlook.com",
      smtpHost: "smtp-mail.outlook.com",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Outlook.com, Hotmail, Live, and MSN accounts require OAuth2/Modern Auth. Use the Outlook.com provider and connect with Microsoft OAuth instead of a password. Before connecting, create a Microsoft Entra app registration for personal Microsoft accounts, add the Mobile and desktop redirect URI http://localhost, and grant delegated Microsoft Graph Mail.ReadWrite permission.",
    );
  });

  it("accepts OAuth-based Outlook.com email configs", () => {
    const result = registry.validateConfig("email", {
      protocol: "imap-smtp",
      authMethod: "oauth",
      oauthProvider: "microsoft",
      oauthClientId: "client-id",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      email: "user@msn.com",
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("marks Telegram, Discord, and Slack as edit-capable with explicit support flags", () => {
    expect(registry.getMetadata("telegram")?.capabilities.supportsEditMessage).toBe(true);
    expect(registry.getMetadata("telegram")?.capabilities.supportsTyping).toBe(true);
    expect(registry.getMetadata("discord")?.capabilities.supportsEditMessage).toBe(true);
    expect(registry.getMetadata("discord")?.capabilities.supportsTyping).toBe(true);
    expect(registry.getMetadata("slack")?.capabilities.supportsEditMessage).toBe(true);
    expect(registry.getMetadata("slack")?.capabilities.supportsTyping).toBe(false);
  });

  it("registers DingTalk as a bidirectional Stream-mode channel", () => {
    const metadata = registry.getMetadata("dingtalk");
    expect(metadata?.builtin).toBe(true);
    expect(metadata?.capabilities.sendMessage).toBe(true);
    expect(metadata?.capabilities.receiveMessage).toBe(true);
    expect(metadata?.capabilities.webhooks).toBe(false);
    expect(
      registry.validateConfig("dingtalk", {
        clientId: "ding-client",
        clientSecret: "ding-secret",
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it("advertises outbound attachment support for personal WeChat", () => {
    const metadata = registry.getMetadata("weixin");
    expect(metadata?.capabilities.sendMessage).toBe(true);
    expect(metadata?.capabilities.receiveMessage).toBe(true);
    expect(metadata?.capabilities.attachments).toBe(true);
  });
});
