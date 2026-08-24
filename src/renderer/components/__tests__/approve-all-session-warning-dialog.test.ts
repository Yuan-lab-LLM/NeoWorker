import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyPersistedLanguage } from "../../i18n";
import { ApproveAllSessionWarningDialog } from "../ApproveAllSessionWarningDialog";

describe("ApproveAllSessionWarningDialog", () => {
  beforeEach(() => {
    applyPersistedLanguage("zh-CN");
  });

  it("explains the scope and uses a concrete confirmation action", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApproveAllSessionWarningDialog, {
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }),
    );

    expect(html).toContain("为当前任务开启自动批准？");
    expect(html).toContain("后续权限请求会直接执行");
    expect(html).toContain("仅限当前任务");
    expect(html).toContain("任务结束后恢复逐次确认");
    expect(html).toContain("开启自动批准");
    expect(html).not.toContain("⚠️");
    expect(html).not.toContain("我明白");
    expect(html).not.toContain("session-approval-btn-danger-primary");
  });
});
