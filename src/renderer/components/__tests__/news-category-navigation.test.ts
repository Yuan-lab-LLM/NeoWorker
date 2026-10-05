import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewsCategoryNavigation } from "../NewsCategoryNavigation";
import { NEWS_FEED_CATEGORIES } from "../news-feed-catalog";
import { applyPersistedLanguage, getCurrentLanguage } from "../../i18n";
let renderer: ReactTestRenderer;
const language = getCurrentLanguage();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", { documentElement: { lang: "zh-CN" }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  applyPersistedLanguage("zh-CN");
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); vi.unstubAllGlobals(); applyPersistedLanguage(language); });
async function mount(extra = {}) {
  const onSelect = vi.fn();
  await act(async () => { renderer = create(React.createElement(NewsCategoryNavigation, { category: "all", onSelect, ...extra })); });
  return { onSelect };
}
describe("all-category navigation", () => {
  it("shows every category directly and selects each without opening a menu", async () => {
    const { onSelect } = await mount();
    const choices = renderer.root.findByType("nav").findAllByType("button");
    expect(choices).toHaveLength(NEWS_FEED_CATEGORIES.length + 1);
    for (const choice of choices) await act(async () => choice.props.onClick());
    expect(onSelect.mock.calls.map(([id]) => id)).toEqual(["all", ...NEWS_FEED_CATEGORIES.map(entry => entry.id)]);
    expect(renderer.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  });
  it("marks only the selected category and keeps all choices enabled", async () => {
    await mount({ category: "health" });
    const choices = renderer.root.findAllByType("button");
    expect(choices.every(choice => !choice.props.disabled)).toBe(true);
    const selected = choices.filter(choice => choice.props["aria-pressed"]);
    expect(selected).toHaveLength(1);
    expect(selected[0].findByType("strong").children).toEqual(["健康与生活"]);
  });
  it("localizes all category labels", async () => {
    applyPersistedLanguage("en");
    await mount();
    expect(renderer.root.findAllByType("strong").map(node => node.children.join(""))).toEqual(["All topics", ...NEWS_FEED_CATEGORIES.map(entry => entry.nameEn)]);
  });
});
