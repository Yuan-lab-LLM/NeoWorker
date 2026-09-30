import { promises as dns } from "dns";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../../agent/llm/openai-compatible-provider";
import { validateOpenAICompatibleBaseUrl } from "../provider-base-url";

const localModels = { allowLoopback: true, allowPrivateNetwork: true };
let server: Server | undefined;

beforeEach(() => {
  vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "172.16.0.127", family: 4 }] as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) => {
      current.close(error => error ? reject(error) : resolve());
      current.closeAllConnections();
    });
  }
});

describe("explicitly configured local model endpoints", () => {
  it.each([
    "http://172.16.0.127:32788/v1",
    "http://10.20.0.8:8080/v1",
    "https://192.168.1.15:8443/v1",
    "http://100.64.0.8:8000/v1",
    "http://[fd12:3456::1]:8000/v1",
    "http://[::ffff:172.16.0.127]:32788/v1",
    "http://127.0.0.1:11434/v1",
    "http://[::1]:11434/v1",
    "https://models.example.com/v1",
    "http://epai.internal:32788/v1",
    "http://epai.local:32788/v1",
    "http://epai:32788/v1",
  ])("accepts configured model URL %s", async baseUrl => {
    await expect(validateOpenAICompatibleBaseUrl(baseUrl, localModels)).resolves.toBe(baseUrl);
  });

  it("does not require DNS resolution for a literal LAN IP", async () => {
    await validateOpenAICompatibleBaseUrl("http://172.16.0.127:32788/v1", localModels);
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("accepts mixed private IPv4 and IPv6 answers for an internal model hostname", async () => {
    vi.mocked(dns.lookup).mockResolvedValue([
      { address: "10.1.2.3", family: 4 },
      { address: "fd12:3456::1", family: 6 },
    ] as never);
    await expect(validateOpenAICompatibleBaseUrl("https://epai.internal/v1", localModels))
      .resolves.toBe("https://epai.internal/v1");
  });

  it("reaches the EPAI models and connection-test endpoints after validation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: "epai-model", name: "EPAI Model" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "Hi" } }] })));
    vi.stubGlobal("fetch", fetchMock);
    const baseUrl = await validateOpenAICompatibleBaseUrl("http://172.16.0.127:32788/v1", localModels);
    const provider = new OpenAICompatibleProvider({
      type: "openai-compatible", providerName: "EPAI", baseUrl,
      apiKey: "qa-test-key", defaultModel: "epai-model",
    });
    await expect(provider.getAvailableModels()).resolves.toEqual([{ id: "epai-model", name: "EPAI Model" }]);
    await expect(provider.testConnection()).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${baseUrl}/models`, expect.objectContaining({
      headers: { Authorization: "Bearer qa-test-key" },
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${baseUrl}/chat/completions`, expect.objectContaining({
      method: "POST", body: expect.stringContaining('"model":"epai-model"'),
    }));
  });

  it("round-trips a real local model-list HTTP request", async () => {
    const requests: Array<{ url?: string; authorization?: string }> = [];
    server = createServer((request, response) => {
      requests.push({ url: request.url, authorization: request.headers.authorization });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "local-model" }] }));
    });
    await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
    const baseUrl = await validateOpenAICompatibleBaseUrl(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, localModels,
    );
    const provider = new OpenAICompatibleProvider({
      type: "openai-compatible", providerName: "Local QA", baseUrl,
      apiKey: "qa-test-key", defaultModel: "local-model",
    });
    await expect(provider.getAvailableModels()).resolves.toEqual([{ id: "local-model", name: "local-model" }]);
    expect(requests).toEqual([{ url: "/v1/models", authorization: "Bearer qa-test-key" }]);
  });
});

describe("model URL protection remains scoped", () => {
  it.each([
    "http://172.16.0.127:32788/v1",
    "http://192.168.1.15/v1",
    "http://epai.internal/v1",
    "http://epai.local/v1",
    "http://[fd12:3456::1]/v1",
  ])("still rejects private destinations without explicit local-model policy: %s", async baseUrl => {
    await expect(validateOpenAICompatibleBaseUrl(baseUrl, { allowLoopback: true })).rejects.toThrow(/blocked|private/);
  });

  it("does not treat permission for LAN models as permission for loopback", async () => {
    await expect(validateOpenAICompatibleBaseUrl("http://127.0.0.1/v1", { allowPrivateNetwork: true }))
      .rejects.toThrow(/private/);
  });

  it.each([
    "http://0.0.0.0/v1",
    "http://0.1.2.3/v1",
    "http://[::]/v1",
    "http://169.254.169.254/latest/meta-data",
    "http://169.254.10.20/v1",
    "http://metadata.google.internal/computeMetadata/v1",
    "http://METADATA.GOOGLE.INTERNAL./v1",
    "http://100.100.100.200/v1",
    "http://[fd00:ec2::254]/v1",
    "http://[fd00:0ec2:0000:0000:0000:0000:0000:0254]/v1",
    "http://[fe80::1]/v1",
    "http://[::ffff:169.254.169.254]/v1",
    "http://[::ffff:a9fe:a9fe]/v1",
    "http://[::ffff:0.0.0.0]/v1",
    "http://2852039166/v1",
    "http://224.0.0.1/v1",
    "http://[ff02::1]/v1",
  ])("still blocks unsafe configured destinations: %s", async baseUrl => {
    await expect(validateOpenAICompatibleBaseUrl(baseUrl, localModels)).rejects.toThrow(/blocked/);
  });

  it.each(["169.254.169.254", "::ffff:a9fe:a9fe", "fd00:ec2::254", "0.0.0.0"])(
    "rejects a hostname when any DNS answer is blocked (%s)", async address => {
      vi.mocked(dns.lookup).mockResolvedValue([
        { address: "172.16.0.127", family: 4 },
        { address, family: address.includes(":") ? 6 : 4 },
      ] as never);
      await expect(validateOpenAICompatibleBaseUrl("https://epai.internal/v1", localModels))
        .rejects.toThrow(/resolved to a blocked/);
    },
  );

  it.each(["ftp://172.16.0.127/v1", "file:///etc/passwd", "not a URL"])(
    "rejects invalid URLs and unsupported protocols: %s", async baseUrl => {
      await expect(validateOpenAICompatibleBaseUrl(baseUrl, localModels)).rejects.toThrow();
    },
  );

  it("leaves DNS-not-found errors to normal connection reporting", async () => {
    vi.mocked(dns.lookup).mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOTFOUND" }));
    await expect(validateOpenAICompatibleBaseUrl("https://epai.internal/v1", localModels))
      .resolves.toBe("https://epai.internal/v1");
  });
});
