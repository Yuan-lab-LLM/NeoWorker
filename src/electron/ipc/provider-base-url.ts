import { promises as dns } from "dns";
import { isIP } from "net";
import { z } from "zod";
import { validateInput } from "../utils/validation";

const OpenAICompatibleBaseUrlSchema = z.string().url().max(500);
const BLOCKED_OPENAI_COMPATIBLE_HOSTNAMES = new Set(["0.0.0.0", "::", "metadata.google.internal"]);
const BLOCKED_OPENAI_COMPATIBLE_IPS = new Set([
  "169.254.169.254", // AWS/GCP/Azure instance metadata pattern
  "100.100.100.200", // Alibaba instance metadata (inside CGNAT)
  "fd00:ec2::254", // AWS IPv6 instance metadata (inside ULA)
]);

export interface ProviderBaseUrlOptions {
  allowLoopback?: boolean;
  /** Only for explicitly configured local/custom model endpoints, not web/tool URLs. */
  allowPrivateNetwork?: boolean;
}

function normalizeHostname(hostname: string): string {
  const trimmed = String(hostname || "")
    .trim()
    .toLowerCase();
  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  const normalized = unwrapped.endsWith(".") ? unwrapped.slice(0, -1) : unwrapped;
  if (isIP(normalized) !== 6) return normalized;
  const canonical = new URL(`http://[${normalized}]/`).hostname.slice(1, -1);
  // Apply the IPv4 policy to mapped addresses too, including metadata addresses.
  const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
}

function isBlockedAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (
    BLOCKED_OPENAI_COMPATIBLE_HOSTNAMES.has(normalized) ||
    BLOCKED_OPENAI_COMPATIBLE_IPS.has(normalized)
  ) return true;
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || (a === 169 && b === 254) || a >= 224;
  }
  return isIP(normalized) === 6 && /^(?:fe[89ab]|ff)/.test(normalized);
}

function isPrivateIpv4Address(address: string): boolean {
  const parts = address.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIpv6Address(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (!normalized || normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true; // link-local fe80::/10
  }
  return false;
}

function isPrivateOrLoopbackAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) return isPrivateIpv4Address(normalized);
  if (family === 6) return isPrivateIpv6Address(normalized);
  return false;
}

function isLoopbackAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (normalized === "localhost") return true;
  const family = isIP(normalized);
  if (family === 4) {
    return normalized.split(".")[0] === "127";
  }
  if (family === 6) {
    return normalized === "::1";
  }
  return false;
}

export async function validateOpenAICompatibleBaseUrl(
  baseUrl: string,
  options: ProviderBaseUrlOptions = {},
): Promise<string> {
  const validatedBaseUrl = validateInput(
    OpenAICompatibleBaseUrlSchema,
    baseUrl,
    "OpenAI-compatible base URL",
  );
  const parsed = new URL(validatedBaseUrl);
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new Error("OpenAI-compatible base URL must use HTTP or HTTPS.");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    throw new Error("OpenAI-compatible base URL must include a valid hostname.");
  }
  const allowLoopback = options.allowLoopback === true;
  const allowPrivateNetwork = options.allowPrivateNetwork === true;
  const disallowedAddress = (address: string) => {
    if (isBlockedAddress(address)) return true;
    if (isLoopbackAddress(address)) return !allowLoopback;
    return isPrivateOrLoopbackAddress(address) && !allowPrivateNetwork;
  };
  if (isBlockedAddress(hostname) || (hostname.endsWith(".local") && !allowPrivateNetwork)) {
    throw new Error("OpenAI-compatible base URL cannot target blocked hosts.");
  }
  if (disallowedAddress(hostname)) {
    throw new Error(
      "OpenAI-compatible base URL cannot target private network hosts (except loopback).",
    );
  }

  // Literal IPs have already been checked; DNS is only needed for hostnames.
  if (isIP(hostname)) return validatedBaseUrl;

  try {
    const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
    if (resolved.some((entry) => disallowedAddress(entry.address))) {
      throw new Error("OpenAI-compatible base URL resolved to a blocked private/metadata address.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "ENODATA") {
      // Let downstream request handling surface connectivity errors.
      return validatedBaseUrl;
    }
    throw error;
  }

  return validatedBaseUrl;
}
