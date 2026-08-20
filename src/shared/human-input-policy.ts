import type { AgentConfig, ExecutionMode, HumanInputPolicy } from "./types";

const HUMAN_INPUT_POLICIES = new Set<HumanInputPolicy>([
  "none",
  "hard_blockers",
  "structured_plan",
  "legacy_interactive",
]);

export function isHumanInputPolicy(value: unknown): value is HumanInputPolicy {
  return typeof value === "string" && HUMAN_INPUT_POLICIES.has(value as HumanInputPolicy);
}

export function resolveHumanInputPolicy(input: {
  agentConfig?: Pick<
    AgentConfig,
    "allowUserInput" | "humanInputPolicy" | "executionMode" | "autonomousMode"
  >;
  executionMode?: ExecutionMode;
}): HumanInputPolicy {
  const agentConfig = input.agentConfig;
  if (isHumanInputPolicy(agentConfig?.humanInputPolicy)) {
    return agentConfig.humanInputPolicy;
  }

  if (agentConfig?.allowUserInput === false) {
    return "none";
  }

  const executionMode = input.executionMode ?? agentConfig?.executionMode ?? "execute";
  if (executionMode === "plan" || executionMode === "debug") {
    return "structured_plan";
  }

  return "hard_blockers";
}

export function allowsStructuredHumanInput(policy: HumanInputPolicy): boolean {
  return policy === "structured_plan" || policy === "legacy_interactive";
}

export function allowsClarifyingHumanInput(policy: HumanInputPolicy): boolean {
  return policy === "structured_plan" || policy === "legacy_interactive";
}

export function allowsHardBlockerHumanInput(policy: HumanInputPolicy): boolean {
  return policy !== "none";
}
