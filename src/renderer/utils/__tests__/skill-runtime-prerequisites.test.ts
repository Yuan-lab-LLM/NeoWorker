import { describe, expect, it } from "vitest";
import {
  requiresMailboxConnection,
  resolveRequestedSkillId,
} from "../skill-runtime-prerequisites";

describe("skill runtime prerequisites", () => {
  it("prefers the structured skill selection", () => {
    expect(resolveRequestedSkillId("usecase-inbox-manager", "普通任务")).toBe(
      "usecase-inbox-manager",
    );
  });

  it("recognizes legacy prompt invocations", () => {
    expect(
      resolveRequestedSkillId(
        undefined,
        "使用 usecase-inbox-manager 技能。分流过去 24 小时的收件箱。",
      ),
    ).toBe("usecase-inbox-manager");
  });

  it("requires a mailbox for inbox triage and transaction scanning", () => {
    expect(requiresMailboxConnection("usecase-inbox-manager")).toBe(true);
    expect(requiresMailboxConnection("usecase-transaction-scan")).toBe(true);
    expect(requiresMailboxConnection("compare-files")).toBe(false);
  });
});
