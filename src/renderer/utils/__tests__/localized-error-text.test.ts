import { afterEach, describe, expect, it } from "vitest";
import { applyPersistedLanguage } from "../../i18n";
import { localizeErrorText } from "../localized-error-text";

describe("localizeErrorText", () => {
  afterEach(() => {
    applyPersistedLanguage("en");
  });

  it("keeps the original message when English is selected", () => {
    applyPersistedLanguage("en");
    const message =
      "Iteration limit exceeded: 100/100 iterations. Task stopped to prevent runaway execution.";

    expect(localizeErrorText(message)).toBe(message);
  });

  it("localizes iteration guardrail errors when Chinese is selected", () => {
    applyPersistedLanguage("zh-CN");

    expect(
      localizeErrorText(
        "Iteration limit exceeded: 100/100 iterations. Task stopped to prevent runaway execution.",
      ),
    ).toBe("已达到迭代次数上限：100/100 次。为防止任务失控，任务已停止。");
  });

  it("localizes budget and provider errors", () => {
    applyPersistedLanguage("zh-CN");

    expect(
      localizeErrorText(
        "Token budget exceeded: 12,500/10,000 tokens. Estimated cost: $1.25",
      ),
    ).toBe("已超出 Token 预算：12,500/10,000。预估费用：$1.25");
    expect(
      localizeErrorText("Rate limit exceeded. Will retry automatically."),
    ).toBe("请求频率已超出限制，系统将自动重试。");
  });

  it("localizes app-authored wrappers but preserves unknown diagnostics", () => {
    applyPersistedLanguage("zh-CN");

    expect(localizeErrorText("Error")).toBe("错误");
    expect(localizeErrorText("Task execution failed: socket hang up")).toBe(
      "任务执行失败：socket hang up",
    );
    expect(localizeErrorText("ECONNRESET from upstream.example")).toBe(
      "ECONNRESET from upstream.example",
    );
  });

  it("localizes background WeChat errors without leaking Chinese in English mode", () => {
    const error = "WeChat attachment exceeds the 25MB limit";
    applyPersistedLanguage("en");
    expect(localizeErrorText(error)).toBe(error);

    applyPersistedLanguage("zh-CN");
    expect(localizeErrorText(error)).toBe("微信附件超过 25MB 限制");
    expect(
      localizeErrorText(
        "WeChat login has expired. Scan the QR code to reconnect.",
      ),
    ).toBe("微信登录已失效，请重新扫码连接。");
  });
});
