import {
  DWClient,
  TOPIC_ROBOT,
  type DWClientDownStream,
  type RobotMessage,
} from "dingtalk-stream";
import {
  type ChannelAdapter,
  type ChannelInfo,
  type ChannelStatus,
  type DingTalkConfig,
  type ErrorHandler,
  type IncomingMessage,
  type MessageHandler,
  type OutgoingMessage,
  type StatusHandler,
} from "./types";
import { createLogger } from "../../utils/logger";

const logger = createLogger("DingTalkAdapter");
const CONNECTION_TIMEOUT_MS = 15_000;
const SESSION_WEBHOOK_FALLBACK_TTL_MS = 55 * 60 * 1000;

interface DingTalkSessionWebhook {
  url: string;
  expiresAt: number;
}

interface DingTalkWebhookResponse {
  errcode?: number;
  errmsg?: string;
  messageId?: string;
  processQueryKey?: string;
}

function createError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function parseRobotMessage(data: string): RobotMessage | null {
  try {
    const parsed = JSON.parse(data) as RobotMessage;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export class DingTalkAdapter implements ChannelAdapter {
  readonly type = "dingtalk" as const;

  private client: DWClient | null = null;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private sessionWebhooks = new Map<string, DingTalkSessionWebhook>();
  private processedMessages = new Map<string, number>();
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private _status: ChannelStatus = "disconnected";
  private _botUsername?: string;
  private config: DingTalkConfig;

  constructor(config: DingTalkConfig) {
    this.config = {
      deduplicationEnabled: true,
      ...config,
    };
    this._botUsername = this.config.displayName || "DingTalk Bot";
  }

  get status(): ChannelStatus {
    return this._status;
  }

  get botUsername(): string | undefined {
    return this._botUsername;
  }

  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") return;

    this.setStatus("connecting");
    try {
      const client = new DWClient({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        keepAlive: true,
        debug: this.config.debug === true,
      });
      client.registerCallbackListener(
        TOPIC_ROBOT,
        (downstream: DWClientDownStream) => {
          client.socketCallBackResponse(downstream.headers.messageId, {});
          void this.handleRobotMessage(downstream).catch((error) => {
            this.handleError(createError(error), "robot-message");
          });
        },
      );

      // Validate credentials before opening the long-lived stream. This makes
      // the settings "Test connection" action return an immediate, useful
      // authentication error instead of waiting for a socket timeout.
      await client.getAccessToken();
      this.client = client;
      await client.connect();
      await this.waitForConnection(client);
      this.startConnectionMonitor();
      this.setStatus("connected");
      logger.info("DingTalk Stream connection established");
    } catch (error) {
      const err = createError(error);
      this.client?.disconnect();
      this.client = null;
      this.setStatus("error", err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    this.client?.disconnect();
    this.client = null;
    this.sessionWebhooks.clear();
    this.processedMessages.clear();
    this.setStatus("disconnected");
  }

  async sendMessage(message: OutgoingMessage): Promise<string> {
    const session = this.sessionWebhooks.get(message.chatId);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) this.sessionWebhooks.delete(message.chatId);
      throw new Error(
        "DingTalk session webhook is unavailable or expired. Send the bot a new message in DingTalk and try again.",
      );
    }

    const content = this.config.responsePrefix
      ? `${this.config.responsePrefix} ${message.text}`.trim()
      : message.text;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    timeout.unref?.();

    try {
      const response = await fetch(session.url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content },
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      let payload: DingTalkWebhookResponse = {};
      if (raw) {
        try {
          payload = JSON.parse(raw) as DingTalkWebhookResponse;
        } catch {
          if (!response.ok) {
            throw new Error(raw);
          }
        }
      }
      if (!response.ok || (payload.errcode !== undefined && payload.errcode !== 0)) {
        throw new Error(
          payload.errmsg || `DingTalk send failed (${response.status})`,
        );
      }
      return (
        payload.messageId ||
        payload.processQueryKey ||
        `dingtalk-${Date.now()}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  onStatusChange(handler: StatusHandler): void {
    this.statusHandlers.push(handler);
  }

  updateConfig(config: DingTalkConfig): void {
    this.config = { ...this.config, ...config };
    this._botUsername = this.config.displayName || "DingTalk Bot";
  }

  async getInfo(): Promise<ChannelInfo> {
    return {
      type: "dingtalk",
      status: this._status,
      botUsername: this._botUsername,
      botDisplayName: this._botUsername,
      extra: {
        clientId: this.config.clientId,
        streamConnected: this.client?.connected === true,
      },
    };
  }

  private async handleRobotMessage(
    downstream: DWClientDownStream,
  ): Promise<void> {
    const payload = parseRobotMessage(downstream.data);
    if (!payload || payload.msgtype !== "text") return;
    if (!payload.msgId || !payload.conversationId) return;
    if (
      this.config.deduplicationEnabled !== false &&
      this.isDuplicate(payload.msgId)
    ) {
      return;
    }

    const text = payload.text?.content?.trim();
    if (!text) return;

    if (payload.sessionWebhook) {
      this.sessionWebhooks.set(payload.conversationId, {
        url: payload.sessionWebhook,
        expiresAt:
          Number(payload.sessionWebhookExpiredTime) ||
          Date.now() + SESSION_WEBHOOK_FALLBACK_TTL_MS,
      });
    }

    const userId =
      payload.senderStaffId || payload.senderId || "unknown-dingtalk-user";
    const incoming: IncomingMessage = {
      messageId: payload.msgId,
      channel: "dingtalk",
      userId,
      userName: payload.senderNick || userId,
      chatId: payload.conversationId,
      isGroup: payload.conversationType !== "1",
      text,
      timestamp: new Date(Number(payload.createAt) || Date.now()),
      raw: payload,
      metadata: {
        conversationType: payload.conversationType,
        robotCode: payload.robotCode,
        senderCorpId: payload.senderCorpId,
        chatbotCorpId: payload.chatbotCorpId,
      },
    };

    for (const handler of this.messageHandlers) {
      await handler(incoming);
    }
  }

  private isDuplicate(messageId: string): boolean {
    const now = Date.now();
    const seenAt = this.processedMessages.get(messageId);
    if (seenAt && now - seenAt < 60_000) return true;
    this.processedMessages.set(messageId, now);

    if (this.processedMessages.size > 500) {
      const cutoff = now - 60_000;
      for (const [id, timestamp] of this.processedMessages) {
        if (timestamp < cutoff) this.processedMessages.delete(id);
      }
    }
    return false;
  }

  private async waitForConnection(client: DWClient): Promise<void> {
    const startedAt = Date.now();
    while (!client.connected) {
      if (Date.now() - startedAt >= CONNECTION_TIMEOUT_MS) {
        throw new Error("Timed out while connecting to DingTalk Stream");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private startConnectionMonitor(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(() => {
      const client = this.client;
      if (!client) return;
      if (client.connected && this._status !== "connected") {
        this.setStatus("connected");
      } else if (
        !client.connected &&
        this._status === "connected"
      ) {
        this.setStatus("connecting");
      }
    }, 2_000);
    this.monitorTimer.unref?.();
  }

  private setStatus(status: ChannelStatus, error?: Error): void {
    if (this._status === status && !error) return;
    this._status = status;
    for (const handler of this.statusHandlers) {
      handler(status, error);
    }
  }

  private handleError(error: Error, context?: string): void {
    for (const handler of this.errorHandlers) {
      handler(error, context);
    }
    logger.error(error.message, context);
  }
}

export function createDingTalkAdapter(
  config: DingTalkConfig,
): DingTalkAdapter {
  return new DingTalkAdapter(config);
}
