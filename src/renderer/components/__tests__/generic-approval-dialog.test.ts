import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequest } from "../../../shared/types";
import { applyPersistedLanguage } from "../../i18n";
import { GenericApprovalDialog } from "../GenericApprovalDialog";

function makeApproval(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    id: "approval-1",
    taskId: "task-1",
    type: "external_service",
    description: "Approve tool call: open_application",
    details: {
      tool: "open_application",
      params: { appName: "Safari" },
      permissionPrompt: {
        scope: { kind: "tool", toolName: "open_application" },
        scopePreview: "tool open_application",
        reason: {
          type: "mode",
          mode: "default",
          summary:
            "Default mode prompts for writes, deletes, shell, and external effects.",
        },
        suggestedActions: [
          { action: "deny_once", label: "Deny once", effect: "deny" },
          { action: "allow_once", label: "Allow once", effect: "allow" },
        ],
      },
    },
    status: "pending",
    requestedAt: Date.now(),
    ...overrides,
  };
}

describe("GenericApprovalDialog", () => {
  beforeEach(() => {
    applyPersistedLanguage("en");
  });

  it("explains open_application approvals with the concrete app and system action", () => {
    const html = renderToStaticMarkup(
      React.createElement(GenericApprovalDialog, {
        approval: makeApproval(),
        onRespond: vi.fn(),
      }),
    );

    expect(html).toContain("Open application");
    expect(html).toContain("Allow NeoWorker to open Safari?");
    expect(html).toContain("system action");
    expect(html).toContain("open_application");
    expect(html).toContain("Application");
    expect(html).toContain("Safari");
    expect(html).toContain("NeoWorker launches Safari on this computer.");
  });

  it("presents destructive file approvals with a localized target and risk summary", () => {
    applyPersistedLanguage("zh-CN");
    const html = renderToStaticMarkup(
      React.createElement(GenericApprovalDialog, {
        approval: makeApproval({
          type: "delete_file",
          description: "Delete file: approval-ui-preview.tmp",
          details: {
            path: "/tmp/approval-ui-preview.tmp",
            permissionPrompt: {
              scope: {
                kind: "path",
                path: "/tmp/approval-ui-preview.tmp",
                toolName: "delete_file",
              },
              scopePreview: "delete_file on path /tmp/approval-ui-preview.tmp",
              reason: {
                type: "mode",
                mode: "dangerous_only",
                summary:
                  "Dangerous-only mode prompts only for destructive, high-risk, or ambiguous external actions.",
              },
              suggestedActions: [
                { action: "deny_once", label: "Deny once", effect: "deny" },
                { action: "allow_once", label: "Allow once", effect: "allow" },
                {
                  action: "deny_session",
                  label: "Deny session",
                  effect: "deny",
                },
                {
                  action: "allow_session",
                  label: "Allow session",
                  effect: "allow",
                },
              ],
            },
          },
        }),
        onRespond: vi.fn(),
        onApproveAllSession: vi.fn(),
      }),
    );

    expect(html).toContain("NeoWorker 请求删除“approval-ui-preview.tmp”");
    expect(html).toContain("目标文件");
    expect(html).toContain("此操作无法撤销");
    expect(html).toContain("仅限这个文件");
    expect(html).toContain("允许删除");
    expect(html).not.toContain("Dangerous-only mode prompts");
  });

  it("keeps network approvals concise and reduces permission scope to one safe default", () => {
    applyPersistedLanguage("zh-CN");
    const html = renderToStaticMarkup(
      React.createElement(GenericApprovalDialog, {
        approval: makeApproval({
          type: "external_service",
          description: "Approve tool call: http_request",
          details: {
            tool: "http_request",
            permissionPrompt: {
              scope: { kind: "tool", toolName: "http_request" },
              scopePreview: "tool http_request",
              reason: {
                type: "mode",
                mode: "default",
                summary: "Default mode prompts for external effects.",
              },
              suggestedActions: [
                { action: "deny_once", label: "Deny once", effect: "deny" },
                { action: "allow_once", label: "Allow once", effect: "allow" },
                {
                  action: "deny_session",
                  label: "Deny session",
                  effect: "deny",
                },
                {
                  action: "allow_session",
                  label: "Allow session",
                  effect: "allow",
                },
                {
                  action: "deny_workspace",
                  label: "Deny workspace",
                  effect: "deny",
                },
                {
                  action: "allow_workspace",
                  label: "Allow workspace",
                  effect: "allow",
                },
              ],
            },
          },
        }),
        onRespond: vi.fn(),
        onApproveAllSession: vi.fn(),
      }),
    );

    expect(html).toContain("NeoWorker 需要访问网络以继续当前任务");
    expect(html).toContain("建议仅允许这一次");
    expect(html).toContain("在当前任务内记住");
    expect(html).toContain("仅允许这一次");
    expect(html).not.toContain("当前工作区");
    expect(html).not.toContain("配置档案");
    expect(html).not.toContain("session-approval-scope-tabs");
    expect(html).not.toContain("Approve tool call: http_request");
    expect(html).not.toContain("session-approval-scope-disclosure");
    expect(html).not.toContain("本会话全部批准");
  });

  it("presents write_file as a concrete file action instead of an external service", () => {
    applyPersistedLanguage("zh-CN");
    const html = renderToStaticMarkup(
      React.createElement(GenericApprovalDialog, {
        approval: makeApproval({
          description: "Approve tool call: write_file",
          details: {
            tool: "write_file",
            params: { path: "分析报告.md", content: "# 分析报告" },
            permissionPrompt: {
              scope: {
                kind: "path",
                path: "/tmp/分析报告.md",
                toolName: "write_file",
              },
              scopePreview: "write_file on path /tmp/分析报告.md",
              reason: {
                type: "mode",
                mode: "default",
                summary:
                  "Default mode prompts for writes and external effects.",
              },
              suggestedActions: [
                { action: "deny_once", label: "Deny once", effect: "deny" },
                { action: "allow_once", label: "Allow once", effect: "allow" },
                {
                  action: "deny_session",
                  label: "Deny session",
                  effect: "deny",
                },
                {
                  action: "allow_session",
                  label: "Allow session",
                  effect: "allow",
                },
                {
                  action: "deny_workspace",
                  label: "Deny workspace",
                  effect: "deny",
                },
                {
                  action: "allow_workspace",
                  label: "Allow workspace",
                  effect: "allow",
                },
                {
                  action: "deny_profile",
                  label: "Deny profile",
                  effect: "deny",
                },
                {
                  action: "allow_profile",
                  label: "Allow profile",
                  effect: "allow",
                },
              ],
            },
          },
        }),
        onRespond: vi.fn(),
      }),
    );

    expect(html).toContain("写入文件");
    expect(html).toContain("NeoWorker 需要创建或更新文件，才能继续当前任务");
    expect(html).toContain("将创建或更新");
    expect(html).toContain("分析报告.md");
    expect(html).not.toContain("<h3[^>]*>外部服务</h3>");
    expect(html).not.toContain("neoworker-border-beam-host");
  });

  it("locks every decision control while a response is being submitted", () => {
    applyPersistedLanguage("zh-CN");
    const html = renderToStaticMarkup(
      React.createElement(GenericApprovalDialog, {
        approval: makeApproval(),
        onRespond: vi.fn(),
        responding: true,
      }),
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("正在提交审批决定…");
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
