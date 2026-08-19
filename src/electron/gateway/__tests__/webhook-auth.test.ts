import { describe, expect, it } from "vitest";
import { BlueBubblesClient } from "../channels/bluebubbles-client";
import { FeishuAdapter } from "../channels/feishu";
import { GoogleChatAdapter } from "../channels/google-chat";

describe("gateway webhook authentication", () => {
  it("rejects Feishu payloads missing a configured verification token", () => {
    const adapter = new FeishuAdapter({
      enabled: true,
      appId: "app-id",
      appSecret: "app-secret",
      verificationToken: "expected-token",
    });

    expect(() =>
      (adapter as Any).parseAndVerifyPayload(
        { headers: {} },
        JSON.stringify({ type: "event_callback", event: {} }),
      ),
    ).toThrow("Feishu verification token is required");
  });

  it("rejects Feishu payloads missing configured signature headers", () => {
    const adapter = new FeishuAdapter({
      enabled: true,
      appId: "app-id",
      appSecret: "app-secret",
      encryptKey: "encrypt-key",
    });

    expect(() =>
      (adapter as Any).parseAndVerifyPayload(
        { headers: {} },
        JSON.stringify({ type: "event_callback", event: {} }),
      ),
    ).toThrow("Feishu signature headers are required");
  });

  it("requires a BlueBubbles webhook secret", () => {
    const client = new BlueBubblesClient({
      serverUrl: "http://127.0.0.1:1234",
      password: "server-password",
      webhookSecret: "webhook-secret",
    });

    expect((client as Any).verifyWebhookRequest({ headers: {} })).toBe(false);
    expect(
      (client as Any).verifyWebhookRequest({
        headers: { "x-neoworker-webhook-secret": "webhook-secret" },
      }),
    ).toBe(true);
  });

  it("requires a Google Chat webhook secret", () => {
    const adapter = new GoogleChatAdapter({
      enabled: true,
      serviceAccountKey: {
        client_email: "bot@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
        project_id: "project",
      },
      webhookSecret: "webhook-secret",
    });

    expect((adapter as Any).verifyWebhookRequest({ headers: {} }, { type: "MESSAGE" })).toBe(false);
    expect(
      (adapter as Any).verifyWebhookRequest(
        { headers: { authorization: "Bearer webhook-secret" } },
        { type: "MESSAGE" },
      ),
    ).toBe(true);
  });
});
