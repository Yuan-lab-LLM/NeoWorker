import type {
  ActiveArtifactContext,
  TaskEvent,
  TaskOutputSummary,
} from "../../shared/types";
import {
  collectLatestEndOfTaskArtifactCards,
  getTaskEventArtifactPaths,
  type GeneratedInlinePreviewKind,
} from "../components/MainContent/artifact-logic";
import { getEffectiveTaskEventType } from "./task-event-compat";

const ARTIFACT_EXTENSION_RE =
  /\.(?:html?|pdf|xlsx?|xlsm|xlsb|csv|tsv|ods|numbers|gsheet|md|markdown|docx?|docm|dotx|dotm|rtf|odt|ott|pages|pptx?|pptm|potx|potm|ppsx|ppsm)$/i;

function normalizeArtifactPath(filePath: string): string {
  return filePath.trim().replace(/\\/g, "/");
}

function getArtifactStem(filePath: string): string {
  const fileName =
    normalizeArtifactPath(filePath).split("/").filter(Boolean).pop() || "";
  return fileName.replace(ARTIFACT_EXTENSION_RE, "").toLocaleLowerCase();
}

/**
 * Office repair/QA rounds commonly write `report-v2.docx` before publishing
 * the verified file as `report.docx`. Treat only an explicit trailing version
 * marker as revision metadata; ordinary digits inside a filename remain part
 * of its identity.
 */
function getArtifactFamilyStem(filePath: string): string {
  return getArtifactStem(filePath)
    .replace(/[\s_-]+v\d+$/iu, "")
    .replace(/[（(]\s*v\d+\s*[）)]$/iu, "")
    .trim();
}

function toActiveArtifactKind(
  kind: GeneratedInlinePreviewKind,
): ActiveArtifactContext["kind"] | null {
  if (kind === "html") return "webpage";
  if (kind === "spreadsheet" || kind === "presentation" || kind === "document")
    return kind;
  return null;
}

function hasArtifactEvidenceSince(args: {
  path: string;
  events: TaskEvent[];
  since: number;
}): boolean {
  const target = normalizeArtifactPath(args.path).toLocaleLowerCase();
  return args.events.some((event) => {
    if (event.timestamp < args.since) return false;
    // A legacy completion event may derive its output list from the entire
    // task history. Do not let that resurrect an artifact from an older turn.
    if (
      getEffectiveTaskEventType(event) === "task_completed" &&
      (!event.payload?.outputSummary ||
        typeof event.payload.outputSummary !== "object")
    ) {
      return false;
    }
    return getTaskEventArtifactPaths(event, args.events).some(
      (candidate) =>
        normalizeArtifactPath(candidate).toLocaleLowerCase() === target,
    );
  });
}

function isAuthoritativeCompletedOutput(args: {
  path: string;
  outputSummary?: TaskOutputSummary | null;
  events: TaskEvent[];
  since: number;
}): boolean {
  if (!args.outputSummary?.outputCount) return false;
  const target = normalizeArtifactPath(args.path).toLocaleLowerCase();
  const outputPaths = [
    args.outputSummary.primaryOutputPath,
    ...args.outputSummary.created,
    ...(args.outputSummary.created.length === 0
      ? args.outputSummary.modifiedFallback || []
      : []),
  ];
  if (
    !outputPaths.some(
      (candidate) =>
        typeof candidate === "string" &&
        normalizeArtifactPath(candidate).toLocaleLowerCase() === target,
    )
  ) {
    return false;
  }
  return args.events.some(
    (event) =>
      event.timestamp >= args.since &&
      getEffectiveTaskEventType(event) === "task_completed",
  );
}

export function findReplacementArtifactForCompletedFollowUp(args: {
  current: ActiveArtifactContext;
  events: TaskEvent[];
  turnStartedAt: number;
  taskId?: string;
  outputSummary?: TaskOutputSummary | null;
}): ActiveArtifactContext | null {
  const currentPath = normalizeArtifactPath(args.current.path);
  const currentFamilyStem = getArtifactFamilyStem(currentPath);
  if (!currentFamilyStem) return null;

  const scopedEvents = args.taskId
    ? args.events.filter((event) => event.taskId === args.taskId)
    : args.events;
  const cards = collectLatestEndOfTaskArtifactCards(
    scopedEvents,
    8,
    args.outputSummary,
  );
  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const candidate = cards[index];
    const hasDirectEvidence = hasArtifactEvidenceSince({
        path: candidate.path,
        events: scopedEvents,
        since: args.turnStartedAt,
      });
    const isFinalOutput = isAuthoritativeCompletedOutput({
      path: candidate.path,
      outputSummary: args.outputSummary,
      events: scopedEvents,
      since: args.turnStartedAt,
    });
    if (!hasDirectEvidence && !isFinalOutput) {
      continue;
    }
    const candidateKind = toActiveArtifactKind(candidate.kind);
    if (!candidateKind) continue;
    const candidatePath = normalizeArtifactPath(candidate.path);
    if (candidatePath === currentPath) continue;
    if (getArtifactFamilyStem(candidatePath) !== currentFamilyStem) continue;
    return { kind: candidateKind, path: candidate.path };
  }

  return null;
}
