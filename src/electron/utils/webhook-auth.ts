/**
 * Shared helpers for authenticating inbound HTTP/webhook requests.
 *
 * These back the loopback MCP HTTP transport and the gateway channel webhooks
 * (BlueBubbles, Google Chat, Feishu, ...). Keep the comparison logic in one
 * place so the timing-safe semantics can't drift between call sites.
 */

import { timingSafeEqual } from "crypto";
import type { IncomingMessage } from "http";

/**
 * Constant-time string comparison. Returns false (without leaking timing) when
 * the lengths differ, so callers don't need to length-check first.
 */
export function timingSafeEqualString(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/** Extract the token from an `Authorization: Bearer <token>` header. */
export function readBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/**
 * Read a shared webhook secret from a request, preferring the explicit
 * `x-neoworker-webhook-secret` header and falling back to a bearer token.
 */
export function readWebhookSecret(req: IncomingMessage): string | null {
  const header = req.headers["x-neoworker-webhook-secret"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  return readBearerToken(req.headers.authorization);
}
