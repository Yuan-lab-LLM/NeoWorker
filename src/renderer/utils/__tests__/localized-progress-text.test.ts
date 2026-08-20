import { afterEach, describe, expect, it } from "vitest";
import { applyPersistedLanguage } from "../../i18n";
import { localizeProgressText } from "../localized-progress-text";

describe("localizeProgressText", () => {
  afterEach(() => applyPersistedLanguage("zh-CN"));

  it("localizes a Claude credential failure", () => {
    applyPersistedLanguage("zh-CN");

    expect(
      localizeProgressText(
        "Failed: Claude API key or subscription token is required. Configure it in Settings or get one from https://console.anthropic.com/",
      ),
    ).toBe(
      "失败：缺少 Claude API 密钥或订阅令牌，请在“设置”中完成配置，或前往 Anthropic 控制台获取密钥。",
    );
  });

  it("keeps the original failure in English mode", () => {
    applyPersistedLanguage("en");
    const failure = "Failed: Claude API key or subscription token is required.";

    expect(localizeProgressText(failure)).toBe(failure);
  });

  it("localizes internal tool-batch labels instead of leaking executor English", () => {
    applyPersistedLanguage("zh-CN");

    expect(localizeProgressText("Starting Tool batch (2)")).toBe(
      "开始执行 2 项工具操作",
    );
    expect(localizeProgressText("Tool batch (3)")).toBe("3 项工具操作");
  });

  it("localizes Office quality-check progress emitted by the main process", () => {
    applyPersistedLanguage("zh-CN");
    expect(
      localizeProgressText("Preparing the Office document quality check..."),
    ).toBe("正在准备 Office 文档质检...");
    expect(
      localizeProgressText(
        "The Office file was generated, but the quality check found 2 issue(s) to address.",
      ),
    ).toBe("Office 文件已生成，质检发现 2 个待处理问题。");
  });

  it("uses the product-facing Office tool name in progress text", () => {
    applyPersistedLanguage("zh-CN");
    expect(
      localizeProgressText("用 OfficeCLI 结构化生成 PPTX 文件并做质量校验"),
    ).toBe("用 Office工具 结构化生成 PPTX 文件并做质量校验");

    applyPersistedLanguage("en");
    expect(localizeProgressText("Working with OfficeCLI")).toBe(
      "Working with Office tools",
    );
  });
});
