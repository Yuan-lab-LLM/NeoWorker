import { describe, expect, it } from "vitest";

import type { IntegrationMentionOption } from "../../../shared/types";
import { areIntegrationMentionOptionsEqual } from "../integration-mention-options";

const baseOption: IntegrationMentionOption = {
  id: "gmail",
  label: "Gmail",
  source: "builtin",
  providerKey: "gmail",
  iconKey: "gmail",
  tools: ["search", "send"],
  promptHint: "Use Gmail",
  description: "Search and send mail",
  aliases: ["mail"],
  status: "connected",
};

describe("areIntegrationMentionOptionsEqual", () => {
  it("treats separately allocated but equivalent option lists as equal", () => {
    expect(
      areIntegrationMentionOptionsEqual([baseOption], [{ ...baseOption }]),
    ).toBe(true);
  });

  it("detects changed nested option fields", () => {
    expect(
      areIntegrationMentionOptionsEqual(
        [baseOption],
        [{ ...baseOption, tools: ["search"] }],
      ),
    ).toBe(false);
    expect(
      areIntegrationMentionOptionsEqual(
        [baseOption],
        [{ ...baseOption, status: "configured" }],
      ),
    ).toBe(false);
  });
});
