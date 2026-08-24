/**
 * Tests for research chat routing logic.
 * When chatId is in researchChatIds (Telegram/WhatsApp), message text is rewritten
 * and agent role is set when the role exists.
 */

import { describe, it, expect, vi } from "vitest";
import { applyResearchChatRouting } from "../router-research-routing";

describe("applyResearchChatRouting", () => {
  it("applies research routing when chatId is in researchChatIds (Telegram)", () => {
    const roleExists = vi.fn().mockReturnValue(true);
    const result = applyResearchChatRouting({
      channelType: "telegram",
      channelConfig: {
        researchChatIds: ["-1001234567890", "-1009876543210"],
        researchAgentRoleId: "role-research-1",
      },
      chatId: "-1001234567890",
      originalText: "https://example.com/article",
      roleExists,
    });

    expect(result).not.toBeNull();
    expect(result!.text).toBe(
      "Research the following links and build a findings report with classification: https://example.com/article",
    );
    expect(result!.agentRoleId).toBe("role-research-1");
    expect(roleExists).toHaveBeenCalledWith("role-research-1");
  });

  it("applies research routing when chatId is in researchChatIds (WhatsApp)", () => {
    const result = applyResearchChatRouting({
      channelType: "whatsapp",
      channelConfig: {
        researchChatIds: ["120363012345678@g.us"],
      },
      chatId: "120363012345678@g.us",
      originalText: "Check out https://news.site/tech",
      roleExists: () => true,
    });

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Research the following links");
    expect(result!.text).toContain("https://news.site/tech");
  });

  it("returns null when chatId is not in researchChatIds", () => {
    const result = applyResearchChatRouting({
      channelType: "telegram",
      channelConfig: {
        researchChatIds: ["-1001234567890"],
      },
      chatId: "-9999999999",
      originalText: "https://example.com",
      roleExists: () => true,
    });

    expect(result).toBeNull();
  });

  it("returns null for Discord (unsupported channel)", () => {
    const result = applyResearchChatRouting({
      channelType: "discord",
      channelConfig: {
        researchChatIds: ["12345"],
      },
      chatId: "12345",
      originalText: "https://example.com",
      roleExists: () => true,
    });

    expect(result).toBeNull();
  });

  it("returns null when securityContext already has agentRoleId", () => {
    const result = applyResearchChatRouting({
      channelType: "telegram",
      channelConfig: {
        researchChatIds: ["-1001234567890"],
        researchAgentRoleId: "role-research-1",
      },
      chatId: "-1001234567890",
      originalText: "https://example.com",
      currentAgentRoleId: "role-already-set",
      roleExists: () => true,
    });

    expect(result).toBeNull();
  });

  it("does not set agentRoleId when role does not exist", () => {
    const result = applyResearchChatRouting({
      channelType: "telegram",
      channelConfig: {
        researchChatIds: ["-1001234567890"],
        researchAgentRoleId: "nonexistent-role",
      },
      chatId: "-1001234567890",
      originalText: "https://example.com",
      roleExists: () => false,
    });

    expect(result).not.toBeNull();
    expect(result!.text).toContain("Research the following links");
    expect(result!.agentRoleId).toBeUndefined();
  });

  it("falls back to defaultAgentRoleId when researchAgentRoleId is not set", () => {
    const roleExists = vi.fn().mockReturnValue(true);
    const result = applyResearchChatRouting({
      channelType: "telegram",
      channelConfig: {
        researchChatIds: ["-1001234567890"],
        defaultAgentRoleId: "default-role-id",
      },
      chatId: "-1001234567890",
      originalText: "https://example.com",
      roleExists,
    });

    expect(result).not.toBeNull();
    expect(result!.agentRoleId).toBe("default-role-id");
    expect(roleExists).toHaveBeenCalledWith("default-role-id");
  });
});
