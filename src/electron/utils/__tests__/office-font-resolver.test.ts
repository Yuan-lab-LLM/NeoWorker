import { describe, expect, it } from "vitest";
import {
  containsOfficeMojibake,
  resolveOfficeFontPlan,
} from "../office-font-resolver";

describe("office font resolver", () => {
  it("uses platform-safe CJK fonts instead of a macOS-only family everywhere", () => {
    expect(resolveOfficeFontPlan({ platform: "darwin" }).eastAsia).toBe("PingFang SC");
    expect(resolveOfficeFontPlan({ platform: "win32" }).eastAsia).toBe("Microsoft YaHei");
    expect(resolveOfficeFontPlan({ platform: "linux" }).eastAsia).toBe("Noto Sans CJK SC");
  });

  it("records deterministic substitutions when an uploaded template font is missing", () => {
    const plan = resolveOfficeFontPlan({
      platform: "win32",
      availableFonts: ["Arial", "Microsoft YaHei", "Consolas", "Times New Roman"],
      requested: { body: "Missing Corporate Sans", eastAsia: "Missing CJK" },
    });

    expect(plan.body).toBe("Arial");
    expect(plan.eastAsia).toBe("Microsoft YaHei");
    expect(plan.substitutions).toEqual(
      expect.arrayContaining([
        { requested: "Missing Corporate Sans", resolved: "Arial" },
        { requested: "Missing CJK", resolved: "Microsoft YaHei" },
      ]),
    );
  });

  it("detects replacement characters and common UTF-8 mojibake", () => {
    expect(containsOfficeMojibake("正常中文内容")).toBe(false);
    expect(containsOfficeMojibake("坏字符 �")).toBe(true);
    expect(containsOfficeMojibake("Encoded Ã¤Â¸Â­Ã¦Â–Â‡")).toBe(true);
  });
});

