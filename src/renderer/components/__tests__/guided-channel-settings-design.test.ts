import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");

describe("guided communication channel setup", () => {
  it("uses one consistent low-friction setup shell", () => {
    const wecom = readSource("../WeComSettings.tsx");
    const dingtalk = readSource("../DingTalkSettings.tsx");
    const feishu = readSource("../FeishuSettings.tsx");

    for (const source of [wecom, dingtalk, feishu]) {
      expect(source).toContain("GuidedChannelSetup");
      expect(source).toContain("formTitle=");
      expect(source).toContain("portalLabel=");
      expect(source).toContain("advanced=");
    }
  });

  it("keeps technical fields behind progressive disclosure", () => {
    const styles = readSource("../guided-channel-setup.css");
    const wecom = readSource("../WeComSettings.tsx");

    expect(styles).toContain(".guided-channel-advanced");
    expect(styles).toContain(".guided-channel-advanced-grid");
    expect(wecom).toContain("createCallbackToken");
    expect(wecom).toContain("guided-channel-inline-control");
  });

  it("collapses the split layout and field grids on narrow screens", () => {
    const styles = readSource("../guided-channel-setup.css");

    expect(styles).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.guided-channel-shell[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(styles).toMatch(
      /@media \(max-width: 650px\)[\s\S]*?\.guided-channel-fields,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });

  it("separates popular email choices from advanced providers", () => {
    const email = readSource("../EmailSettings.tsx");

    expect(email).toContain("POPULAR_EMAIL_PROVIDER_IDS");
    expect(email).toContain("email-provider-group-secondary");
    expect(email).toContain("email-provider-card-badge");
  });
});
