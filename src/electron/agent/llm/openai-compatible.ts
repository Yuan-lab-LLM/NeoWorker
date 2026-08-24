import {
  LLMContent,
  LLMImageContent,
  LLMMessage,
  LLMResponse,
  LLMSystemBlock,
  LLMTool,
} from "./types";
import { createHash } from "node:crypto";
import { imageToTextFallback } from "./image-utils";
import { createLogger } from "../../utils/logger";
import { assertNormalizedTurnTranscript } from "../runtime/turn-transcript-normalizer";
import {
  extractOpenAICompatibleCacheUsage,
  splitSystemBlocksForOpenAIPrefix,
} from "./prompt-cache";

const logger = createLogger("openai-compat");

type RetryableToolArgumentsError = Error & {
  code: "MALFORMED_TOOL_ARGUMENTS";
  retryable: true;
};

/**
 * JSON emitted by some OpenAI-compatible providers occasionally contains
 * literal control characters inside a string value. This is especially
 * common when a model puts a multi-line HTML/Markdown document in a tool
 * argument. JSON requires those characters to be escaped, so repair only
 * control characters that are unambiguously inside a quoted string.
 */
function escapeControlCharactersInsideJsonStrings(value: string): string {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }
    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }

    switch (char) {
      case "\n":
        output += "\\n";
        break;
      case "\r":
        output += "\\r";
        break;
      case "\t":
        output += "\\t";
        break;
      case "\b":
        output += "\\b";
        break;
      case "\f":
        output += "\\f";
        break;
      default: {
        const code = char.charCodeAt(0);
        output +=
          code < 0x20 ? `\\u${code.toString(16).padStart(4, "0")}` : char;
      }
    }
  }

  return output;
}

/**
 * OpenAI-compatible providers occasionally return almost-valid JSON for a
 * function call (for example a missing comma between two properties). A raw
 * JSON.parse here used to fail the entire agent step even when the assistant
 * had already produced a useful answer. Repair the common formatting slips;
 * if the payload is genuinely unusable, mark it as transient so the executor
 * can retry the model turn instead of surfacing a low-level SyntaxError.
 */
export function parseOpenAICompatibleToolArguments(
  value?: unknown,
): Record<string, Any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Any>;
  }
  const raw = String(value || "{}").trim() || "{}";

  const normalizeObject = (parsed: unknown): Record<string, Any> | null =>
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, Any>)
      : null;

  try {
    const parsed = normalizeObject(JSON.parse(raw));
    if (parsed) return parsed;
  } catch {
    // Continue with the repair pass below.
  }

  try {
    const withoutFence = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    // Repair the most common provider slip: an omitted comma between an
    // object value and the next quoted property name. Keep this deliberately
    // conservative; anything more ambiguous is retried instead of guessed.
    const repaired = escapeControlCharactersInsideJsonStrings(withoutFence)
      .replace(/("(?:\\.|[^"\\])*")(\s+)(?="(?:\\.|[^"\\])*"\s*:)/g, "$1,$2")
      .replace(
        /(\b(?:true|false|null)|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[}\]])(\s+)(?="(?:\\.|[^"\\])*"\s*:)/g,
        "$1,$2",
      )
      .replace(/,\s*([}\]])/g, "$1");
    const parsed = normalizeObject(JSON.parse(repaired));
    if (parsed) {
      logger.warn(
        "Repaired malformed tool-call arguments from an OpenAI-compatible provider",
      );
      return parsed;
    }
  } catch {
    // Fall through to a retryable provider error.
  }

  const error = new Error(
    "The model returned malformed tool arguments. Retrying the model response.",
  ) as RetryableToolArgumentsError;
  error.name = "MalformedToolArgumentsError";
  error.code = "MALFORMED_TOOL_ARGUMENTS";
  error.retryable = true;
  throw error;
}

interface TextEncodedToolCallParseResult {
  visibleText: string;
  toolUses: Array<Extract<LLMContent, { type: "tool_use" }>>;
  hadProtocolMarkers: boolean;
}

/**
 * Some OpenAI-compatible gateways expose Kimi's native tool tokens as plain
 * assistant text instead of translating them to `message.tool_calls`. Convert
 * that envelope back to NeoWorker's provider-neutral tool blocks so it is
 * executed and never shown to the user as an answer.
 */
export function parseTextEncodedToolCalls(
  value: string,
): TextEncodedToolCallParseResult {
  const source = String(value || "");
  const hadProtocolMarkers =
    source.includes("<|tool_calls_section_begin|>") ||
    source.includes("<|tool_call_begin|>") ||
    source.includes("<|tool_call_argument_begin|>");
  if (!hadProtocolMarkers) {
    return { visibleText: source, toolUses: [], hadProtocolMarkers: false };
  }

  const toolUses: TextEncodedToolCallParseResult["toolUses"] = [];
  const toolCallPattern =
    /<\|tool_call_begin\|>\s*([^<\r\n]+?)\s*<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g;
  let match: RegExpExecArray | null;
  while ((match = toolCallPattern.exec(source)) !== null) {
    const rawHeader = match[1].trim();
    const headerWithoutIndex = rawHeader.replace(/:\d+\s*$/, "");
    const name = headerWithoutIndex.replace(/^functions\./i, "").trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(name)) {
      continue;
    }
    const input = parseOpenAICompatibleToolArguments(match[2]);
    const idHash = createHash("sha256")
      .update(`${rawHeader}:${match.index}:${match[2]}`)
      .digest("hex")
      .slice(0, 20);
    toolUses.push({
      type: "tool_use",
      id: `call_compat_${idHash}`,
      name,
      input,
    });
  }

  if (toolUses.length === 0) {
    const error = new Error(
      "The model returned an incomplete text-encoded tool call. Retrying the model response.",
    ) as RetryableToolArgumentsError;
    error.name = "MalformedToolArgumentsError";
    error.code = "MALFORMED_TOOL_ARGUMENTS";
    error.retryable = true;
    throw error;
  }

  toolCallPattern.lastIndex = 0;
  const visibleText = source
    .replace(toolCallPattern, "")
    .replace(/<\|tool_calls_section_(?:begin|end)\|>/g, "")
    .trim();

  return { visibleText, toolUses, hadProtocolMarkers: true };
}

export interface OpenAICompatibleMessageOptions {
  /** Set to false to replace image blocks with text fallback (default: false) */
  supportsImages?: boolean;
  systemBlocks?: LLMSystemBlock[];
  /** Provider-specific maximum for tool call IDs. Matching tool results are rewritten consistently. */
  maxToolCallIdLength?: number;
}

function hashToolCallId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

export function createToolCallIdMapper(
  maxLength?: number,
): (id: string) => string {
  if (!maxLength || maxLength < 1) {
    return (id) => id;
  }

  const byOriginal = new Map<string, string>();
  const used = new Set<string>();

  return (id: string): string => {
    const existing = byOriginal.get(id);
    if (existing) return existing;

    if (id.length <= maxLength && !used.has(id)) {
      byOriginal.set(id, id);
      used.add(id);
      return id;
    }

    const prefix = "call_az_";
    const hash = hashToolCallId(id);
    const hashBudget = Math.max(1, maxLength - prefix.length);
    let mapped = `${prefix}${hash.slice(0, hashBudget)}`;
    let suffix = 1;

    while (used.has(mapped)) {
      const suffixText = `_${suffix++}`;
      const baseBudget = Math.max(
        1,
        maxLength - prefix.length - suffixText.length,
      );
      mapped = `${prefix}${hash.slice(0, baseBudget)}${suffixText}`;
    }

    byOriginal.set(id, mapped);
    used.add(mapped);
    return mapped;
  };
}

export function sanitizeToolCallHistory(messages: LLMMessage[]): LLMMessage[] {
  return assertNormalizedTurnTranscript(messages, (message) =>
    logger.warn(message),
  );
}

export function buildOpenAICompatibleSystemMessages(
  system?: string,
  systemBlocks?: LLMSystemBlock[],
): Array<{ role: "system"; content: string }> {
  const { stableText, volatileText } = splitSystemBlocksForOpenAIPrefix(
    system || "",
    systemBlocks,
  );
  const result: Array<{ role: "system"; content: string }> = [];
  if (stableText) {
    result.push({ role: "system", content: stableText });
  }
  if (volatileText) {
    result.push({ role: "system", content: volatileText });
  }
  return result;
}

export function toOpenAICompatibleMessages(
  messages: LLMMessage[],
  system?: string,
  options?: OpenAICompatibleMessageOptions,
): Array<{
  role: string;
  content: Any;
  tool_call_id?: string;
  tool_calls?: Any[];
  reasoning_content?: string;
  reasoning_details?: Any[];
}> {
  const sanitizedMessages = sanitizeToolCallHistory(messages);
  const result: Array<{
    role: string;
    content: Any;
    tool_call_id?: string;
    tool_calls?: Any[];
    reasoning_content?: string;
    reasoning_details?: Any[];
  }> = [];
  const supportsImages = options?.supportsImages === true;
  const mapToolCallId = createToolCallIdMapper(options?.maxToolCallIdLength);

  result.push(
    ...buildOpenAICompatibleSystemMessages(system, options?.systemBlocks),
  );

  for (const msg of sanitizedMessages) {
    if (typeof msg.content === "string") {
      result.push({ role: msg.role, content: msg.content });
      continue;
    }

    if (!Array.isArray(msg.content)) {
      continue;
    }

    const imageBlocks: LLMImageContent[] = [];
    const textParts: string[] = [];
    const toolCalls: Any[] = [];
    let reasoningContent: string | undefined;
    let reasoningDetails: Any[] | undefined;
    const shouldInlineImages = supportsImages && msg.role === "user";

    for (const item of msg.content) {
      if (typeof (item as Any).reasoning_content === "string") {
        reasoningContent = (item as Any).reasoning_content;
      }
      if (Array.isArray((item as Any).reasoning_details)) {
        reasoningDetails = (item as Any).reasoning_details;
      }
      if (item.type === "tool_result") {
        // OpenAI/Azure require: tool messages must follow an assistant message with tool_calls.
        // After compaction, we can end up with orphaned tool_result (e.g. pinned message
        // between assistant and user, or compaction edge case). Skip orphaned tool results
        // to avoid "messages with role 'tool' must be a response to a preceding message
        // with 'tool_calls'" API errors.
        const last = result[result.length - 1];
        const lastHasToolCalls =
          last?.role === "assistant" && Array.isArray((last as Any).tool_calls);
        const lastIsTool = last?.role === "tool";
        if (lastHasToolCalls || lastIsTool) {
          result.push({
            role: "tool",
            content: item.content,
            tool_call_id: mapToolCallId(item.tool_use_id),
          });
        }
      } else if (item.type === "tool_use") {
        toolCalls.push({
          id: mapToolCallId(item.id),
          type: "function",
          function: {
            name: item.name,
            arguments: JSON.stringify(item.input),
          },
        });
      } else if (item.type === "text") {
        textParts.push(item.text);
      } else if (item.type === "image") {
        if (shouldInlineImages) {
          imageBlocks.push(item);
        } else {
          textParts.push(imageToTextFallback(item));
        }
      }
    }

    if (msg.role === "assistant" && toolCalls.length > 0) {
      const assistantContent =
        textParts.length > 0 ? textParts.join("\n") : null;
      result.push({
        role: msg.role,
        content: assistantContent,
        tool_calls: toolCalls,
        ...(typeof reasoningContent === "string"
          ? { reasoning_content: reasoningContent }
          : {}),
        ...(Array.isArray(reasoningDetails)
          ? { reasoning_details: reasoningDetails }
          : {}),
      });
      continue;
    }

    if (imageBlocks.length > 0) {
      const contentParts: Any[] = [];
      if (textParts.length > 0) {
        contentParts.push({ type: "text", text: textParts.join("\n") });
      }
      for (const img of imageBlocks) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
      }
      result.push({ role: msg.role, content: contentParts });
      continue;
    }

    if (textParts.length > 0) {
      result.push({
        role: msg.role,
        content: textParts.join("\n"),
        ...(msg.role === "assistant" && typeof reasoningContent === "string"
          ? { reasoning_content: reasoningContent }
          : {}),
        ...(msg.role === "assistant" && Array.isArray(reasoningDetails)
          ? { reasoning_details: reasoningDetails }
          : {}),
      });
    } else if (
      msg.role === "assistant" &&
      (typeof reasoningContent === "string" || Array.isArray(reasoningDetails))
    ) {
      result.push({
        role: msg.role,
        content: "",
        ...(typeof reasoningContent === "string"
          ? { reasoning_content: reasoningContent }
          : {}),
        ...(Array.isArray(reasoningDetails)
          ? { reasoning_details: reasoningDetails }
          : {}),
      });
    }
  }

  // Post-processing: remove assistant messages with tool_calls that don't have complete
  // tool responses. This prevents the Azure error: "An assistant message with 'tool_calls'
  // must be followed by tool messages responding to each 'tool_call_id'."
  const cleaned: typeof result = [];
  let i = 0;
  while (i < result.length) {
    const msg = result[i];
    if (
      msg.role === "assistant" &&
      Array.isArray(msg.tool_calls) &&
      msg.tool_calls.length > 0
    ) {
      const toolCallIds: string[] = msg.tool_calls.map((tc: Any) => tc.id);
      // Collect all immediately following tool messages
      const toolMessages: typeof result = [];
      let j = i + 1;
      while (j < result.length && result[j].role === "tool") {
        toolMessages.push(result[j]);
        j++;
      }
      const expectedIds = new Set(toolCallIds);
      const matchedToolMessages = toolMessages.filter(
        (tm) => tm.tool_call_id != null && expectedIds.has(tm.tool_call_id),
      );
      const unexpectedToolMessages = toolMessages.filter(
        (tm) => tm.tool_call_id == null || !expectedIds.has(tm.tool_call_id),
      );
      const coveredIds = new Set(
        matchedToolMessages.map((tm) => tm.tool_call_id),
      );
      const allCovered = toolCallIds.every((id) => coveredIds.has(id));
      if (allCovered) {
        if (unexpectedToolMessages.length > 0) {
          logger.warn(
            `Dropping orphaned tool messages with unexpected tool_call_ids: ${unexpectedToolMessages
              .map((tm) => String(tm.tool_call_id || ""))
              .join(", ")}`,
          );
        }
        cleaned.push(msg, ...matchedToolMessages);
      } else {
        const missing = toolCallIds.filter((id) => !coveredIds.has(id));
        logger.warn(
          `Dropping assistant tool_calls message with uncovered tool_call_ids: ${missing.join(", ")}`,
        );
      }
      i = j;
    } else if (msg.role === "tool") {
      logger.warn(
        `Dropping standalone orphaned tool message with tool_call_id: ${String(
          msg.tool_call_id || "",
        )}`,
      );
      i++;
    } else {
      cleaned.push(msg);
      i++;
    }
  }

  return cleaned;
}

export interface OpenAICompatibleToolOptions {
  functionStrict?: boolean;
}

export function toOpenAICompatibleTools(
  tools: LLMTool[],
  options?: OpenAICompatibleToolOptions,
): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Any;
    strict?: boolean;
  };
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
      ...(typeof options?.functionStrict === "boolean"
        ? { strict: options.functionStrict }
        : {}),
    },
  }));
}

export function fromOpenAICompatibleResponse(response: Any): LLMResponse {
  const content: LLMContent[] = [];
  const choice = response.choices?.[0];

  if (!choice) {
    return {
      content: [{ type: "text", text: "" }],
      stopReason: "end_turn",
    };
  }

  const message = choice.message;
  const structuredToolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : [];
  const rawMessageText =
    typeof message?.content === "string"
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
            .filter(
              (part: Any) =>
                part?.type === "text" && typeof part.text === "string",
            )
            .map((part: Any) => part.text)
            .join("\n")
        : "";
  const textEncoded = rawMessageText
    ? parseTextEncodedToolCalls(rawMessageText)
    : { visibleText: "", toolUses: [], hadProtocolMarkers: false };
  const reasoningEncoded =
    typeof message?.reasoning_content === "string"
      ? parseTextEncodedToolCalls(message.reasoning_content)
      : { visibleText: "", toolUses: [], hadProtocolMarkers: false };
  const reasoningContent = reasoningEncoded.visibleText || undefined;
  const reasoningDetails = Array.isArray(message?.reasoning_details)
    ? message.reasoning_details
    : undefined;

  if (textEncoded.visibleText) {
    content.push({
      type: "text",
      text: textEncoded.visibleText,
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
    });
  }

  if (structuredToolCalls.length > 0) {
    for (const toolCall of structuredToolCalls) {
      if (toolCall.type === "function") {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: parseOpenAICompatibleToolArguments(
            toolCall.function.arguments,
          ),
        });
      }
    }
  } else {
    content.push(...textEncoded.toolUses, ...reasoningEncoded.toolUses);
  }

  if (
    !textEncoded.visibleText &&
    (reasoningContent || reasoningDetails) &&
    content.length > 0
  ) {
    content[0] = {
      ...content[0],
      ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
      ...(reasoningDetails ? { reasoning_details: reasoningDetails } : {}),
    };
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return {
    content,
    stopReason: content.some((item) => item.type === "tool_use")
      ? "tool_use"
      : mapStopReason(choice.finish_reason),
    usage: response.usage
      ? {
          inputTokens: response.usage.prompt_tokens || 0,
          outputTokens: response.usage.completion_tokens || 0,
          ...extractOpenAICompatibleCacheUsage(response.usage),
        }
      : undefined,
  };
}

export function mapStopReason(
  finishReason?: string,
): LLMResponse["stopReason"] {
  switch (finishReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "content_filter":
      return "stop_sequence";
    default:
      return "end_turn";
  }
}
