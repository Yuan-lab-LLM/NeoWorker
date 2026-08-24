import { describe, expect, it } from "vitest";

import {
  resolvePresentationTitleColor,
  resolvePresentationVisualMode,
} from "../pptx-generator";

const slides = [{ title: "Overview" }];

describe("resolvePresentationTitleColor", () => {
  it("uses an explicit title color", () => {
    expect(resolvePresentationTitleColor({ slides, titleColor: "#c00" })).toBe("#CC0000");
  });

  it("understands a Chinese request to make every title red", () => {
    expect(
      resolvePresentationTitleColor({
        slides,
        styleBrief: "商务汇报风格，所有标题使用红色，数据表格清晰",
        brand: { primaryColor: "#CC0000" },
      }),
    ).toBe("#CC0000");
  });

  it("uses the brand primary color when the brief requests brand-colored titles", () => {
    expect(
      resolvePresentationTitleColor({
        slides,
        styleBrief: "Use the brand primary color for all slide titles",
        brand: { primaryColor: "#14532D" },
      }),
    ).toBe("#14532D");
  });

  it("keeps the default title treatment when no title color is requested", () => {
    expect(
      resolvePresentationTitleColor({
        slides,
        styleBrief: "Use a restrained editorial rhythm with compact tables",
        brand: { primaryColor: "#CC0000" },
      }),
    ).toBeUndefined();
  });
});

describe("resolvePresentationVisualMode", () => {
  it("routes stock and valuation decks to the dedicated research visual system", () => {
    expect(
      resolvePresentationVisualMode({
        title: "浪潮信息（000977.SZ）投资分析",
        visualMode: "technical",
        slides: [{ title: "估值分析：静态贵、动态不贵" }],
      }),
    ).toBe("research");
  });

  it("preserves an explicit non-research direction for unrelated decks", () => {
    expect(
      resolvePresentationVisualMode({
        title: "产品发布方案",
        visualMode: "premium",
        slides,
      }),
    ).toBe("premium");
  });
});
