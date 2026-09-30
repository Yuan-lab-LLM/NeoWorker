type Fetch = typeof globalThis.fetch;

export interface NetworkTransport {
  fetch: Fetch;
  directFetch: () => Promise<Fetch>;
}

let directFetchPromise: Promise<Fetch> | undefined;

export function sessionFetch(electron: typeof import("electron"), session: Electron.Session): Fetch {
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    if (init.redirect !== "manual" || input instanceof Request) return session.fetch(input instanceof URL ? input.href : input, init);
    // Electron net.fetch cancels manual redirects instead of returning their
    // 3xx response (electron/electron#43715). Surface the redirect event so the
    // caller can enforce its domain policy BEFORE making the next request.
    const url = String(input);
    const prepared = new Request(url, init);
    const body = init.body == null ? null : Buffer.from(await prepared.arrayBuffer());
    init.signal?.throwIfAborted();
    const requestHeaders: Record<string, string> = {};
    prepared.headers.forEach((value, key) => { requestHeaders[key] = value; });
    return new Promise<Response>((resolve, reject) => {
      const request = electron.net.request({
        url, session, method: prepared.method, redirect: "manual",
        headers: requestHeaders,
        ...(init.credentials ? { credentials: init.credentials, origin: new URL(url).origin } : {}),
        ...(init.cache ? { cache: init.cache } : {}),
      });
      let finished = false;
      let responseStarted = false;
      let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
      const cleanup = () => init.signal?.removeEventListener("abort", abort);
      const fail = (error: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (responseStarted) stream?.error(error);
        else reject(error);
      };
      const finish = (response: Response) => {
        if (finished) return;
        finished = true; cleanup(); resolve(response);
      };
      const abort = () => {
        fail(init.signal?.reason || new DOMException("Request aborted", "AbortError"));
        request.abort();
      };
      const headersFrom = (values: Record<string, string | string[]>) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(values)) {
          for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
        }
        return headers;
      };
      request.on("error", fail);
      request.on("redirect", (status, _method, destination, values) => {
        const headers = headersFrom(values);
        if (!headers.has("location")) headers.set("location", destination);
        finish(new Response(null, { status, headers }));
        request.abort(); // Never follow an unchecked destination.
      });
      request.on("response", (incoming) => {
        if (finished) return;
        const status = incoming.statusCode;
        const noBody = prepared.method === "HEAD" || [204, 205, 304].includes(status);
        // Return headers immediately so callers can enforce their size limits
        // and cancel a slow/oversized body before it fills the main process.
        const body = noBody ? null : new ReadableStream<Uint8Array>({
          start(controller) { stream = controller; },
          cancel() {
            finished = true;
            cleanup();
            request.abort();
          },
        }, { highWaterMark: 16 * 1024 * 1024, size: (chunk) => chunk.byteLength });
        incoming.on("error", fail);
        incoming.on("aborted", () => fail(new Error("Response aborted")));
        // Electron requires end to be registered before data.
        incoming.on("end", () => {
          if (finished) return;
          finished = true;
          cleanup();
          stream?.close();
        });
        incoming.on("data", (chunk) => {
          if (finished || !stream) return;
          // IncomingMessage has no pause/resume API. Bound unread data even if
          // the caller stops consuming without cancelling the response.
          if (chunk.byteLength > (stream.desiredSize ?? 0)) {
            fail(new Error("Response buffer limit exceeded"));
            request.abort();
            return;
          }
          stream.enqueue(new Uint8Array(chunk));
        });
        try {
          const response = new Response(body, {
            status, statusText: incoming.statusMessage, headers: headersFrom(incoming.headers),
          });
          responseStarted = true;
          resolve(response);
          if (noBody) {
            finished = true;
            cleanup();
            request.abort();
          }
        } catch (error) { fail(error); request.abort(); }
      });
      init.signal?.addEventListener("abort", abort, { once: true });
      if (init.signal?.aborted) { abort(); return; }
      request.end(body || undefined);
    });
  }) as Fetch;
}

function electronTransport(): NetworkTransport | null {
  try {
    const electron = require("electron") as typeof import("electron");
    if (typeof electron.net?.fetch !== "function") return null;
    return {
      fetch: sessionFetch(electron, electron.session.defaultSession),
      directFetch: () => {
        // Never change the default session or the user's OS proxy settings.
        // A non-persistent session avoids sharing browser cookies or proxy auth.
        directFetchPromise ??= (async () => {
          const session = electron.session.fromPartition("neoworker-public-web-direct", { cache: false });
          await session.setProxy({ mode: "direct" });
          return sessionFetch(electron, session);
        })().catch((error) => {
          directFetchPromise = undefined;
          throw error;
        });
        return directFetchPromise;
      },
    };
  } catch {
    return null;
  }
}

export function isProxyConnectionFailure(error: unknown): boolean {
  const value = error as { message?: string; code?: string; cause?: { message?: string; code?: string } };
  // Authentication, certificates, HTTP denials, PAC policy and general
  // timeouts must not silently trigger a different route.
  return /\bERR_PROXY_CONNECTION_FAILED\b/.test(
    [value?.code, value?.message, value?.cause?.code, value?.cause?.message].join(" "),
  );
}

export function createNetworkFetch(getTransport: () => NetworkTransport | null = electronTransport) {
  return async (
    url: string,
    init: RequestInit = {},
    options: { replaySafeSearch?: boolean; nodeFallback?: boolean } = {},
  ): Promise<Response> => {
    const transport = getTransport();
    if (!transport) return globalThis.fetch(url, init);
    try {
      return await transport.fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted) throw error;
      const method = String(init.method || "GET").toUpperCase();
      const replaySafe = method === "GET" || method === "HEAD" ||
        (method === "POST" && options.replaySafeSearch && typeof init.body === "string");
      if (!replaySafe) throw error;
      if (isProxyConnectionFailure(error)) {
        try {
          const directFetch = await transport.directFetch();
          init.signal?.throwIfAborted();
          const headers = new Headers(init.headers);
          headers.delete("proxy-authorization");
          headers.delete("proxy-connection");
          return await directFetch(url, { ...init, headers, credentials: "omit" });
        } catch (directError) {
          if (init.signal?.aborted) throw directError;
          throw new Error(
            `系统代理连接失败（ERR_PROXY_CONNECTION_FAILED），直连重试也失败。请检查系统代理设置及代理软件是否运行。直连错误：${(directError as Error)?.message || "连接失败"}`,
            { cause: directError },
          );
        }
      }
      // Preserve the existing DDG Node fallback for non-proxy transport errors.
      // Do not retry certificate, authentication or server-policy failures.
      if (options.nodeFallback && !/ERR_CERT_|ERR_SSL_|ERR_PROXY_AUTH|ERR_TUNNEL_|ERR_MANDATORY_PROXY|ERR_PAC_/i.test(String((error as Error)?.message))) {
        return globalThis.fetch(url, init);
      }
      throw error;
    }
  };
}

export const fetchWithSystemProxy = createNetworkFetch();
