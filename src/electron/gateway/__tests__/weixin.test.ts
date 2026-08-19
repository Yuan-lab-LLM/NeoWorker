import { createCipheriv, createDecipheriv, createHash } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeixinAdapter } from "../channels/weixin";

function jsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("WeixinAdapter outgoing delivery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("coalesces duplicate concurrent replies into one WeChat API request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ret: 0, message_id: "wechat-message-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new WeixinAdapter({
      enabled: true,
      accountId: "bot-1",
      botToken: "token-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
    });
    (adapter as Any).contextTokens.set("user-1", "context-token");

    const [first, second] = await Promise.all([
      adapter.sendMessage({ chatId: "user-1", text: "同一条答复" }),
      adapter.sendMessage({ chatId: "user-1", text: "同一条答复" }),
    ]);

    expect(first).toBe("wechat-message-1");
    expect(second).toBe("wechat-message-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("encrypts, uploads, and sends outbound document files", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "neoworker-weixin-file-"));
    const filePath = path.join(tempDir, "讲义.pdf");
    const plaintext = Buffer.from("pdf-file-content", "utf8");
    await writeFile(filePath, plaintext);

    try {
      const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/ilink/bot/getuploadurl")) {
          return jsonResponse({ ret: 0, upload_param: "upload-param/value" });
        }
        if (url.startsWith("https://novac2c.cdn.weixin.qq.com/c2c/upload?")) {
          return new Response(null, {
            status: 200,
            headers: { "x-encrypted-param": "download-param" },
          });
        }
        if (url.endsWith("/ilink/bot/sendmessage")) {
          return jsonResponse({ ret: 0, message_id: "file-message-1" });
        }
        throw new Error(`Unexpected request: ${url} ${init?.method || "GET"}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      const adapter = new WeixinAdapter({
        enabled: true,
        accountId: "bot-1",
        botToken: "token-1",
        baseUrl: "https://ilinkai.weixin.qq.com",
      });
      (adapter as Any).contextTokens.set("user-1", "context-token");

      await expect(
        adapter.sendDocument("user-1", filePath, "📎 讲义.pdf"),
      ).resolves.toBe("file-message-1");
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const uploadUrlRequest = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/ilink/bot/getuploadurl"),
      );
      const uploadUrlBody = JSON.parse(
        String(uploadUrlRequest?.[1]?.body),
      ) as Record<string, Any>;
      expect(uploadUrlBody).toMatchObject({
        media_type: 3,
        to_user_id: "user-1",
        rawsize: plaintext.length,
        rawfilemd5: createHash("md5").update(plaintext).digest("hex"),
        no_need_thumb: true,
      });
      expect(uploadUrlBody.aeskey).toMatch(/^[0-9a-f]{32}$/);

      const cdnRequest = fetchMock.mock.calls.find(([input]) =>
        String(input).startsWith("https://novac2c.cdn.weixin.qq.com/c2c/upload?"),
      );
      expect(String(cdnRequest?.[0])).toContain(
        "encrypted_query_param=upload-param%2Fvalue",
      );
      expect(String(cdnRequest?.[0])).toContain(
        `filekey=${uploadUrlBody.filekey}`,
      );
      const ciphertext = Buffer.from(cdnRequest?.[1]?.body as Uint8Array);
      expect(ciphertext.length).toBe(uploadUrlBody.filesize);
      const decipher = createDecipheriv(
        "aes-128-ecb",
        Buffer.from(uploadUrlBody.aeskey, "hex"),
        null,
      );
      expect(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]),
      ).toEqual(plaintext);

      const sendBodies = fetchMock.mock.calls
        .filter(([input]) => String(input).endsWith("/ilink/bot/sendmessage"))
        .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, Any>);
      expect(sendBodies).toHaveLength(2);
      expect(sendBodies[0].msg.item_list[0]).toEqual({
        type: 1,
        text_item: { text: "📎 讲义.pdf" },
      });
      const sendBody = sendBodies[1];
      const fileItem = sendBody.msg.item_list[0];
      expect(fileItem).toMatchObject({
        type: 4,
        file_item: {
          file_name: "讲义.pdf",
          len: String(plaintext.length),
          media: {
            encrypt_query_param: "download-param",
            encrypt_type: 1,
          },
        },
      });
      expect(
        Buffer.from(fileItem.file_item.media.aes_key, "base64").toString(
          "utf8",
        ),
      ).toBe(uploadUrlBody.aeskey);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("uploads images as native WeChat image items", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "neoworker-weixin-image-"));
    const filePath = path.join(tempDir, "preview.png");
    await writeFile(filePath, Buffer.from("image-content", "utf8"));

    try {
      const requestBodies: Record<string, Any>[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (init?.body && typeof init.body === "string") {
            requestBodies.push(JSON.parse(init.body));
          }
          if (url.endsWith("/ilink/bot/getuploadurl")) {
            return jsonResponse({ ret: 0, upload_param: "image-upload" });
          }
          if (url.includes("/c2c/upload?")) {
            return new Response(null, {
              status: 200,
              headers: { "x-encrypted-param": "image-download" },
            });
          }
          return jsonResponse({ ret: 0, message_id: "image-message-1" });
        }),
      );

      const adapter = new WeixinAdapter({
        enabled: true,
        accountId: "bot-1",
        botToken: "token-1",
        baseUrl: "https://ilinkai.weixin.qq.com",
      });
      (adapter as Any).contextTokens.set("user-1", "context-token");

      await expect(adapter.sendPhoto("user-1", filePath)).resolves.toBe(
        "image-message-1",
      );
      expect(requestBodies[0]).toMatchObject({ media_type: 1 });
      expect(requestBodies[1].msg.item_list[0]).toMatchObject({
        type: 2,
        image_item: {
          media: {
            encrypt_query_param: "image-download",
            encrypt_type: 1,
          },
        },
      });
      expect(requestBodies[1].msg.item_list[0].image_item.mid_size).toBe(16);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects untrusted media upload URLs returned by the service", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "neoworker-weixin-url-"));
    const filePath = path.join(tempDir, "report.html");
    await writeFile(filePath, "<html></html>");

    try {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          ret: 0,
          upload_full_url: "https://attacker.example/upload",
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const adapter = new WeixinAdapter({
        enabled: true,
        accountId: "bot-1",
        botToken: "token-1",
        baseUrl: "https://ilinkai.weixin.qq.com",
      });
      (adapter as Any).contextTokens.set("user-1", "context-token");

      await expect(adapter.sendDocument("user-1", filePath)).rejects.toThrow(
        "Invalid WeChat media upload URL",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("downloads and decrypts inbound image attachments", async () => {
    const image = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const key = Buffer.from("0123456789abcdef", "utf8");
    const cipher = createCipheriv("aes-128-ecb", key, null);
    const encrypted = Buffer.concat([cipher.update(image), cipher.final()]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(encrypted, {
        status: 200,
        headers: { "content-length": String(encrypted.length) },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new WeixinAdapter({
      enabled: true,
      accountId: "bot-1",
      botToken: "token-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
    });
    const handler = vi.fn();
    adapter.onMessage(handler);

    await (adapter as Any).handleIncomingMessage({
      message_id: "image-message-1",
      from_user_id: "user-1",
      context_token: "context-token",
      item_list: [
        {
          type: 2,
          image_item: {
            media: {
              encrypt_query_param: "download-image-1",
              aes_key: key.toString("base64"),
            },
          },
        },
      ],
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const incoming = handler.mock.calls[0][0];
    expect(incoming.text).toBe("请查看附件。");
    expect(incoming.attachments).toHaveLength(1);
    expect(incoming.attachments[0]).toMatchObject({
      type: "image",
      mimeType: "image/png",
      fileName: "weixin-image-image-message-1-1.png",
      size: image.length,
    });
    expect(incoming.attachments[0].data).toEqual(image);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("novac2c.cdn.weixin.qq.com/c2c/download"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("downloads inbound files and preserves the original filename", async () => {
    const file = Buffer.from("word-document-placeholder", "utf8");
    const rawKey = Buffer.from("fedcba9876543210", "utf8");
    const encodedHexKey = Buffer.from(rawKey.toString("hex"), "ascii").toString(
      "base64",
    );
    const cipher = createCipheriv("aes-128-ecb", rawKey, null);
    const encrypted = Buffer.concat([cipher.update(file), cipher.final()]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(encrypted, { status: 200 })),
    );

    const adapter = new WeixinAdapter({
      enabled: true,
      accountId: "bot-1",
      botToken: "token-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
    });
    const handler = vi.fn();
    adapter.onMessage(handler);

    await (adapter as Any).handleIncomingMessage({
      message_id: "file-message-1",
      from_user_id: "user-1",
      context_token: "context-token",
      item_list: [
        {
          type: 4,
          file_item: {
            file_name: "AI&HPC 产品线例会纪要.docx",
            len: String(file.length),
            media: {
              encrypt_query_param: "download-file-1",
              aes_key: encodedHexKey,
            },
          },
        },
      ],
    });

    const attachment = handler.mock.calls[0][0].attachments[0];
    expect(attachment.type).toBe("document");
    expect(attachment.fileName).toBe("AI&HPC 产品线例会纪要.docx");
    expect(attachment.data).toEqual(file);
  });

  it("accepts media payloads when WeChat omits or stringifies the item type", async () => {
    const image = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(image, { status: 200 })),
    );

    const adapter = new WeixinAdapter({
      enabled: true,
      accountId: "bot-1",
      botToken: "token-1",
      baseUrl: "https://ilinkai.weixin.qq.com",
    });
    const handler = vi.fn();
    adapter.onMessage(handler);

    await (adapter as Any).handleIncomingMessage({
      message_id: "image-message-without-type",
      from_user_id: "user-1",
      context_token: "context-token",
      item_list: [
        {
          type: "2",
          image_item: {
            media: { encrypt_query_param: "download-image-without-type" },
          },
        },
      ],
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      text: "请查看附件。",
      attachments: [
        expect.objectContaining({
          type: "image",
          mimeType: "image/png",
        }),
      ],
    });
  });
});
