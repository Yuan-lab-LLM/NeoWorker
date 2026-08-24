import type { TaskEvent, TaskOutputSummary } from "../../../shared/types";
import { getEffectiveTaskEventType } from "../../utils/task-event-compat";
import { resolveTaskOutputSummaryFromCompletionEvent } from "../../utils/task-outputs";
import { isUserVisibleTaskArtifactPath } from "../../utils/task-artifact-visibility";
import { normalizeArtifactPathForWorkspace } from "../../utils/artifact-path-identity";
import {
  isSpreadsheetArtifactFile,
  isSpreadsheetMimeType,
} from "../../../shared/spreadsheet-formats";
import {
  isWordDocumentArtifactFile,
  isWordDocumentMimeType,
} from "../../../shared/document-formats";
import {
  isPresentationArtifactFile,
  isPresentationMimeType,
} from "../../../shared/presentation-formats";
import {
  isWebPageArtifactFile,
  isWebPageMimeType,
} from "../../../shared/web-page-formats";
import {
  IMAGE_FILE_EXT_RE,
  VIDEO_FILE_EXT_RE,
  HTML_FILE_EXT_RE,
} from "./main-content-constants";

export type GeneratedInlinePreviewKind =
  "image" | "video" | "html" | "spreadsheet" | "presentation" | "document";
export const END_OF_TASK_ARTIFACT_KINDS = new Set<GeneratedInlinePreviewKind>([
  "html",
  "spreadsheet",
  "presentation",
  "document",
]);
const END_OF_TASK_ARTIFACT_COLLAPSED_LIMIT = 5;
const END_OF_TASK_ARTIFACT_CARD_ESTIMATED_HEIGHT = 86;
const END_OF_TASK_ARTIFACT_STACK_CHROME_ESTIMATED_HEIGHT = 28;
const END_OF_TASK_ARTIFACT_SHOW_MORE_ESTIMATED_HEIGHT = 48;

export interface EndOfTaskArtifactCard {
  path: string;
  kind: GeneratedInlinePreviewKind;
  eventId?: string;
  lastReferenceIndex: number;
  lastReferenceTimestamp: number;
}

export interface EndOfTaskArtifactStack {
  anchorEventIndex: number;
  artifacts: EndOfTaskArtifactCard[];
}

/**
 * Resolve events from a filtered/projected timeline back to their positions in
 * the complete task event stream. Timeline item indices are local to the
 * projection and must not be compared with artifact anchor indices directly.
 */
export function getEarliestTaskEventStreamIndex(
  eventStream: TaskEvent[],
  candidateEvents: TaskEvent[],
  existingIndexById?: ReadonlyMap<string, number>,
): number {
  if (eventStream.length === 0 || candidateEvents.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const indexById =
    existingIndexById ??
    new Map(
      eventStream.flatMap((event, index) => {
        const eventId = event.id?.trim();
        return eventId ? [[eventId, index] as const] : [];
      }),
    );

  let earliestIndex = Number.POSITIVE_INFINITY;
  for (const candidate of candidateEvents) {
    const eventId = candidate.id?.trim();
    const indexedById = eventId ? indexById.get(eventId) : undefined;
    const eventIndex =
      typeof indexedById === "number"
        ? indexedById
        : eventStream.findIndex((event) => event === candidate);
    if (eventIndex >= 0) earliestIndex = Math.min(earliestIndex, eventIndex);
  }

  return earliestIndex;
}

export function getEndOfTaskArtifactStackAnchorEventId(
  stack: EndOfTaskArtifactStack,
  eventStream: TaskEvent[],
): string | null {
  const indexedEventId = eventStream[stack.anchorEventIndex]?.id?.trim();
  if (indexedEventId) return indexedEventId;

  for (let index = stack.artifacts.length - 1; index >= 0; index -= 1) {
    const artifactEventId = stack.artifacts[index]?.eventId?.trim();
    if (artifactEventId) return artifactEventId;
  }
  return null;
}

export function getVisibleEndOfTaskArtifactCards(
  artifacts: EndOfTaskArtifactCard[],
  expanded: boolean,
): { visibleArtifacts: EndOfTaskArtifactCard[]; hiddenCount: number } {
  if (expanded || artifacts.length <= END_OF_TASK_ARTIFACT_COLLAPSED_LIMIT) {
    return { visibleArtifacts: artifacts, hiddenCount: 0 };
  }

  return {
    visibleArtifacts: artifacts.slice(0, END_OF_TASK_ARTIFACT_COLLAPSED_LIMIT),
    hiddenCount: artifacts.length - END_OF_TASK_ARTIFACT_COLLAPSED_LIMIT,
  };
}

export function estimateEndOfTaskArtifactStackHeight(
  artifacts: EndOfTaskArtifactCard[],
  expanded: boolean,
): number {
  const { visibleArtifacts, hiddenCount } = getVisibleEndOfTaskArtifactCards(
    artifacts,
    expanded,
  );
  return (
    END_OF_TASK_ARTIFACT_STACK_CHROME_ESTIMATED_HEIGHT +
    visibleArtifacts.length * END_OF_TASK_ARTIFACT_CARD_ESTIMATED_HEIGHT +
    (hiddenCount > 0 ? END_OF_TASK_ARTIFACT_SHOW_MORE_ESTIMATED_HEIGHT : 0)
  );
}

const GENERATED_ARTIFACT_LINK_EXTENSIONS =
  "html?|pdf|xlsx?|xlsm|xlsb|csv|tsv|ods|numbers|gsheet|md|markdown|docx|docm|dotx|dotm|doc|rtf|odt|ott|pages|pptx|pptm?|potx|potm|ppsx|ppsm";

const GENERATED_ARTIFACT_LINK_RE = new RegExp(
  "`([^`\\r\\n]+\\.(?:" +
    GENERATED_ARTIFACT_LINK_EXTENSIONS +
    "))`|((?:\\.{1,2}/|[\\w@.-]+/)?[\\w@./-]+\\.(?:" +
    GENERATED_ARTIFACT_LINK_EXTENSIONS +
    "))",
  "gi",
);

const NON_OUTPUT_ARTIFACT_REFERENCE_RE =
  /(?:\b(?:planned artifacts?|intended (?:export )?(?:contract|outputs?|paths?)|what i attempted|not successfully (?:written|saved|created)|file persistence (?:is )?(?:still )?blocked|blocked by|blocked part|could not (?:write|save|create)|cannot (?:write|save|create)|failed to (?:write|save|create)|writes? failed|shell\/write failure|disk-write failure)\b|(?:无法|不能|未能|没有成功)(?:直接)?(?:写入|保存|创建|生成|导出|落盘)|(?:写入|保存|创建|生成|导出|落盘)(?:失败|受阻)|保存为.{0,160}(?:即可|请自行|请手动))/i;
const OUTPUT_ARTIFACT_REFERENCE_RE =
  /(?:\b(?:(?:now|successfully)\s+(?:saved|created|wrote|written|generated|exported|produced|rendered)|(?:saved|created|wrote|written|generated|exported|produced|rendered|validated|updated)\s+(?:files?|artifacts?|outputs?)|artifact ready|output ready)\b|\b(?:done|file|output)\s*:|\b(?:saved|created|wrote|written|generated|exported|produced|rendered|updated)\s+(?=(?:`|[./~\w@-]))|(?:已|现已)(?:成功)?(?:保存|创建|写入|生成|导出|产出|渲染|落盘)|(?:文件|产物|输出)(?:已)?(?:就绪|完成)|(?:文件|输出)[：:])/i;

export function getInlinePreviewKindForGeneratedFile(args: {
  path?: unknown;
  mimeType?: unknown;
  type?: unknown;
}): GeneratedInlinePreviewKind | null {
  const filePath = typeof args.path === "string" ? args.path : "";
  const mimeType =
    typeof args.mimeType === "string" ? args.mimeType.toLowerCase() : "";
  const fileType = typeof args.type === "string" ? args.type.toLowerCase() : "";

  if (
    fileType === "image" ||
    mimeType.startsWith("image/") ||
    IMAGE_FILE_EXT_RE.test(filePath)
  ) {
    return "image";
  }

  if (
    fileType === "video" ||
    mimeType.startsWith("video/") ||
    VIDEO_FILE_EXT_RE.test(filePath)
  ) {
    return "video";
  }

  if (
    fileType === "html" ||
    isWebPageMimeType(mimeType) ||
    isWebPageArtifactFile(filePath) ||
    HTML_FILE_EXT_RE.test(filePath)
  ) {
    return "html";
  }

  if (
    fileType === "spreadsheet" ||
    isSpreadsheetMimeType(mimeType) ||
    isSpreadsheetArtifactFile(filePath)
  ) {
    return "spreadsheet";
  }

  if (
    fileType === "presentation" ||
    isPresentationMimeType(mimeType) ||
    isPresentationArtifactFile(filePath)
  ) {
    return "presentation";
  }

  if (
    fileType === "document" ||
    fileType === "pdf" ||
    fileType === "docx" ||
    fileType === "markdown" ||
    isWordDocumentMimeType(mimeType) ||
    isWordDocumentArtifactFile(filePath)
  ) {
    return "document";
  }

  return null;
}

function normalizeGeneratedArtifactPathCandidate(candidate: string): string {
  const normalized = candidate
    .trim()
    .replace(/^[<"'""'']+/g, "")
    .replace(/[>"'""'',.;:)\]}]+$/g, "");

  if (!normalized || /^(?:https?:)?\/\//i.test(normalized)) return "";
  if (!getInlinePreviewKindForGeneratedFile({ path: normalized })) return "";
  return normalized;
}

function getLineAtOffset(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const lineEnd = text.indexOf("\n", offset);
  return text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
}

function getPreviousNonEmptyLines(
  text: string,
  offset: number,
  limit: number,
): string[] {
  const lines: string[] = [];
  let cursor = text.lastIndexOf("\n", Math.max(0, offset - 1));
  while (cursor > 0 && lines.length < limit) {
    const previousLineEnd = cursor;
    const previousLineStart = text.lastIndexOf("\n", previousLineEnd - 1) + 1;
    const line = text.slice(previousLineStart, previousLineEnd).trim();
    if (line) lines.push(line);
    cursor = previousLineStart - 1;
  }
  return lines;
}

function hasPositiveArtifactReference(line: string): boolean {
  return OUTPUT_ARTIFACT_REFERENCE_RE.test(line);
}

function isOutputArtifactReferenceContext(
  text: string,
  start: number,
): boolean {
  const currentLine = getLineAtOffset(text, start).trim();
  if (hasPositiveArtifactReference(currentLine)) return true;
  if (NON_OUTPUT_ARTIFACT_REFERENCE_RE.test(currentLine)) return false;

  for (const line of getPreviousNonEmptyLines(text, start, 4)) {
    if (hasPositiveArtifactReference(line)) return true;
    if (NON_OUTPUT_ARTIFACT_REFERENCE_RE.test(line)) return false;
  }
  // Text mentions are not proof that a file exists. Only actual file events or
  // an explicit save/create/output statement may promote a path into a
  // clickable artifact card. This prevents source/reference files mentioned in
  // reports from being mislabeled as newly generated outputs.
  return false;
}

export function extractGeneratedArtifactPathsFromText(
  text: string,
  limit = 8,
): string[] {
  if (!text.trim()) return [];
  GENERATED_ARTIFACT_LINK_RE.lastIndex = 0;

  const seen = new Set<string>();
  const paths: string[] = [];
  let match: RegExpExecArray | null;
  while (
    (match = GENERATED_ARTIFACT_LINK_RE.exec(text)) &&
    paths.length < limit
  ) {
    const prefix = text.slice(Math.max(0, match.index - 8), match.index);
    if (/https?:\/\/$/i.test(prefix)) continue;
    if (!isOutputArtifactReferenceContext(text, match.index)) {
      continue;
    }
    const candidate = normalizeGeneratedArtifactPathCandidate(
      match[1] || match[2] || "",
    );
    if (!candidate) continue;
    const dedupeKey = candidate.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    paths.push(candidate);
  }
  return paths;
}

export function getInlinePreviewKindForTaskEvent(
  event: TaskEvent,
): GeneratedInlinePreviewKind | null {
  const effectiveType = getEffectiveTaskEventType(event);
  if (
    effectiveType !== "file_created" &&
    effectiveType !== "file_modified" &&
    effectiveType !== "artifact_created"
  ) {
    return null;
  }

  return getInlinePreviewKindForGeneratedFile({
    path: event.payload?.path || event.payload?.from,
    mimeType: event.payload?.mimeType,
    type: event.payload?.type,
  });
}

function hasAuthoritativeCompletionOutputSummary(
  eventStream?: TaskEvent[],
  referenceEvent?: TaskEvent,
): boolean {
  if (!Array.isArray(eventStream)) return false;

  let segmentStart = 0;
  let segmentEnd = eventStream.length;
  if (referenceEvent) {
    const referenceIndex = eventStream.findIndex(
      (event) =>
        event === referenceEvent ||
        Boolean(
          event.id && referenceEvent.id && event.id === referenceEvent.id,
        ),
    );
    if (referenceIndex >= 0) {
      for (let index = referenceIndex; index >= 0; index -= 1) {
        if (getEffectiveTaskEventType(eventStream[index]) === "user_message") {
          segmentStart = index;
          break;
        }
      }
      for (
        let index = referenceIndex + 1;
        index < eventStream.length;
        index += 1
      ) {
        if (getEffectiveTaskEventType(eventStream[index]) === "user_message") {
          segmentEnd = index;
          break;
        }
      }
    }
  }

  return eventStream.slice(segmentStart, segmentEnd).some((event) => {
    if (getEffectiveTaskEventType(event) !== "task_completed") return false;
    const outputSummary = event.payload?.outputSummary;
    return Boolean(
      outputSummary &&
      typeof outputSummary === "object" &&
      !Array.isArray(outputSummary),
    );
  });
}

function normalizeArtifactCardKey(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function isEventInCompletedTurn(
  eventStream: TaskEvent[],
  eventIndex: number,
): boolean {
  let segmentEnd = eventStream.length;
  for (let index = eventIndex + 1; index < eventStream.length; index += 1) {
    if (getEffectiveTaskEventType(eventStream[index]) === "user_message") {
      segmentEnd = index;
      break;
    }
  }

  for (let index = eventIndex; index < segmentEnd; index += 1) {
    if (getEffectiveTaskEventType(eventStream[index]) === "task_completed") {
      return true;
    }
  }
  return false;
}

export function getArtifactCardDisplayKey(
  filePath: string,
  kind: GeneratedInlinePreviewKind,
): string {
  const normalized = normalizeArtifactCardKey(filePath);
  const fileName = normalized.split("/").filter(Boolean).pop() || normalized;
  return `${kind}:${fileName}`;
}

export function getTaskEventArtifactPaths(
  event: TaskEvent,
  eventStream?: TaskEvent[],
): string[] {
  const effectiveType = getEffectiveTaskEventType(event);
  const paths: unknown[] = getAuthoritativeTaskEventArtifactPaths(
    event,
    eventStream,
  );
  const completionOwnsArtifactProjection =
    hasAuthoritativeCompletionOutputSummary(eventStream, event);

  if (
    effectiveType === "follow_up_completed" &&
    !completionOwnsArtifactProjection
  ) {
    const message =
      typeof event.payload?.followUpMessage === "string"
        ? event.payload.followUpMessage
        : "";
    paths.push(
      ...resolveArtifactPathsAgainstTaskEvents(
        extractGeneratedArtifactPathsFromText(message),
        eventStream || [],
      ),
    );
  }

  if (
    effectiveType === "assistant_message" &&
    !completionOwnsArtifactProjection
  ) {
    const message =
      typeof event.payload?.message === "string" ? event.payload.message : "";
    paths.push(
      ...resolveArtifactPathsAgainstTaskEvents(
        extractGeneratedArtifactPathsFromText(message),
        eventStream || [],
      ),
    );
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const path of paths) {
    if (typeof path !== "string" || path.trim().length === 0) continue;
    const workspacePath = normalizeArtifactPathForWorkspace(path);
    if (!isUserVisibleTaskArtifactPath(workspacePath)) continue;
    const key = normalizeArtifactCardKey(workspacePath);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(workspacePath);
  }
  return normalized;
}

/**
 * Return only paths backed by file lifecycle events or the executor's
 * completion contract. Assistant prose is intentionally excluded: models can
 * mention an intended filename even when a differently named file was the one
 * actually written. Those mentions must never become clickable artifacts by
 * themselves.
 */
function getAuthoritativeTaskEventArtifactPaths(
  event: TaskEvent,
  eventStream?: TaskEvent[],
): string[] {
  if (
    String(event.payload?.source || "").trim().toLowerCase() ===
      "artifact_bootstrap" ||
    event.payload?.provisional === true
  ) {
    return [];
  }
  const effectiveType = getEffectiveTaskEventType(event);
  const paths: unknown[] = [];

  if (effectiveType === "file_modified") {
    // Rename/move events describe the same file twice. The destination is the
    // artifact users can still open, while `from` is often stale immediately
    // after the event. Only fall back to the source when no destination exists.
    const destination = event.payload?.path || event.payload?.to;
    paths.push(destination || event.payload?.from);
  } else if (
    effectiveType === "file_created" ||
    effectiveType === "artifact_created"
  ) {
    paths.push(event.payload?.path, event.payload?.to, event.payload?.from);
  }

  if (event.type === "timeline_artifact_emitted") {
    paths.push(event.payload?.path);
  }

  if (effectiveType === "task_completed") {
    const outputSummary = resolveTaskOutputSummaryFromCompletionEvent(
      event,
      eventStream,
    );
    if (outputSummary) {
      const created = Array.isArray(outputSummary.created)
        ? outputSummary.created
        : [];
      paths.push(
        outputSummary.primaryOutputPath,
        ...created,
        ...(created.length === 0 ? outputSummary.modifiedFallback || [] : []),
      );
    }
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of paths) {
    if (typeof candidate !== "string" || candidate.trim().length === 0)
      continue;
    const key = normalizeArtifactCardKey(candidate);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(candidate);
  }
  return normalized;
}

function getArtifactPathSpecificity(filePath: string): number {
  const normalized = filePath.trim().replace(/\\/g, "/");
  if (/^(?:\/|[a-z]:\/)/i.test(normalized)) return 3;
  if (normalized.includes("/")) return 2;
  return 1;
}

function getArtifactFileName(filePath: string): string {
  const normalized = normalizeArtifactCardKey(filePath);
  return normalized.split("/").filter(Boolean).pop() || normalized;
}

/**
 * Upgrade filename-only references in assistant text to the authoritative path
 * recorded by file events. This keeps preview/open/download attached to the
 * file's latest location after a rename or move.
 */
export function resolveArtifactPathsAgainstTaskEvents(
  paths: string[],
  eventStream: TaskEvent[],
): string[] {
  if (paths.length === 0) return [];
  if (!Array.isArray(eventStream) || eventStream.length === 0) return [];

  const bestPathByFileName = new Map<
    string,
    { path: string; score: number; index: number }
  >();
  const bestPathByExactKey = new Map<
    string,
    { path: string; score: number; index: number }
  >();
  eventStream.forEach((event, index) => {
    for (const eventPath of getAuthoritativeTaskEventArtifactPaths(
      event,
      eventStream,
    )) {
      const fileName = getArtifactFileName(eventPath);
      const score = getArtifactPathSpecificity(eventPath);
      const exactKey = normalizeArtifactCardKey(eventPath);
      const exactCurrent = bestPathByExactKey.get(exactKey);
      if (
        !exactCurrent ||
        index > exactCurrent.index ||
        (index === exactCurrent.index && score >= exactCurrent.score)
      ) {
        bestPathByExactKey.set(exactKey, { path: eventPath, score, index });
      }
      const current = bestPathByFileName.get(fileName);
      if (
        !current ||
        index > current.index ||
        (index === current.index && score >= current.score)
      ) {
        bestPathByFileName.set(fileName, { path: eventPath, score, index });
      }
    }
  });

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const filePath of paths) {
    const exactEvidence = bestPathByExactKey.get(
      normalizeArtifactCardKey(filePath),
    );
    const evidence =
      exactEvidence || bestPathByFileName.get(getArtifactFileName(filePath));
    // A sentence that says a file was generated is not filesystem evidence.
    // Drop the reference when no lifecycle/completion event corroborates it.
    if (!evidence) continue;
    const key = normalizeArtifactCardKey(evidence.path);
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(evidence.path);
  }
  return resolved;
}

export function shouldRenderOpenArtifactCardAtEvent(args: {
  path: string;
  event: TaskEvent;
  eventStream?: TaskEvent[];
}): boolean {
  const previewKind = getInlinePreviewKindForGeneratedFile({ path: args.path });
  if (!previewKind || !END_OF_TASK_ARTIFACT_KINDS.has(previewKind)) return true;
  const eventStream = args.eventStream;
  if (!Array.isArray(eventStream) || eventStream.length === 0) return true;

  const targetKey = getArtifactCardDisplayKey(args.path, previewKind);
  let currentIndex = -1;
  let lastReferenceIndex = -1;
  for (let index = 0; index < eventStream.length; index += 1) {
    const candidate = eventStream[index];
    if (
      candidate === args.event ||
      (candidate.id && candidate.id === args.event.id)
    ) {
      currentIndex = index;
    }
    const referencesTarget = getTaskEventArtifactPaths(
      candidate,
      eventStream,
    ).some((path) => {
      const candidateKind =
        getInlinePreviewKindForGeneratedFile({ path }) || previewKind;
      return getArtifactCardDisplayKey(path, candidateKind) === targetKey;
    });
    if (referencesTarget) {
      lastReferenceIndex = index;
    }
  }

  if (currentIndex < 0 || !isEventInCompletedTurn(eventStream, currentIndex)) {
    return false;
  }

  return currentIndex >= 0 && currentIndex === lastReferenceIndex;
}

export function collectLatestEndOfTaskArtifactCards(
  eventStream: TaskEvent[],
  limit = 8,
  fallbackOutputSummary?: TaskOutputSummary | null,
): EndOfTaskArtifactCard[] {
  if (!Array.isArray(eventStream) || eventStream.length === 0 || limit <= 0)
    return [];

  const byKey = new Map<string, EndOfTaskArtifactCard>();
  eventStream.forEach((event, index) => {
    for (const artifactPath of getTaskEventArtifactPaths(event, eventStream)) {
      const kind = getInlinePreviewKindForGeneratedFile({ path: artifactPath });
      if (!kind || !END_OF_TASK_ARTIFACT_KINDS.has(kind)) continue;
      if (!isEventInCompletedTurn(eventStream, index)) continue;
      const displayKey = getArtifactCardDisplayKey(artifactPath, kind);
      const previous = byKey.get(displayKey);
      const preferredPath =
        previous &&
        previous.lastReferenceIndex === index &&
        getArtifactPathSpecificity(previous.path) >
          getArtifactPathSpecificity(artifactPath)
          ? previous.path
          : artifactPath;
      byKey.set(displayKey, {
        path: preferredPath,
        kind,
        eventId: event.id,
        lastReferenceIndex: index,
        lastReferenceTimestamp: event.timestamp,
      });
    }
  });

  // The persisted bestKnownOutcome is the task-level delivery contract. It is
  // more authoritative than intermediate file events from automatic repair or
  // quality-check rounds. Once it exists, project only those final files so
  // superseded v2/v3 documents do not remain as delivery cards.
  if (fallbackOutputSummary?.outputCount) {
    let completionIndex = -1;
    for (let index = eventStream.length - 1; index >= 0; index -= 1) {
      if (getEffectiveTaskEventType(eventStream[index]) === "task_completed") {
        completionIndex = index;
        break;
      }
    }
    if (completionIndex >= 0) {
      const completionEvent = eventStream[completionIndex];
      const fallbackPaths = [
        fallbackOutputSummary.primaryOutputPath,
        ...(fallbackOutputSummary.created.length > 0
          ? fallbackOutputSummary.created
          : fallbackOutputSummary.modifiedFallback || []),
      ];
      const authoritativeByKey = new Map<string, EndOfTaskArtifactCard>();
      for (const artifactPath of fallbackPaths) {
        if (typeof artifactPath !== "string" || !artifactPath.trim()) continue;
        const workspaceArtifactPath =
          normalizeArtifactPathForWorkspace(artifactPath);
        if (!isUserVisibleTaskArtifactPath(workspaceArtifactPath)) continue;
        const kind = getInlinePreviewKindForGeneratedFile({
          path: workspaceArtifactPath,
        });
        if (!kind || !END_OF_TASK_ARTIFACT_KINDS.has(kind)) continue;
        const displayKey = getArtifactCardDisplayKey(
          workspaceArtifactPath,
          kind,
        );
        if (authoritativeByKey.has(displayKey)) continue;
        const existingCard = byKey.get(displayKey);
        if (existingCard) {
          // bestKnownOutcome is task-scoped and can survive across follow-up
          // turns. It may choose which final files remain visible, but it must
          // not move an already-observed artifact onto the newest completion
          // event. Preserve the event/turn where the file actually appeared.
          authoritativeByKey.set(displayKey, {
            ...existingCard,
            path:
              getArtifactPathSpecificity(workspaceArtifactPath) >=
              getArtifactPathSpecificity(existingCard.path)
                ? workspaceArtifactPath
                : existingCard.path,
          });
          continue;
        }
        authoritativeByKey.set(displayKey, {
          path: workspaceArtifactPath,
          kind,
          eventId: completionEvent.id,
          lastReferenceIndex: completionIndex,
          lastReferenceTimestamp: completionEvent.timestamp,
        });
      }
      byKey.clear();
      for (const [key, card] of authoritativeByKey) byKey.set(key, card);
    }
  }

  const cards = Array.from(byKey.values()).sort((a, b) => {
    if (a.lastReferenceIndex !== b.lastReferenceIndex) {
      return a.lastReferenceIndex - b.lastReferenceIndex;
    }
    return a.lastReferenceTimestamp - b.lastReferenceTimestamp;
  });
  return cards.slice(Math.max(0, cards.length - limit));
}

export function collectEndOfTaskArtifactCardStacks(
  eventStream: TaskEvent[],
  limit = 8,
  fallbackOutputSummary?: TaskOutputSummary | null,
): EndOfTaskArtifactStack[] {
  const cards = collectLatestEndOfTaskArtifactCards(
    eventStream,
    limit,
    fallbackOutputSummary,
  );
  if (cards.length === 0) return [];

  const byAnchorIndex = new Map<number, EndOfTaskArtifactCard[]>();
  for (const card of cards) {
    const existing = byAnchorIndex.get(card.lastReferenceIndex) || [];
    existing.push(card);
    byAnchorIndex.set(card.lastReferenceIndex, existing);
  }

  return Array.from(byAnchorIndex.entries())
    .sort(([a], [b]) => a - b)
    .map(([anchorEventIndex, artifacts]) => ({
      anchorEventIndex,
      artifacts,
    }));
}
