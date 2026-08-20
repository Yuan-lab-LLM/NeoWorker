import { describe, expect, it } from "vitest";
import { repairHiddenHtmlContent } from "../html-content-visibility";

describe("repairHiddenHtmlContent", () => {
  it("makes reveal content visible when an animation hides it by default", () => {
    const source = `<!doctype html><html><head><style>
      .reveal { opacity: 0; transform: translateY(8px); }
      .reveal.visible { opacity: 1; }
    </style></head><body><section><p class="reveal">正文</p></section></body></html>`;

    const result = repairHiddenHtmlContent(source);

    expect(result.repaired).toBe(true);
    expect(result.content).toContain("data-neoworker-content-visibility-guard");
    expect(result.content).toContain("opacity: 1 !important");
    expect(result.content).toContain("正文");
  });

  it("repairs reveal content hidden with visibility hidden", () => {
    const source = `<html><head><style>[data-reveal] { visibility: hidden; }</style></head>
      <body><div data-reveal>报告内容</div></body></html>`;

    expect(repairHiddenHtmlContent(source).repaired).toBe(true);
  });

  it("does not change ordinary HTML", () => {
    const source = "<html><head><style>.card { opacity: 0; }</style></head><body><p>正文</p></body></html>";

    expect(repairHiddenHtmlContent(source)).toEqual({
      content: source,
      repaired: false,
      reasons: [],
    });
  });

  it("does not mistake a partially transparent reveal animation for hidden content", () => {
    const source = `<html><head><style>.reveal { opacity: 0.5; }</style></head>
      <body><div class="reveal">仍然可见</div></body></html>`;

    expect(repairHiddenHtmlContent(source)).toEqual({
      content: source,
      repaired: false,
      reasons: [],
    });
  });

  it("is idempotent", () => {
    const source = `<html><head><style>.reveal{opacity:0}</style></head>
      <body><div class="reveal">正文</div></body></html>`;
    const first = repairHiddenHtmlContent(source);
    const second = repairHiddenHtmlContent(first.content);

    expect(first.repaired).toBe(true);
    expect(second.repaired).toBe(false);
    expect(second.content).toBe(first.content);
  });

  it("does not modify non-HTML text", () => {
    const source = ".reveal { opacity: 0 }";
    expect(repairHiddenHtmlContent(source).repaired).toBe(false);
  });
});
