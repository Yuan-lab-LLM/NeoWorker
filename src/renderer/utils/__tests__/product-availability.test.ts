import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkillCapabilityCandidate } from "../model-capability-visibility";
import {
  areProductIntegrationsVisible,
  CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER,
  getRequiredHiddenCommunicationChannel,
  isVideoSkillCandidate,
  isPluginPackVisibleForCurrentProductSupport,
  isProductIntegrationVisible,
  isSkillVisibleForCurrentProductSupport,
} from "../product-availability";

function readSkillDirectory(
  relativeDirectory: string,
): SkillCapabilityCandidate[] {
  const directory = path.resolve(process.cwd(), relativeDirectory);
  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) =>
      JSON.parse(fs.readFileSync(path.join(directory, fileName), "utf8")),
    ) as SkillCapabilityCandidate[];
}

describe("current product availability", () => {
  it("uses the same five communication channels exposed by Settings", () => {
    expect(CURRENT_PRODUCT_COMMUNICATION_CHANNEL_ORDER).toEqual([
      "weixin",
      "wecom",
      "dingtalk",
      "feishu",
      "email",
    ]);
  });

  it("hides ideas that require legacy messaging channels or unavailable overseas services", () => {
    expect(areProductIntegrationsVisible(["slack"])).toBe(false);
    expect(areProductIntegrationsVisible(["whatsapp"])).toBe(false);
    expect(areProductIntegrationsVisible(["gmail", "calendar"])).toBe(false);
    expect(areProductIntegrationsVisible(["Google Drive"])).toBe(false);
    expect(areProductIntegrationsVisible(["email"])).toBe(true);
    expect(areProductIntegrationsVisible(["notion", "calendar"])).toBe(true);
  });

  it.each([
    "google-workspace",
    "gmail",
    "discord",
    "dropbox",
    "factset",
    "pitchbook",
  ])("does not advertise unconfigured integration %s", (integration) => {
    expect(isProductIntegrationVisible(integration)).toBe(false);
  });

  it.each(["notion", "email", "maps", "wecom"])(
    "keeps current-product integration %s visible",
    (integration) => {
      expect(isProductIntegrationVisible(integration)).toBe(true);
    },
  );

  it.each([
    ["slack", "slack"],
    ["wacli", "whatsapp"],
    ["imsg", "imessage"],
  ])("hides channel-specific bundled skill %s", (id, channel) => {
    const candidate = { id };
    expect(getRequiredHiddenCommunicationChannel(candidate)).toBe(channel);
    expect(isSkillVisibleForCurrentProductSupport(candidate)).toBe(false);
  });

  it.each([
    ["manim-video", "Render a technical animation using local Manim."],
    ["video-frames", "Extract frames from a video."],
    ["youtube", "Fetch captions from YouTube."],
    ["hyperframes", "Build an HTML-native video composition."],
    ["external-video-editor", "Edit and render video clips."],
  ])("removes video skill %s from product surfaces", (id, description) => {
    const candidate = { id, description };
    expect(isVideoSkillCandidate(candidate)).toBe(true);
    expect(isSkillVisibleForCurrentProductSupport(candidate)).toBe(false);
  });

  it.each([
    "bird",
    "codex-cli",
    "crypto-trading",
    "gemini",
    "gog",
    "goplaces",
    "last30days",
    "polymarket",
    "spotify-player",
    "tax-optimizer",
    "twitter",
  ])("hides mainland-incompatible default skill %s", (id) => {
    expect(isSkillVisibleForCurrentProductSupport({ id })).toBe(false);
  });

  it.each([
    "ai-governance-legal-pack",
    "commercial-legal-pack",
    "employment-legal-pack",
    "litigation-legal-pack",
    "privacy-legal-pack",
  ])("hides overseas legal pack %s from the default catalogue", (packId) => {
    expect(isPluginPackVisibleForCurrentProductSupport(packId)).toBe(false);
  });

  it("keeps locally useful packs and skills visible", () => {
    expect(
      isPluginPackVisibleForCurrentProductSupport("data-analysis-pack"),
    ).toBe(true);
    expect(isSkillVisibleForCurrentProductSupport({ id: "analyze-csv" })).toBe(
      true,
    );
    expect(
      isSkillVisibleForCurrentProductSupport({
        id: "financial-analysis-fa-dcf-modeling",
      }),
    ).toBe(true);
  });

  it.each(["registry/skills", "resources/skills"])(
    "removes hidden channel skills from the complete inventory in %s",
    (directory) => {
      const hiddenChannelSkillIds = readSkillDirectory(directory)
        .filter(
          (skill) => getRequiredHiddenCommunicationChannel(skill) !== null,
        )
        .map((skill) => skill.id)
        .filter((id): id is string => Boolean(id))
        .sort();

      expect(hiddenChannelSkillIds).toEqual(["imsg", "slack", "wacli"]);
    },
  );

  it.each(["registry/skills", "resources/skills"])(
    "contains no bundled video skills in %s",
    (directory) => {
      expect(
        readSkillDirectory(directory)
          .filter(isVideoSkillCandidate)
          .map((skill) => skill.id),
      ).toEqual([]);
    },
  );
});
