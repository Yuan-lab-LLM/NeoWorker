import { useSyncExternalStore } from "react";
import type { AgentBuilderPlan } from "../../shared/types";

export type BuilderStage = "idle" | "designing" | "choosing" | "creating" | "created";

export type SimpleAgentBuilderSession = {
  agentName: string;
  prompt: string;
  plan: AgentBuilderPlan | null;
  stage: BuilderStage;
  createdName: string;
  error: string | null;
};

const INITIAL_SIMPLE_AGENT_BUILDER_SESSION: SimpleAgentBuilderSession = {
  agentName: "",
  prompt: "",
  plan: null,
  stage: "idle",
  createdName: "",
  error: null,
};

let builderSession = INITIAL_SIMPLE_AGENT_BUILDER_SESSION;
const listeners = new Set<() => void>();

function emitBuilderSessionChange(): void {
  for (const listener of listeners) listener();
}

export function getSimpleAgentBuilderSession(): SimpleAgentBuilderSession {
  return builderSession;
}

export function subscribeSimpleAgentBuilderSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function updateSimpleAgentBuilderSession(
  patch:
    | Partial<SimpleAgentBuilderSession>
    | ((current: SimpleAgentBuilderSession) => Partial<SimpleAgentBuilderSession>),
): void {
  const nextPatch = typeof patch === "function" ? patch(builderSession) : patch;
  const nextSession = { ...builderSession, ...nextPatch };
  if (
    Object.keys(nextPatch).every(
      (key) =>
        nextSession[key as keyof SimpleAgentBuilderSession] ===
        builderSession[key as keyof SimpleAgentBuilderSession],
    )
  ) {
    return;
  }
  builderSession = nextSession;
  emitBuilderSessionChange();
}

export function resetSimpleAgentBuilderSession(): void {
  builderSession = { ...INITIAL_SIMPLE_AGENT_BUILDER_SESSION };
  emitBuilderSessionChange();
}

export function useSimpleAgentBuilderSession(): SimpleAgentBuilderSession {
  return useSyncExternalStore(
    subscribeSimpleAgentBuilderSession,
    getSimpleAgentBuilderSession,
    getSimpleAgentBuilderSession,
  );
}
