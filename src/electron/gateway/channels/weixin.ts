import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { readFile, stat } from "fs/promises";
import path from "path";
import mime from "mime-types";
import { createLogger } from "../../utils/logger";
import { AppearanceManager } from "../../settings/appearance-manager";
import type {
  ChannelAdapter,
  ChannelInfo,
  ChannelStatus,
  ErrorHandler,
  IncomingMessage,
  MessageAttachment,
  MessageHandler,
  OutgoingMessage,
  StatusHandler,
  WeixinConfig,
} from "./types";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const ILINK_APP_ID = "bot";
// iLink encodes semantic versions as major << 16 | minor << 8 | patch.
const CLIENT_VERSION = String(1 << 16);
const CHANNEL_VERSION = "1.0.0";
const BOT_AGENT = `NeoWorker/${CHANNEL_VERSION}`;
const OUTGOING_DEDUP_WINDOW_MS = 5_000;
const MEDIA_DOWNLOAD_TIMEOUT_MS = 30_000;
const MEDIA_UPLOAD_TIMEOUT_MS = 30_000;
const MEDIA_UPLOAD_MAX_RETRIES = 3;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const logger = createLogger("WeixinAdapter");

export type WeixinLoginStatus = "wait" | "scaned" | "confirmed" | "expired";

export interface WeixinQrCodeResult {
  qrcode: string;
  qrContent: string;
}

export interface WeixinLoginResult {
  status: WeixinLoginStatus;
  accountId?: string;
  botToken?: string;
  baseUrl?: string;
  userId?: string;
}

interface WeixinTextItem {
  text?: string;
}

interface WeixinCdnMedia {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
  full_url?: string;
}

interface WeixinImageItem {
  media?: WeixinCdnMedia;
  /** Some iLink image messages put the raw AES key here as 32 hex characters. */
  aeskey?: string;
  mid_size?: number;
}

interface WeixinVoiceItem {
  media?: WeixinCdnMedia;
  text?: string;
}

interface WeixinFileItem {
  media?: WeixinCdnMedia;
  file_name?: string;
  len?: string;
}

interface WeixinVideoItem {
  media?: WeixinCdnMedia;
  video_size?: number;
}

interface WeixinMessageItem {
  type?: number | string;
  text_item?: WeixinTextItem;
  image_item?: WeixinImageItem;
  voice_item?: WeixinVoiceItem;
  file_item?: WeixinFileItem;
  video_item?: WeixinVideoItem;
}

interface WeixinIncomingPayload {
  message_id?: string | number;
  from_user_id?: string;
  to_user_id?: string;
  client_id?: string;
  create_time_ms?: number;
  message_type?: number;
  context_token?: string;
  item_list?: WeixinMessageItem[];
}

interface WeixinUpdatesResponse {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinIncomingPayload[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
}

interface WeixinOutgoingMediaUpload {
  fileKey: string;
  downloadEncryptedQueryParam: string;
  aesKeyHex: string;
  rawSize: number;
  encryptedSize: number;
}

class WeixinCdnClientError extends Error {}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function localizedWeixinMessage(english: string, chinese: string): string {
  return AppearanceManager.loadSettings().language === "zh-CN"
    ? chinese
    : english;
}

function normalizeBaseUrl(value?: string): string {
  const url = new URL(value || DEFAULT_BASE_URL);
  if (url.protocol !== "https:" || url.hostname !== "ilinkai.weixin.qq.com") {
    throw new Error("Invalid WeChat service URL");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

function parseApiError(
  payload: Record<string, unknown>,
  fallback: string,
): Error {
  const message =
    asString(payload.errmsg) ||
    asString(payload.message) ||
    asString(payload.error) ||
    fallback;
  return new Error(message);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload = asRecord(await response.json());
  if (!response.ok) {
    throw parseApiError(
      payload,
      `WeChat service request failed (${response.status})`,
    );
  }
  return payload;
}

export async function requestWeixinQrCode(): Promise<WeixinQrCodeResult> {
  const response = await fetch(
    `${DEFAULT_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`,
    {
      headers: {
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": CLIENT_VERSION,
      },
    },
  );
  const payload = await readJson(response);
  const qrcode = asString(payload.qrcode);
  const qrContent =
    asString(payload.qrcode_img_content) ||
    asString(payload.qrcode_url) ||
    qrcode;
  if (!qrcode || !qrContent) {
    throw new Error("WeChat service did not return a login QR code");
  }
  return { qrcode, qrContent };
}

export async function pollWeixinQrStatus(
  qrcode: string,
): Promise<WeixinLoginResult> {
  if (!qrcode.trim()) {
    throw new Error("QR code identifier is required");
  }
  const response = await fetch(
    `${DEFAULT_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode.trim())}`,
    {
      headers: {
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": CLIENT_VERSION,
      },
    },
  );
  const payload = await readJson(response);
  const rawStatus = asString(payload.status)?.toLowerCase();
  const status: WeixinLoginStatus =
    rawStatus === "confirmed" || rawStatus === "success"
      ? "confirmed"
      : rawStatus === "scaned" || rawStatus === "scanned"
        ? "scaned"
        : rawStatus === "expired"
          ? "expired"
          : "wait";
  return {
    status,
    accountId:
      asString(payload.ilink_bot_id) ||
      asString(payload.account_id) ||
      asString(payload.bot_id),
    botToken: asString(payload.bot_token),
    baseUrl: asString(payload.baseurl) || DEFAULT_BASE_URL,
    userId: asString(payload.ilink_user_id) || asString(payload.user_id),
  };
}

function createUinHeader(): string {
  const value = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(value), "utf8").toString("base64");
}

function createClientId(): string {
  return `neoworker-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

function createError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function parseAesKey(value: string): Buffer {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{32}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 16) return decoded;
  if (
    decoded.length === 32 &&
    /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))
  ) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error("Invalid WeChat media AES key");
}

function decryptMedia(ciphertext: Buffer, encodedKey: string): Buffer {
  const decipher = createDecipheriv(
    "aes-128-ecb",
    parseAesKey(encodedKey),
    null,
  );
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptMedia(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function getTrustedMediaUrl(rawUrl: string, purpose: "upload" | "download"): URL {
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "weixin.qq.com" ||
      url.hostname.endsWith(".weixin.qq.com")
    )
  ) {
    throw new Error(`Invalid WeChat media ${purpose} URL`);
  }
  return url;
}

function getMediaDownloadUrl(media: WeixinCdnMedia): string | undefined {
  const fullUrl = asString(media.full_url);
  const rawUrl = fullUrl
    ? fullUrl
    : asString(media.encrypt_query_param)
      ? `${DEFAULT_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(media.encrypt_query_param!)}`
      : undefined;
  if (!rawUrl) return undefined;

  return getTrustedMediaUrl(rawUrl, "download").toString();
}

function getMediaUploadUrl(
  uploadFullUrl: string | undefined,
  uploadParam: string | undefined,
  fileKey: string,
): string {
  const rawUrl = uploadFullUrl
    ? uploadFullUrl
    : uploadParam
      ? `${DEFAULT_CDN_BASE_URL}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(fileKey)}`
      : undefined;
  if (!rawUrl) {
    throw new Error("WeChat service did not return a media upload URL");
  }
  return getTrustedMediaUrl(rawUrl, "upload").toString();
}

async function uploadMediaCiphertext(
  uploadUrl: string,
  ciphertext: Buffer,
): Promise<string> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MEDIA_UPLOAD_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      MEDIA_UPLOAD_TIMEOUT_MS,
    );
    timeout.unref?.();
    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
        signal: controller.signal,
      });
      if (response.status >= 400 && response.status < 500) {
        const detail =
          response.headers.get("x-error-message") || (await response.text());
        throw new WeixinCdnClientError(
          `WeChat media upload was rejected (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      if (!response.ok) {
        throw new Error(`WeChat media upload failed (${response.status})`);
      }
      const downloadParam = response.headers.get("x-encrypted-param")?.trim();
      if (!downloadParam) {
        throw new Error(
          "WeChat media upload response is missing x-encrypted-param",
        );
      }
      return downloadParam;
    } catch (error) {
      const uploadError = createError(error);
      if (uploadError instanceof WeixinCdnClientError) throw uploadError;
      lastError = uploadError;
      if (attempt < MEDIA_UPLOAD_MAX_RETRIES) {
        logger.warn(
          `WeChat media upload attempt ${attempt} failed; retrying`,
          uploadError.message,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("WeChat media upload failed");
}

async function readResponseBuffer(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error(
      `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
    );
  }
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(
          `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function downloadMedia(
  media: WeixinCdnMedia,
  encodedKey?: string,
): Promise<Buffer> {
  const url = getMediaDownloadUrl(media);
  if (!url) throw new Error("WeChat media message is missing a download URL");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    MEDIA_DOWNLOAD_TIMEOUT_MS,
  );
  timeout.unref?.();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`WeChat media download failed (${response.status})`);
    }
    const encrypted = await readResponseBuffer(response, MAX_MEDIA_BYTES + 16);
    const data = encodedKey ? decryptMedia(encrypted, encodedKey) : encrypted;
    if (data.length > MAX_MEDIA_BYTES) {
      throw new Error(
        `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
      );
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function detectImage(buffer: Buffer): { mimeType: string; extension: string } {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return { mimeType: "image/gif", extension: ".gif" };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: ".webp" };
  }
  return { mimeType: "image/jpeg", extension: ".jpg" };
}

function attachmentTypeForFile(
  mimeType: string | undefined,
  fileName: string,
): MessageAttachment["type"] {
  const normalized = (mimeType || "").toLowerCase();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("audio/")) return "audio";
  if (normalized.startsWith("video/")) return "video";
  if (
    normalized === "application/pdf" ||
    /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf|pages|numbers|key)$/i.test(fileName)
  ) {
    return "document";
  }
  return "file";
}

export class WeixinAdapter implements ChannelAdapter {
  readonly type = "weixin" as const;

  private config: WeixinConfig;
  private _status: ChannelStatus = "disconnected";
  private _botUsername?: string;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private statusHandlers: StatusHandler[] = [];
  private abortController: AbortController | null = null;
  private pollingPromise: Promise<void> | null = null;
  private updatesBuffer = "";
  private contextTokens = new Map<string, string>();
  private processedMessages = new Map<string, number>();
  private outgoingMessages = new Map<
    string,
    { messageId: string; sentAt: number }
  >();
  private outgoingMessageRequests = new Map<string, Promise<string>>();

  constructor(config: WeixinConfig) {
    this.config = {
      deduplicationEnabled: true,
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
    };
    this._botUsername = this.config.accountId || "WeChat Assistant";
  }

  get status(): ChannelStatus {
    return this._status;
  }

  get botUsername(): string | undefined {
    return this._botUsername;
  }

  async connect(): Promise<void> {
    if (this._status === "connected" || this._status === "connecting") return;
    if (!this.config.accountId || !this.config.botToken) {
      throw new Error(
        "WeChat login information is incomplete. Scan the QR code again.",
      );
    }

    this.setStatus("connecting");
    this.abortController = new AbortController();
    this.setStatus("connected");
    this.pollingPromise = this.runPollingLoop(this.abortController.signal);
    logger.info("WeChat iLink polling started");
  }

  async disconnect(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    try {
      await this.pollingPromise;
    } catch {
      // Abort is the expected shutdown path.
    }
    this.pollingPromise = null;
    this.updatesBuffer = "";
    this.contextTokens.clear();
    this.processedMessages.clear();
    this.outgoingMessages.clear();
    this.outgoingMessageRequests.clear();
    this.setStatus("disconnected");
  }

  async sendMessage(message: OutgoingMessage): Promise<string> {
    const clientId = message.idempotencyKey || createClientId();
    const text = this.config.responsePrefix
      ? `${this.config.responsePrefix} ${message.text}`.trim()
      : message.text;
    const dedupKey = `${message.chatId}\u0000${text.replace(/\s+/g, " ").trim()}`;
    const now = Date.now();
    const recent = this.outgoingMessages.get(dedupKey);
    if (recent && now - recent.sentAt < OUTGOING_DEDUP_WINDOW_MS) {
      return recent.messageId;
    }
    const inFlight = this.outgoingMessageRequests.get(dedupKey);
    if (inFlight) {
      return inFlight;
    }

    const request = (async () => {
      const messageId = await this.sendItem(
        message.chatId,
        { type: 1, text_item: { text } },
        clientId,
      );
      this.outgoingMessages.set(dedupKey, { messageId, sentAt: Date.now() });
      return messageId;
    })();

    this.outgoingMessageRequests.set(dedupKey, request);
    try {
      return await request;
    } finally {
      this.outgoingMessageRequests.delete(dedupKey);
    }
  }

  async sendDocument(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<string> {
    this.requireContextToken(chatId);
    const uploaded = await this.uploadOutgoingMedia(chatId, filePath, 3);
    if (caption?.trim()) {
      await this.sendItem(chatId, {
        type: 1,
        text_item: { text: caption.trim() },
      });
    }
    return this.sendItem(chatId, {
      type: 4,
      file_item: {
        media: this.toOutgoingCdnMedia(uploaded),
        file_name: path.basename(filePath),
        len: String(uploaded.rawSize),
      },
    });
  }

  async sendPhoto(
    chatId: string,
    filePath: string,
    caption?: string,
  ): Promise<string> {
    this.requireContextToken(chatId);
    const uploaded = await this.uploadOutgoingMedia(chatId, filePath, 1);
    if (caption?.trim()) {
      await this.sendItem(chatId, {
        type: 1,
        text_item: { text: caption.trim() },
      });
    }
    return this.sendItem(chatId, {
      type: 2,
      image_item: {
        media: this.toOutgoingCdnMedia(uploaded),
        mid_size: uploaded.encryptedSize,
      },
    });
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

  updateConfig(config: WeixinConfig): void {
    this.config = {
      ...this.config,
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl || this.config.baseUrl),
    };
  }

  async getInfo(): Promise<ChannelInfo> {
    return {
      type: "weixin",
      status: this._status,
      botId: this.config.accountId,
      botUsername: this._botUsername,
      botDisplayName: "WeChat Assistant",
      extra: {
        accountId: this.config.accountId,
        userId: this.config.userId,
        baseUrl: this.config.baseUrl,
      },
    };
  }

  private async runPollingLoop(signal: AbortSignal): Promise<void> {
    let retryDelay = 1_000;
    while (!signal.aborted) {
      try {
        const response = (await this.post(
          "/ilink/bot/getupdates",
          {
            get_updates_buf: this.updatesBuffer,
            base_info: {
              channel_version: CHANNEL_VERSION,
              bot_agent: BOT_AGENT,
            },
          },
          signal,
        )) as WeixinUpdatesResponse & Record<string, unknown>;
        const ret = Number(response.ret ?? response.errcode ?? 0);
        if (ret === -14) {
          const error = new Error(
            "WeChat login has expired. Scan the QR code to reconnect.",
          );
          this.setStatus("error", error);
          this.handleError(error, "getupdates");
          return;
        }
        if (ret !== 0) {
          throw parseApiError(
            response,
            `Failed to sync WeChat messages (${ret})`,
          );
        }
        if (typeof response.get_updates_buf === "string") {
          this.updatesBuffer = response.get_updates_buf;
        }
        for (const message of response.msgs || []) {
          await this.handleIncomingMessage(message);
        }
        retryDelay = 1_000;
      } catch (error) {
        if (signal.aborted) return;
        const err = createError(error);
        this.handleError(err, "getupdates");
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        retryDelay = Math.min(retryDelay * 2, 15_000);
      }
    }
  }

  private async handleIncomingMessage(
    payload: WeixinIncomingPayload,
  ): Promise<void> {
    const userId = asString(payload.from_user_id);
    const messageId = String(
      payload.message_id || payload.client_id || createClientId(),
    );
    if (!userId || this.isDuplicate(messageId)) return;

    const items = payload.item_list || [];
    const text = items
      .filter((item) => item.type === 1 || item.text_item?.text)
      .map((item) => item.text_item?.text || "")
      .join("\n")
      .trim();

    if (payload.context_token) {
      this.contextTokens.set(userId, payload.context_token);
    }

    const attachments: MessageAttachment[] = [];
    // `type` is documented as optional and older clients occasionally serialize
    // it as a string. Prefer the concrete item payload so media-only messages are
    // never discarded before the desktop can see them.
    const mediaItems = items.filter((item) =>
      Boolean(
        item.image_item ||
        item.voice_item ||
        item.file_item ||
        item.video_item ||
        Number(item.type) === 2 ||
        Number(item.type) === 3 ||
        Number(item.type) === 4 ||
        Number(item.type) === 5,
      ),
    );
    for (let index = 0; index < mediaItems.length; index++) {
      const item = mediaItems[index];
      try {
        const attachment = await this.downloadAttachment(
          item,
          messageId,
          index,
        );
        if (attachment) attachments.push(attachment);
      } catch (error) {
        this.handleError(createError(error), "media-download");
      }
    }

    const messageText =
      text ||
      (attachments.length > 0
        ? localizedWeixinMessage(
            "Please review the attachment.",
            "请查看附件。",
          )
        : mediaItems.length > 0
          ? localizedWeixinMessage(
              "A WeChat attachment was received but could not be downloaded. Send it again from WeChat.",
              "收到一个微信附件，但下载失败。请在微信中重新发送。",
            )
          : "");
    if (!messageText) return;

    const incoming: IncomingMessage = {
      messageId,
      channel: "weixin",
      userId,
      userName: userId,
      chatId: userId,
      isGroup: false,
      text: messageText,
      timestamp: new Date(payload.create_time_ms || Date.now()),
      attachments: attachments.length > 0 ? attachments : undefined,
      metadata: {
        contextToken: payload.context_token,
        toUserId: payload.to_user_id,
        messageType: payload.message_type,
      },
      raw: payload,
    };
    for (const handler of this.messageHandlers) {
      await handler(incoming);
    }
  }

  private async downloadAttachment(
    item: WeixinMessageItem,
    messageId: string,
    index: number,
  ): Promise<MessageAttachment | null> {
    const suffix = `${messageId}-${index + 1}`;

    const imageMedia = item.image_item?.media;
    if (item.image_item && imageMedia) {
      const image = item.image_item;
      const encodedKey = image.aeskey || imageMedia.aes_key;
      const data = await downloadMedia(imageMedia, encodedKey);
      const detected = detectImage(data);
      return {
        type: "image",
        data,
        mimeType: detected.mimeType,
        fileName: `weixin-image-${suffix}${detected.extension}`,
        size: data.length,
      };
    }

    const fileMedia = item.file_item?.media;
    if (item.file_item && fileMedia) {
      const file = item.file_item;
      const declaredSize = Number(file.len || 0);
      if (declaredSize > MAX_MEDIA_BYTES) {
        throw new Error(
          `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
        );
      }
      if (!fileMedia.aes_key) {
        throw new Error("WeChat file is missing a decryption key");
      }
      const data = await downloadMedia(fileMedia, fileMedia.aes_key);
      const fileName = asString(file.file_name) || `weixin-file-${suffix}`;
      const mimeType = mime.lookup(fileName) || undefined;
      return {
        type: attachmentTypeForFile(mimeType, fileName),
        data,
        mimeType,
        fileName,
        size: data.length,
      };
    }

    const videoMedia = item.video_item?.media;
    if (item.video_item && videoMedia) {
      if (!videoMedia.aes_key) {
        throw new Error("WeChat video is missing a decryption key");
      }
      const data = await downloadMedia(videoMedia, videoMedia.aes_key);
      return {
        type: "video",
        data,
        mimeType: "video/mp4",
        fileName: `weixin-video-${suffix}.mp4`,
        size: data.length,
      };
    }

    const voiceMedia = item.voice_item?.media;
    if (item.voice_item && voiceMedia) {
      if (!voiceMedia.aes_key) {
        throw new Error("WeChat voice message is missing a decryption key");
      }
      const data = await downloadMedia(voiceMedia, voiceMedia.aes_key);
      return {
        type: "audio",
        data,
        mimeType: "audio/silk",
        fileName: `weixin-voice-${suffix}.silk`,
        size: data.length,
      };
    }

    return null;
  }

  private requireContextToken(chatId: string): string {
    const contextToken = this.contextTokens.get(chatId);
    if (!contextToken) {
      throw new Error(
        "Send a message to the assistant from WeChat before replying.",
      );
    }
    return contextToken;
  }

  private async sendItem(
    chatId: string,
    item: WeixinMessageItem,
    clientId = createClientId(),
  ): Promise<string> {
    const response = await this.post("/ilink/bot/sendmessage", {
      msg: {
        from_user_id: "",
        to_user_id: chatId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        context_token: this.requireContextToken(chatId),
        item_list: [item],
      },
      base_info: {
        channel_version: CHANNEL_VERSION,
        bot_agent: BOT_AGENT,
      },
    });
    const ret = Number(response.ret ?? response.errcode ?? 0);
    if (ret !== 0) {
      throw parseApiError(response, `Failed to send WeChat message (${ret})`);
    }
    return asString(response.message_id) || clientId;
  }

  private async uploadOutgoingMedia(
    chatId: string,
    filePath: string,
    mediaType: 1 | 3,
  ): Promise<WeixinOutgoingMediaUpload> {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`WeChat attachment is not a regular file: ${filePath}`);
    }
    if (fileStat.size > MAX_MEDIA_BYTES) {
      throw new Error(
        `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
      );
    }

    const plaintext = await readFile(filePath);
    if (plaintext.length > MAX_MEDIA_BYTES) {
      throw new Error(
        `WeChat attachment exceeds the ${Math.floor(MAX_MEDIA_BYTES / 1024 / 1024)}MB limit`,
      );
    }
    const aesKey = randomBytes(16);
    const aesKeyHex = aesKey.toString("hex");
    const fileKey = randomBytes(16).toString("hex");
    const ciphertext = encryptMedia(plaintext, aesKey);
    const uploadResponse = await this.post("/ilink/bot/getuploadurl", {
      filekey: fileKey,
      media_type: mediaType,
      to_user_id: chatId,
      rawsize: plaintext.length,
      rawfilemd5: createHash("md5").update(plaintext).digest("hex"),
      filesize: ciphertext.length,
      no_need_thumb: true,
      aeskey: aesKeyHex,
      base_info: {
        channel_version: CHANNEL_VERSION,
        bot_agent: BOT_AGENT,
      },
    });
    const ret = Number(uploadResponse.ret ?? uploadResponse.errcode ?? 0);
    if (ret !== 0) {
      throw parseApiError(
        uploadResponse,
        `Failed to prepare WeChat media upload (${ret})`,
      );
    }
    const uploadUrl = getMediaUploadUrl(
      asString(uploadResponse.upload_full_url),
      asString(uploadResponse.upload_param),
      fileKey,
    );
    const downloadEncryptedQueryParam = await uploadMediaCiphertext(
      uploadUrl,
      ciphertext,
    );
    return {
      fileKey,
      downloadEncryptedQueryParam,
      aesKeyHex,
      rawSize: plaintext.length,
      encryptedSize: ciphertext.length,
    };
  }

  private toOutgoingCdnMedia(
    uploaded: WeixinOutgoingMediaUpload,
  ): WeixinCdnMedia {
    return {
      encrypt_query_param: uploaded.downloadEncryptedQueryParam,
      // Tencent's current implementation serializes the 32-character hex key
      // as base64 text for outbound media references.
      aes_key: Buffer.from(uploaded.aesKeyHex, "utf8").toString("base64"),
      encrypt_type: 1,
    };
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(endpoint(this.config.baseUrl, path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        AuthorizationType: "ilink_bot_token",
        Authorization: `Bearer ${this.config.botToken}`,
        "X-WECHAT-UIN": createUinHeader(),
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": CLIENT_VERSION,
      },
      body: JSON.stringify(body),
      signal,
    });
    return readJson(response);
  }

  private isDuplicate(messageId: string): boolean {
    if (this.config.deduplicationEnabled === false) return false;
    const now = Date.now();
    const existing = this.processedMessages.get(messageId);
    if (existing && now - existing < 24 * 60 * 60 * 1000) return true;
    this.processedMessages.set(messageId, now);
    if (this.processedMessages.size > 2_000) {
      const cutoff = now - 24 * 60 * 60 * 1000;
      for (const [id, timestamp] of this.processedMessages) {
        if (timestamp < cutoff) this.processedMessages.delete(id);
      }
    }
    return false;
  }

  private setStatus(status: ChannelStatus, error?: Error): void {
    this._status = status;
    for (const handler of this.statusHandlers) handler(status, error);
  }

  private handleError(error: Error, context?: string): void {
    logger.error(error.message, context);
    for (const handler of this.errorHandlers) handler(error, context);
  }
}

export function createWeixinAdapter(config: WeixinConfig): WeixinAdapter {
  return new WeixinAdapter(config);
}
