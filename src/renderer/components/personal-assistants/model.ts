import type {
  ManagedAgent,
  ManagedAgentVersion,
  ManagedAgentStudioConfig,
  ManagedEnvironment,
  ManagedSession,
} from "../../../shared/types";

export type Assistant = { agent: ManagedAgent; version: ManagedAgentVersion };
export type AssistantKind = NonNullable<ManagedAgentStudioConfig["personalAssistant"]>["kind"];
export function assistantStudio(version: ManagedAgentVersion): ManagedAgentStudioConfig {
  return (version.metadata?.studio as ManagedAgentStudioConfig | undefined) || {};
}
export function assistantProjects(environments: ManagedEnvironment[], agentId: string) {
  return environments.filter(
    (item) => item.status === "active" && item.config.personalAssistantId === agentId,
  );
}
export function assistantConversations(
  sessions: ManagedSession[],
  agentId: string,
  environmentId?: string,
) {
  return sessions
    .filter(
      (item) =>
        item.agentId === agentId &&
        item.backingTaskId &&
        (!environmentId || item.environmentId === environmentId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}
export function preferenceLines(text: string) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}
