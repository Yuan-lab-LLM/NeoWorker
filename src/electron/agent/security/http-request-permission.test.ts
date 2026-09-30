import { describe, expect, it } from "vitest";
import { isReadOnlyHttpRequestInput } from "./http-request-permission";

const quoteRequest = { url: "https://hq.sinajs.cn/list=sz000977", method: "GET" };

describe("HTTP request permission classification", () => {
  it.each([undefined, "GET", "HEAD", " get "])("allows bodyless %s reads with an origin-only Referer", (method) => {
    for (const referer of ["https://finance.sina.com.cn", "https://finance.sina.com.cn/"]) {
      expect(isReadOnlyHttpRequestInput({
        ...quoteRequest, method,
        headers: { Referer: referer, Accept: "text/plain", "User-Agent": "Mozilla/5.0" },
      })).toBe(true);
    }
  });

  it("accepts case-insensitive header names and a plain Origin", () => {
    expect(isReadOnlyHttpRequestInput({
      ...quoteRequest, headers: { rEfErEr: "https://finance.sina.com.cn/", Origin: "https://finance.sina.com.cn" },
    })).toBe(true);
  });

  it.each([
    { method: "POST" },
    { body: "private data" },
    { headers: { Authorization: "Bearer secret" } },
    { headers: { Cookie: "session=secret" } },
    { headers: { "X-API-Key": "secret" } },
    { headers: { Referer: "https://finance.sina.com.cn/private/report" } },
    { headers: { Referer: "https://finance.sina.com.cn/?token=secret" } },
    { headers: { Origin: "https://finance.sina.com.cn/#secret" } },
    { headers: { Referer: "https://user:secret@finance.sina.com.cn" } },
    { headers: { Referer: "file:///private/report.txt" } },
    { headers: { Referer: "not a URL" } },
    { headers: { Accept: "text/plain\r\nAuthorization: secret" } },
    { headers: ["Referer: https://finance.sina.com.cn"] },
    { url: "https://user:secret@hq.sinajs.cn/list=sz000977" },
  ])("keeps mutating or data-bearing input export-scoped: %j", (input) => {
    expect(isReadOnlyHttpRequestInput({ ...quoteRequest, ...input })).toBe(false);
  });
});
