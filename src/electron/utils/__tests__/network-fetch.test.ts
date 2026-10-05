import { afterEach, describe, expect, it, vi } from "vitest";
import { createNetworkFetch, isProxyConnectionFailure, sessionFetch } from "../network-fetch";
import { EventEmitter } from "node:events";
import { readPaperNewsResponse } from "../../paper-news/service";

const proxyError = () => new Error("net::ERR_PROXY_CONNECTION_FAILED");
const setup = () => {
  const primary = vi.fn().mockRejectedValue(proxyError());
  const direct = vi.fn().mockResolvedValue(new Response("recovered"));
  const directFetch = vi.fn().mockResolvedValue(direct);
  return { primary, direct, directFetch, fetch: createNetworkFetch(() => ({ fetch: primary, directFetch })) };
};

describe("system proxy failure recovery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the system transport when it succeeds", async () => {
    const s = setup();
    s.primary.mockResolvedValue(new Response("proxy works"));
    expect(await (await s.fetch("https://example.com")).text()).toBe("proxy works");
    expect(s.directFetch).not.toHaveBeenCalled();
  });

  it.each(["GET", "HEAD"])("retries %s once with the original URL, headers, abort and redirect policy", async (method) => {
    const s = setup();
    const signal = new AbortController().signal;
    const result = await s.fetch("https://example.com", { method, redirect: "manual", signal, headers: { Accept: "text/html", "Proxy-Authorization": "secret" } });
    expect(await result.text()).toBe("recovered");
    expect(s.primary).toHaveBeenCalledTimes(1);
    expect(s.direct).toHaveBeenCalledTimes(1);
    const [url, init] = s.direct.mock.calls[0];
    expect(url).toBe("https://example.com");
    expect(init).toMatchObject({ method, redirect: "manual", signal, credentials: "omit" });
    expect(init.headers.get("accept")).toBe("text/html");
    expect(init.headers.has("proxy-authorization")).toBe(false);
  });

  it("allows only explicitly replay-safe search POSTs", async () => {
    const s = setup();
    await s.fetch("https://example.com/search", { method: "POST", body: "q=test" }, { replaySafeSearch: true });
    expect(s.direct.mock.calls[0][1].body).toBe("q=test");
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("does not replay a %s action", async (method) => {
    const s = setup();
    await expect(s.fetch("https://example.com", { method, body: "data" })).rejects.toThrow("ERR_PROXY_CONNECTION_FAILED");
    expect(s.directFetch).not.toHaveBeenCalled();
  });

  it.each(["ERR_CERT_AUTHORITY_INVALID", "ERR_TUNNEL_CONNECTION_FAILED", "ERR_PROXY_AUTH_REQUESTED", "ERR_MANDATORY_PROXY_CONFIGURATION_FAILED", "ERR_PAC_SCRIPT_FAILED", "ERR_CONNECTION_TIMED_OUT"])("does not switch to direct for %s", async (code) => {
    const s = setup();
    s.primary.mockRejectedValue(new Error(code));
    await expect(s.fetch("https://example.com")).rejects.toThrow(code);
    expect(s.directFetch).not.toHaveBeenCalled();
  });

  it("does not retry HTTP proxy authentication or access denials", async () => {
    const s = setup();
    s.primary.mockResolvedValue(new Response("auth required", { status: 407 }));
    expect((await s.fetch("https://example.com")).status).toBe(407);
    expect(s.directFetch).not.toHaveBeenCalled();
  });

  it("honors cancellation before fallback", async () => {
    const s = setup();
    const controller = new AbortController();
    s.primary.mockImplementation(async () => { controller.abort(); throw proxyError(); });
    await expect(s.fetch("https://example.com", { signal: controller.signal })).rejects.toThrow();
    expect(s.directFetch).not.toHaveBeenCalled();
  });

  it("honors cancellation while the direct session initializes", async () => {
    const s = setup();
    const controller = new AbortController();
    s.directFetch.mockImplementation(async () => { controller.abort(); return s.direct; });
    await expect(s.fetch("https://example.com", { signal: controller.signal })).rejects.toThrow();
    expect(s.direct).not.toHaveBeenCalled();
  });

  it("reports both failed routes without looping", async () => {
    const s = setup();
    s.direct.mockRejectedValue(new Error("net::ERR_NAME_NOT_RESOLVED"));
    await expect(s.fetch("https://example.com")).rejects.toThrow("直连重试也失败");
    expect(s.primary).toHaveBeenCalledTimes(1);
    expect(s.direct).toHaveBeenCalledTimes(1);
  });

  it("works outside Electron", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("node"));
    expect(await (await createNetworkFetch(() => null)("https://example.com")).text()).toBe("node");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("recognizes the nested Chromium error", () => {
    expect(isProxyConnectionFailure(new Error("fetch failed", { cause: { code: "ERR_PROXY_CONNECTION_FAILED" } }))).toBe(true);
  });
});

describe("Electron manual-redirect response streaming", () => {
  function setupStream() {
    const request = Object.assign(new EventEmitter(), { abort: vi.fn(), end: vi.fn() });
    const incoming = Object.assign(new EventEmitter(), {
      statusCode: 200, statusMessage: "OK", headers: { "content-type": "text/plain" },
    });
    const electron = { net: { request: () => request } } as unknown as typeof import("electron");
    return { request, incoming, fetch: sessionFetch(electron, {} as Electron.Session) };
  }
  it("returns headers before the body finishes, and cancels oversized news immediately", async () => {
    const { request, incoming, fetch } = setupStream();
    const pending = fetch("https://example.com", { redirect: "manual" });
    incoming.headers = { "content-type": "text/plain" };
    request.emit("response", incoming);
    const response = await pending;
    const reading = readPaperNewsResponse(response, 4);
    const rejected = expect(reading).rejects.toThrow("invalidResponse");
    incoming.emit("data", Buffer.from("too large"));
    await rejected;
    expect(request.abort).toHaveBeenCalledOnce();
    // Late data after cancellation must not accumulate or throw.
    incoming.emit("data", Buffer.from("ignored"));
    incoming.emit("end");
  });
  it("keeps the abort signal attached while reading a stalled body", async () => {
    const { request, incoming, fetch } = setupStream();
    const controller = new AbortController();
    const pending = fetch("https://example.com", { redirect: "manual", signal: controller.signal });
    request.emit("response", incoming);
    const reading = (await pending).text();
    const rejected = expect(reading).rejects.toThrow("deadline");
    controller.abort(new Error("deadline"));
    await rejected;
    expect(request.abort).toHaveBeenCalledOnce();
  });
  it("bounds an unread body instead of buffering an unlimited response", async () => {
    const { request, incoming, fetch } = setupStream();
    const pending = fetch("https://example.com", { redirect: "manual" });
    request.emit("response", incoming);
    const response = await pending;
    const chunk = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < 17; i++) incoming.emit("data", chunk);
    await expect(response.text()).rejects.toThrow("buffer limit");
    expect(request.abort).toHaveBeenCalledOnce();
  });
  it("streams complete text and removes abort handling at EOF", async () => {
    const { request, incoming, fetch } = setupStream();
    const controller = new AbortController();
    const pending = fetch("https://example.com", { redirect: "manual", signal: controller.signal });
    request.emit("response", incoming);
    const reading = (await pending).text();
    incoming.emit("data", Buffer.from("hello "));
    incoming.emit("data", Buffer.from("world"));
    incoming.emit("end");
    expect(await reading).toBe("hello world");
    controller.abort();
    expect(request.abort).not.toHaveBeenCalled();
  });
  it("returns an unchecked redirect without following its destination", async () => {
    const { request, fetch } = setupStream();
    const pending = fetch("https://example.com", { redirect: "manual" });
    request.emit("redirect", 302, "GET", "https://other.example", {});
    const response = await pending;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://other.example");
    expect(response.body).toBeNull();
    expect(request.abort).toHaveBeenCalledOnce();
  });
});
