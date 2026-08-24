import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONALITY_CONFIG_V2,
  type PersonalityConfigV2,
} from "../../../../shared/types";
import { localizePersonalityPreview } from "../personality-preview-localizer";

function createConfig(): PersonalityConfigV2 {
  return structuredClone(DEFAULT_PERSONALITY_CONFIG_V2);
}

describe("localizePersonalityPreview", () => {
  it("keeps the runtime prompt unchanged for English", () => {
    const raw = "RESPONSE STYLE PREFERENCES:\n- Keep responses brief";
    expect(localizePersonalityPreview(raw, createConfig(), "all", "en")).toBe(
      raw,
    );
  });

  it("renders a fully localized Chinese settings preview", () => {
    const config = createConfig();
    config.activePersona = "companion";
    const preview = localizePersonalityPreview(
      "RESPONSE STYLE PREFERENCES:\nCHARACTER OVERLAY - COMPANION STYLE:",
      config,
      "coding",
      "zh-CN",
    );

    expect(preview).toContain("回应风格偏好：");
    expect(preview).toContain("角色风格：陪伴者");
    expect(preview).not.toContain("RESPONSE STYLE PREFERENCES");
    expect(preview).not.toContain("CHARACTER OVERLAY");
  });

  it("preserves user-authored content while localizing its labels", () => {
    const config = createConfig();
    config.customInstructions.aboutUser = "我负责产品设计";
    config.rules = [
      {
        id: "rule-1",
        type: "prefer",
        rule: "先给出结论",
        enabled: true,
      },
    ];

    const preview = localizePersonalityPreview("raw", config, "all", "zh-CN");
    expect(preview).toContain("关于用户：“我负责产品设计”");
    expect(preview).toContain("优先：先给出结论");
  });
});
