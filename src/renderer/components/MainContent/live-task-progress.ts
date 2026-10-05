import type { TaskEvent } from "../../../shared/types";
import { translate } from "../../i18n";
import { getEffectiveTaskEventType } from "../../utils/task-event-compat";
import { isHermesRuntimeEvent } from "../../utils/runtime-privacy";
import { friendlyToolCallTitle } from "../../utils/timeline-tool-labels";
import { localizeProgressText } from "../../utils/localized-progress-text";

export interface LiveTaskOperation {
  id: string;
  label: string;
  state: "active" | "completed" | "failed";
}

export interface LiveTaskProgressState {
  operations: LiveTaskOperation[];
  status: string;
  silentSeconds: number;
  activeCount: number;
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";

function operationLabel(payload: Record<string, unknown>): string {
  const tool = string(payload.tool);
  const input = record(payload.input);
  // The compact overview exposes file names, never command bodies or tool output.
  if (tool === "run_command" || tool === "execute_code") {
    const command = string(input.command);
    const stages: Array<[RegExp, string, string]> = [
      [/\b(?:build_and_qa|build_edit)\.mjs\b/, "buildSlides", "Generating and checking slides"],
      [/\b(?:validate_plan|inspect_edit)\.mjs\b/, "checkSlides", "Checking slide layout"],
      [/\b(?:bootstrap_project|compose_native_edit)\.mjs\b/, "planSlides", "Preparing the presentation"],
      [/\bpreflight\.mjs\b/, "prepare", "Checking the generation environment"],
    ];
    for (const [pattern, key, fallback] of stages) {
      if (pattern.test(command)) return translate(`task.progress.${key}`, fallback);
    }
    return translate("task.progress.runCommand", "Run a command");
  }
  if (tool === "Skill" || tool === "use_skill") return translate("task.progress.readSkill", "Reading skill instructions");
  if (["analyze_image", "read_pdf_visual"].includes(tool)) {
    return translate("task.progress.visualReview", "Checking visual content");
  }
  if (["read_file", "read_files", "parse_document", "write_file", "edit_file"].includes(tool)) {
    const path = string(input.path) || string(input.file_path) || string(input.filePath);
    const name = path.split(/[\\/]/).pop() || "";
    const verb = tool === "write_file" ? "write" : tool === "edit_file" ? "edit" : "read";
    return translate(`task.progress.${verb}`, `${verb}: {name}`, {
      name: name || translate("task.progress.file", "File"),
    });
  }
  return localizeProgressText(friendlyToolCallTitle(tool, input));
}

/** Public execution facts only: never derive summaries from reasoning or tool contents. */
export function deriveLiveTaskProgress(
  events: TaskEvent[], taskId: string, now: number,
): LiveTaskProgressState {
  const scoped = events.filter(event => event.taskId === taskId);
  const boundary = scoped.map(getEffectiveTaskEventType).lastIndexOf("user_message");
  const current = boundary >= 0 ? scoped.slice(boundary) : scoped;
  const operations: Array<LiveTaskOperation & { tool: string; ids: string[] }> = [];
  let lastSignalAt = 0;
  let modelActive = false;
  let visualReview: { completed: number; total: number } | undefined;
  const pendingApprovals = new Set<string>();
  for (const event of current) {
    const type = getEffectiveTaskEventType(event);
    const payload = record(event.payload);
    // A heartbeat is a public liveness fact, even when emitted by Hermes.
    // Do not read or expose any runtime thought/stream text.
    if (type === "progress_update" && payload.phase === "model_response") {
      modelActive = true;
      lastSignalAt = Math.max(lastSignalAt, event.timestamp);
      continue;
    }
    if (type === "progress_update" && payload.phase === "visual_review" &&
        typeof payload.completed === "number" && typeof payload.total === "number") {
      visualReview = { completed: payload.completed, total: payload.total };
      lastSignalAt = Math.max(lastSignalAt, event.timestamp);
      continue;
    }
    if (isHermesRuntimeEvent(event)) continue;
    if (["user_message", "tool_call", "tool_result", "tool_error", "progress_update", "llm_streaming", "approval_requested", "approval_granted", "approval_denied"].includes(type)) {
      lastSignalAt = Math.max(lastSignalAt, event.timestamp);
    }
    const approvalId = string(payload.approvalId) || string(record(payload.approval).id);
    if (type === "approval_requested" && payload.autoApproved !== true) pendingApprovals.add(approvalId || event.id);
    if (type === "approval_granted" || type === "approval_denied") pendingApprovals.delete(approvalId);
    if (!["tool_call", "tool_result", "tool_error"].includes(type)) continue;
    const ids = [payload.toolUseId, payload.toolCallId, payload.callId, payload.id].map(string).filter(Boolean);
    const tool = string(payload.tool);
    if (type === "tool_call") {
      if (operations.some(op => op.id === event.id || (ids.length && op.ids.some(id => ids.includes(id))))) continue;
      // Tools also emit an inner, id-less diagnostic call. The wrapper already
      // represents this execution; counting both leaves phantom active entries.
      if (!ids.length && !payload.input && operations.some(op =>
        op.tool === tool && op.ids.length > 0 && op.state === "active")) continue;
      visualReview = undefined;
      operations.push({ id: event.id, ids, tool, label: operationLabel(payload), state: "active" });
    } else {
      // Legacy id-less tools are paired only when the match is unambiguous.
      const candidates = operations.filter(op => ids.length
        ? op.ids.some(id => ids.includes(id))
        : op.tool === tool && op.ids.length === 0 && op.state === "active");
      // Some legacy producers attach a generated ID only to the result (Skill).
      // Pair with exactly one id-less start, never with a differently identified call.
      const legacyCandidates = ids.length && candidates.length === 0 && tool
        ? operations.filter(op => op.tool === tool && op.ids.length === 0 && op.state === "active") : [];
      const operation = candidates.length === 1 ? candidates[0]
        : legacyCandidates.length === 1 ? legacyCandidates[0] : undefined;
      if (operation) {
        const result = record(payload.result);
        operation.state = type === "tool_error" || payload.success === false || result.success === false || Boolean(result.error)
          ? "failed" : "completed";
      }
    }
    modelActive = false;
  }
  const active = operations.filter(op => op.state === "active");
  const recent = operations.filter(op => op.state !== "active").slice(-1);
  const status = pendingApprovals.size > 0
    ? translate("task.progress.approval", "Waiting for your approval")
    : active.length
      ? visualReview && active.some(op => op.tool === "read_pdf_visual")
        ? translate("task.progress.reviewPages", "Checking page images · {completed}/{total}", visualReview)
        : active[active.length - 1].label
      : modelActive
        ? translate("task.progress.modelActive", "The model is processing the next step; no new operation yet.")
        : translate("task.progress.waiting", "Waiting for the model's next response");
  return {
    activeCount: active.length,
    operations: [...recent, ...active.slice(-2)].map(({ id, label, state }) => ({ id, label, state })),
    status,
    silentSeconds: lastSignalAt > 0 ? Math.max(0, Math.floor((now - lastSignalAt) / 1000)) : 0,
  };
}
