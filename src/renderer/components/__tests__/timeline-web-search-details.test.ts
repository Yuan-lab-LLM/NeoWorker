import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { applyPersistedLanguage } from "../../i18n";
import {
  getWebFetchResultDisplay,
  renderEventDetails,
} from "../MainContent/timeline-event-rendering";

describe("web search timeline details", () => {
  it("renders a compact summary instead of the raw result JSON", () => {
    applyPersistedLanguage("zh-CN");
    const event = {
      id: "search-result",
      taskId: "task-1",
      type: "tool_result",
      timestamp: 1,
      payload: {
        tool: "web_search",
        result: {
          query: "AMD AI chip MI400 2026 latest developments",
          searchType: "news",
          resultCount: 10,
          provider: "tavily",
        },
      },
    } as TaskEvent;

    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(event, false, {}),
      ),
    );

    expect(markup).toContain("web-search-event-details");
    expect(markup).toContain("新闻");
    expect(markup).toContain("10 条结果");
    expect(markup).toContain("Tavily");
    expect(markup).not.toContain("resultCount");
    expect(markup).not.toContain("searchType");
  });

  it("renders fetched page metadata as a compact source card", () => {
    applyPersistedLanguage("zh-CN");
    const event = {
      id: "fetch-result",
      taskId: "task-1",
      type: "tool_result",
      timestamp: 2,
      payload: {
        tool: "web_fetch",
        result: {
          url: "https://www.kaytus.com/about/",
          title: "Company Profile | KAYTUS",
          contentLength: 5233,
          truncated: false,
        },
      },
    } as TaskEvent;

    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(event, false, {}),
      ),
    );

    expect(markup).toContain("web-fetch-result-card");
    expect(markup).toContain("Company Profile | KAYTUS");
    expect(markup).toContain("kaytus.com/about/");
    expect(markup).toContain("5,233 个字符");
    expect(markup).toContain("抓取完成");
    expect(markup).toContain("完整内容");
    expect(markup).toContain("查看请求详情");
    expect(markup).not.toContain("event-details-scrollable");
  });

  it("normalizes string content lengths from HTTP results", () => {
    expect(
      getWebFetchResultDisplay({
        url: "https://example.com/docs?q=crew",
        method: "get",
        status: "200",
        contentLength: "1200",
        truncated: true,
      }),
    ).toMatchObject({
      siteLabel: "example.com",
      pathLabel: "/docs?q=crew",
      method: "GET",
      status: 200,
      contentLength: 1200,
      truncated: true,
      failed: false,
    });
  });

  it("renders HTTP metadata as a readable request card", () => {
    applyPersistedLanguage("zh-CN");
    const event = {
      id: "http-result",
      taskId: "task-1",
      type: "tool_result",
      timestamp: 2,
      payload: {
        tool: "http_request",
        result: {
          url: "https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=0.000977",
          normalizedUrl: null,
          method: "GET",
          status: 200,
          contentLength: 17844,
          truncated: false,
        },
      },
    } as TaskEvent;

    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(event, false, {}),
      ),
    );

    expect(markup).toContain("web-fetch-result-card");
    expect(markup).toContain("web-fetch-method");
    expect(markup).toContain("GET");
    expect(markup).toContain("200 · 请求成功");
    expect(markup).toContain("响应 17.4 KB");
    expect(markup).toContain("完整内容");
    expect(markup).toContain("查看请求详情");
    expect(markup).not.toContain("normalizedUrl");
    expect(markup).not.toContain("contentLength");
  });

  it("marks unsuccessful HTTP statuses as request failures", () => {
    expect(
      getWebFetchResultDisplay({
        url: "https://example.com/missing",
        method: "GET",
        status: 404,
        statusText: "Not Found",
        contentLength: 143,
        truncated: false,
      }),
    ).toMatchObject({
      method: "GET",
      status: 404,
      statusText: "Not Found",
      failed: true,
      unavailable: false,
    });
  });

  it("renders a recoverable missing page as skipped instead of failed", () => {
    applyPersistedLanguage("zh-CN");
    const event = {
      id: "fetch-skipped",
      taskId: "task-1",
      type: "tool_result",
      timestamp: 3,
      payload: {
        tool: "web_fetch",
        result: {
          success: false,
          url: "https://run.ai/missing",
          error: "HTTP 404: Not Found",
          nonBlocking: true,
          recoverableFallback: true,
          failureKind: "source_unavailable",
        },
      },
    } as TaskEvent;

    const markup = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        renderEventDetails(event, false, {}),
      ),
    );

    expect(markup).toContain("来源不可用，已跳过");
    expect(markup).toContain("is-skipped");
    expect(markup).not.toContain("抓取完成");
  });
});
