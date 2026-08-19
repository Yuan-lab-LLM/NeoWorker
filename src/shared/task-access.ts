import type {
  IntegrationMentionSelection,
  Task,
  TaskAccessCapabilityState,
  TaskAccessConnector,
  TaskAccessPolicy,
  TaskAccessSummary,
  TaskEvent,
  Workspace,
} from "./types";

export interface AvailableTaskConnector {
  id: string;
  name: string;
  icon: string;
  status: string;
  tools: string[];
}

const MAX_CONNECTORS = 100;
const MAX_SKILLS = 50;
const MAX_TOOLS = 100;
const MAX_FILES = 50;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function effectiveEventType(event: TaskEvent): string {
  return nonEmptyString(event.legacyType) || String(event.type || "");
}

function normalizeIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function mentionMatchesConnector(
  mention: IntegrationMentionSelection,
  connector: AvailableTaskConnector,
): boolean {
  const candidates = [mention.id, mention.providerKey, mention.label]
    .map(normalizeIdentity)
    .filter(Boolean);
  const connectorCandidates = [connector.id, connector.name].map(normalizeIdentity).filter(Boolean);
  return candidates.some((candidate) =>
    connectorCandidates.some(
      (connectorCandidate) =>
        candidate === connectorCandidate ||
        candidate.includes(connectorCandidate) ||
        connectorCandidate.includes(candidate),
    ),
  );
}

export interface TaskAccessUsage {
  usedSkillIds: string[];
  usedToolNames: string[];
  referencedFiles: string[];
}

export function deriveTaskAccessUsage(events: readonly TaskEvent[], task?: Task): TaskAccessUsage {
  const skills = new Set<string>();
  const tools = new Set<string>();
  const files = new Set<string>();

  if (task?.agentConfig?.requestedSkillId) {
    skills.add(task.agentConfig.requestedSkillId);
  }

  for (const event of events) {
    const type = effectiveEventType(event);
    const payload = asObject(event.payload);

    if (type === "skill_applied" || type === "skill_used") {
      const skillId =
        nonEmptyString(payload.skillId) ||
        nonEmptyString(payload.skill_id) ||
        nonEmptyString(payload.skillName);
      if (skillId) skills.add(skillId);
    }

    if (type !== "tool_call") continue;
    const toolName = nonEmptyString(payload.tool);
    if (!toolName) continue;
    tools.add(toolName);

    const input = asObject(payload.input);
    if (toolName === "skill" || toolName === "run_skill") {
      const skillId =
        nonEmptyString(input.skillId) ||
        nonEmptyString(input.skill_id) ||
        nonEmptyString(input.skillName) ||
        nonEmptyString(input.skill_name) ||
        nonEmptyString(input.skill);
      if (skillId) skills.add(skillId);
    }
    if (toolName === "read_file" || toolName === "search_files" || toolName === "list_directory") {
      const filePath = nonEmptyString(input.path);
      if (filePath) files.add(filePath);
    }
  }

  return {
    usedSkillIds: Array.from(skills).slice(0, MAX_SKILLS),
    usedToolNames: Array.from(tools).slice(0, MAX_TOOLS),
    referencedFiles: Array.from(files).slice(0, MAX_FILES),
  };
}

function connectorState(input: {
  connected: boolean;
  selected: boolean;
  used: boolean;
  allowedByTool: boolean;
  blocked: boolean;
}): TaskAccessCapabilityState {
  if (input.used) return "used";
  if (!input.connected) return "unavailable";
  if (input.blocked) return "blocked";
  if (input.selected || input.allowedByTool) return "allowed";
  return "available";
}

export function deriveTaskAccessSummary(input: {
  task: Task;
  workspace: Workspace | null | undefined;
  connectors: readonly AvailableTaskConnector[];
  events: readonly TaskEvent[];
  policy?: TaskAccessPolicy;
  now?: number;
}): TaskAccessSummary {
  const { task, workspace } = input;
  const usage = deriveTaskAccessUsage(input.events, task);
  const usedTools = new Set(usage.usedToolNames);
  const allowedTools = new Set(
    input.policy ? input.policy.allowedTools || [] : task.agentConfig?.allowedTools || [],
  );
  const blockedTools = new Set(
    input.policy ? input.policy.blockedTools || [] : task.agentConfig?.toolRestrictions || [],
  );
  const mentions = task.agentConfig?.integrationMentions || [];
  const selectedConnectorIds = new Set<string>(input.policy?.connectorIds || []);
  const summaries: TaskAccessConnector[] = [];
  const matchedMentions = new Set<string>();

  for (const connector of input.connectors.slice(0, MAX_CONNECTORS)) {
    const matchingMentions = mentions.filter((mention) =>
      mentionMatchesConnector(mention, connector),
    );
    matchingMentions.forEach((mention) => {
      matchedMentions.add(mention.id);
      if (!input.policy) selectedConnectorIds.add(connector.id);
    });
    const connectorTools = connector.tools.slice(0, MAX_TOOLS);
    const used = connectorTools.some((tool) => usedTools.has(tool));
    const allowedByTool = connectorTools.some((tool) => allowedTools.has(tool));
    const allToolsBlocked =
      connectorTools.length > 0 && connectorTools.every((tool) => blockedTools.has(tool));
    const outsideAllowList =
      allowedTools.size > 0 &&
      connectorTools.length > 0 &&
      connectorTools.every((tool) => !allowedTools.has(tool));
    const selected =
      (!input.policy && matchingMentions.length > 0) ||
      selectedConnectorIds.has(connector.id) ||
      selectedConnectorIds.has(normalizeIdentity(connector.name));
    const networkBlocked = selected && workspace?.permissions.network === false;
    const connected = connector.status === "connected";
    const state = connectorState({
      connected,
      selected,
      used,
      allowedByTool,
      blocked: networkBlocked || allToolsBlocked || outsideAllowList,
    });
    let reason: string | undefined;
    let reasonCode: TaskAccessConnector["reasonCode"];
    if (used && !connected) {
      reason = "Used earlier; connector is now disconnected";
      reasonCode = "used_disconnected";
    } else if (!connected) {
      reason = "Connector is not connected";
      reasonCode = "disconnected";
    } else if (networkBlocked) {
      reason = "Network access is blocked by the workspace policy";
      reasonCode = "network_blocked";
    } else if (allToolsBlocked) {
      reason = "All connector tools are blocked for this task";
      reasonCode = "tools_blocked";
    } else if (outsideAllowList) {
      reason = "Connector tools are outside this task's tool allow-list";
      reasonCode = "outside_allowlist";
    } else if (state === "available") {
      reason = "Connected globally; not selected for this task";
      reasonCode = "available_not_selected";
    }

    summaries.push({
      id: connector.id,
      label: connector.name,
      iconKey: connector.icon,
      state,
      toolNames: connectorTools,
      reason,
      reasonCode,
    });
  }

  for (const mention of mentions) {
    if (matchedMentions.has(mention.id) || summaries.length >= MAX_CONNECTORS) continue;
    selectedConnectorIds.add(mention.id);
    const used = mention.tools.some((tool) => usedTools.has(tool));
    const blocked =
      workspace?.permissions.network === false ||
      (mention.tools.length > 0 && mention.tools.every((tool) => blockedTools.has(tool)));
    const unavailable = true;
    summaries.push({
      id: mention.id,
      label: mention.label,
      iconKey: mention.iconKey,
      state: used ? "used" : unavailable ? "unavailable" : blocked ? "blocked" : "allowed",
      toolNames: mention.tools.slice(0, MAX_TOOLS),
      reason: unavailable
        ? "Selected for this task, but the connector is not currently available"
        : blocked
          ? "Selected capability is blocked by the current workspace policy"
          : undefined,
      reasonCode: unavailable
        ? "selected_unavailable"
        : blocked
          ? "selected_blocked"
          : undefined,
    });
  }

  const workspaceScopes =
    input.policy?.workspaceScopes ||
    (workspace && (workspace.permissions.read || workspace.permissions.write)
      ? [
          {
            workspaceId: workspace.id,
            rootPath: workspace.path,
            access: workspace.permissions.write ? ("write" as const) : ("read" as const),
            primary: true,
          },
        ]
      : []);

  return {
    policy: input.policy
      ? { ...input.policy, workspaceScopes }
      : {
          taskId: task.id,
          revision: 0,
          connectorIds: Array.from(selectedConnectorIds).slice(0, MAX_CONNECTORS),
          workspaceScopes,
          allowedTools: task.agentConfig?.allowedTools?.slice(0, MAX_TOOLS),
          blockedTools: task.agentConfig?.toolRestrictions?.slice(0, MAX_TOOLS),
          permissionMode: task.agentConfig?.permissionMode,
          shellAccess: task.agentConfig?.shellAccess ?? workspace?.permissions.shell ?? false,
          updatedAt: task.updatedAt || input.now || Date.now(),
        },
    connectors: summaries,
    ...usage,
  };
}
