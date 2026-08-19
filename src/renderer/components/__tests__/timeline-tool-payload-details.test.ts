import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { applyPersistedLanguage } from "../../i18n";
import {
  getToolPayloadSummary,
  renderEventTitle,
  renderEventDetails,
  shouldAutoExpandActiveTimelineEvent,
} from "../MainContent/timeline-event-rendering";

function event(
  type: TaskEvent["type"],
  payload: TaskEvent["payload"],
): TaskEvent {
  return {
    id: `${type}-1`,
    taskId: "task-1",
    type,
    timestamp: 1,
    payload,
  } as TaskEvent;
}

describe("timeline tool payload details", () => {
  it("labels a client timeout as a timeout instead of provider busyness", () => {
    applyPersistedLanguage("zh-CN");
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventTitle(
          event("llm_retry", {
            retryKind: "request_timeout",
            attempt: 1,
            maxRetries: 1,
            delayMs: 1_000,
          }),
        ),
      ),
    );

    expect(markup).toContain("模型响应超时");
    expect(markup).not.toContain("模型服务繁忙");
  });

  it("keeps active tool parameters collapsed instead of forcing raw JSON open", () => {
    expect(
      shouldAutoExpandActiveTimelineEvent(
        event("tool_call", {
          tool: "skill",
          input: { skill: "usecase-inbox-manager", trigger: "explicit_hint" },
        }),
      ),
    ).toBe(false);
  });

  it("keeps approvals compact and replaces raw permission JSON with a readable summary", () => {
    applyPersistedLanguage("zh-CN");
    const approvalEvent = event("approval_requested", {
      approval: {
        id: "approval-1",
        type: "external_service",
        description: "Approve tool call: http_request",
        details: {
          tool: "http_request",
          params: {
            url: "https://d1.weather.com.cn/weather_index/101280101.html",
            headers: {
              Referer: "https://www.weather.com.cn/",
              "User-Agent": "browser-agent",
            },
          },
          permissionPrompt: {
            scope: { kind: "domain", domain: "d1.weather.com.cn" },
            reason: {
              type: "mode",
              summary: "Default mode prompts for external effects.",
            },
          },
        },
      },
    });

    expect(shouldAutoExpandActiveTimelineEvent(approvalEvent)).toBe(false);

    const title = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventTitle(approvalEvent),
      ),
    );
    const details = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(approvalEvent, false, {}),
      ),
    );

    expect(title).toContain("需要确认：访问 d1.weather.com.cn");
    expect(title).not.toContain("Approve tool call");
    expect(title).not.toContain("http_request");
    expect(details).toContain("approval-event-summary");
    expect(details).toContain("NeoWorker 需要访问 d1.weather.com.cn");
    expect(details).toContain("目标");
    expect(details).not.toContain("<pre");
    expect(details).not.toContain("permissionPrompt");
    expect(details).not.toContain("User-Agent");
  });

  it("renders raw input behind a compact technical-details disclosure", () => {
    applyPersistedLanguage("zh-CN");
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(
          event("tool_call", {
            tool: "skill",
            input: {
              skill: "usecase-inbox-manager",
              args: "",
              trigger: "explicit_hint",
            },
          }),
          false,
          {},
        ),
      ),
    );

    expect(markup).toContain("tool-payload-technical");
    expect(markup).toContain("查看技术详情");
    expect(markup).toContain("usecase-inbox-manager");
    expect(markup).not.toContain("<details open");
  });

  it("shows a readable result summary before the collapsed technical payload", () => {
    const result = {
      success: true,
      skill_name: "Inbox Manager",
      application_summary:
        "Loaded Inbox Manager as hidden context for the current task.",
      skill_invocation_id: "skill-123",
    };
    expect(getToolPayloadSummary(result)).toBe(
      "Loaded Inbox Manager as hidden context for the current task.",
    );

    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(
          event("tool_result", { tool: "skill", result }),
          false,
          {},
        ),
      ),
    );

    expect(markup).toContain("tool-payload-summary");
    expect(markup).toContain(
      "Loaded Inbox Manager as hidden context for the current task.",
    );
    expect(markup).toContain("skill_invocation_id");
  });

  it("keeps a failed result visible while raw failure metadata stays collapsible", () => {
    const failure = event("tool_result", {
      tool: "write_file",
      result: { success: false, error: "Write timed out" },
    });

    expect(shouldAutoExpandActiveTimelineEvent(failure)).toBe(true);
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(failure, false, {}),
      ),
    );
    expect(markup).toContain("is-error");
    expect(markup).toContain("Write timed out");
    expect(markup).not.toContain("<details open");
  });

  it("does not treat an automatic capability fallback as a fatal tool error", () => {
    const fallback = event("tool_result", {
      tool: "Skill",
      result: {
        success: false,
        error: "Skill 'stock-analysis' is not currently executable",
        nonBlocking: true,
        recoverableFallback: true,
        fallback: "continue_without_skill",
      },
    });

    expect(shouldAutoExpandActiveTimelineEvent(fallback)).toBe(false);
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(fallback, false, {}),
      ),
    );
    expect(markup).not.toContain("is-error");
    expect(markup).toContain("continue_without_skill");
  });

  it("hides unrecoverable mojibake from historical web results", () => {
    applyPersistedLanguage("zh-CN");
    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(
          event("tool_result", {
            tool: "web_fetch",
            result: {
              success: true,
              url: "https://q.stock.sohu.com/cn/000977/lshq.shtml",
              title: "���Ϣ(000977)",
              content: "����������������",
            },
          }),
          false,
          {},
        ),
      ),
    );

    expect(markup).not.toContain("���Ϣ");
    expect(markup).toContain("q.stock.sohu.com");
  });
});
