import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const settingsPath = fileURLToPath(new URL("../Settings.tsx", import.meta.url));
const settingsStylesPath = fileURLToPath(
  new URL("../settings.css", import.meta.url),
);
const availabilityPath = fileURLToPath(
  new URL("../../utils/product-availability.ts", import.meta.url),
);

describe("Communication channel curation", () => {
  it("focuses the initial release on channels broadly usable in mainland China", () => {
    const source = readFileSync(availabilityPath, "utf8");
    const initialReleaseChannels = source.match(
      /const CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER[\s\S]*?\n\] as const;/,
    )?.[0];

    expect(initialReleaseChannels).toContain('"weixin"');
    expect(initialReleaseChannels).toContain('"wecom"');
    expect(initialReleaseChannels).toContain('"dingtalk"');
    expect(initialReleaseChannels).toContain('"feishu"');
    expect(initialReleaseChannels).toContain('"email"');
    expect(initialReleaseChannels).not.toContain('"telegram"');
    expect(initialReleaseChannels).not.toContain('"slack"');
    expect(initialReleaseChannels).not.toContain('"whatsapp"');
  });

  it("keeps already-configured non-default channels visible", () => {
    const source = readFileSync(settingsPath, "utf8");

    expect(source).toContain("const visibleCommunicationChannels = useMemo");
    expect(source).toContain(
      "INITIAL_RELEASE_COMMUNICATION_CHANNELS.has(definition.key)",
    );
    expect(source).toContain(
      "gatewayChannelByType.has(definition.channelType)",
    );
    expect(source).toContain(
      "visibleCommunicationChannels.map((definition) =>",
    );
  });

  it("keeps direct channel submit buttons compact and right aligned", () => {
    const styles = readFileSync(settingsStylesPath, "utf8");

    expect(styles).toMatch(
      /\.channel-config-expanded-content\s+\.settings-section\s*>\s*\.settings-button-primary[\s\S]*?grid-column:\s*1\s*\/\s*-1;/,
    );
    expect(styles).toMatch(
      /\.channel-config-expanded-content\s+\.settings-section[\s\S]*?>\s*:is\([\s\S]*?\.settings-button-primary[\s\S]*?\)\s*\{[\s\S]*?width:\s*auto;[\s\S]*?min-width:\s*132px;[\s\S]*?justify-self:\s*end;/,
    );
  });
});
