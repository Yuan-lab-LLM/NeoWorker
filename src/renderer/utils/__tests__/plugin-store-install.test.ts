import { describe, expect, it } from "vitest";

import {
  classifyPluginStoreInstallSource,
  isClawHubSkillSource,
  isGitPluginUrl,
} from "../plugin-store-install";

describe("isGitPluginUrl", () => {
  it("detects git URLs for known git install formats", () => {
    expect(isGitPluginUrl("git@github.com:owner/repo.git")).toBe(true);
    expect(isGitPluginUrl("github:owner/repo")).toBe(true);
    expect(isGitPluginUrl("https://github.com/owner/repo")).toBe(true);
    expect(isGitPluginUrl("https://github.com/owner/repo.git")).toBe(true);
  });

  it("does not misclassify manifest URLs that include github path segments", () => {
    expect(
      isGitPluginUrl(
        "https://raw.githubusercontent.com/org/repo/main/neoworker.plugin.json",
      ),
    ).toBe(false);
    expect(
      isGitPluginUrl(
        "https://api.github.com/repos/org/repo/contents/neoworker.plugin.json",
      ),
    ).toBe(false);
    expect(
      isGitPluginUrl(
        "https://example.com/api/neoworker.github.com/manifest/neoworker.plugin.json",
      ),
    ).toBe(false);
  });

  it("returns false for unsupported strings", () => {
    expect(isGitPluginUrl("")).toBe(false);
    expect(isGitPluginUrl("neoworker.pack.tar.gz")).toBe(false);
  });
});

describe("isClawHubSkillSource", () => {
  it("detects ClawHub skill identifiers and page URLs", () => {
    expect(isClawHubSkillSource("clawhub:openclaw-tavily-search")).toBe(true);
    expect(
      isClawHubSkillSource(
        "https://clawhub.ai/jacky1n7/skills/openclaw-tavily-search",
      ),
    ).toBe(true);
    expect(isClawHubSkillSource("https://clawhub.ai/openclaw-tavily-search")).toBe(
      true,
    );
  });

  it("does not classify the ClawHub index or unrelated URLs as skills", () => {
    expect(isClawHubSkillSource("https://clawhub.ai/skills")).toBe(false);
    expect(isClawHubSkillSource("https://github.com/owner/repo")).toBe(false);
    expect(isClawHubSkillSource("")).toBe(false);
  });
});

describe("classifyPluginStoreInstallSource", () => {
  it("routes ClawHub pages to the skill installer", () => {
    expect(
      classifyPluginStoreInstallSource(
        "https://clawhub.ai/jacky1n7/skills/openclaw-tavily-search",
      ),
    ).toBe("clawhub-skill");
  });

  it("keeps Git repositories and direct manifests on plugin installers", () => {
    expect(
      classifyPluginStoreInstallSource("https://github.com/owner/repo"),
    ).toBe("git-plugin");
    expect(
      classifyPluginStoreInstallSource(
        "https://example.com/neoworker.plugin.json",
      ),
    ).toBe("manifest-plugin");
  });
});
