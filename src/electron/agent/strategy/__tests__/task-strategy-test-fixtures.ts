import type { IntentRoute } from "../IntentRouter";

export function makeRoute(overrides: Partial<IntentRoute> = {}): IntentRoute {
  return {
    intent: "execution",
    confidence: 0.8,
    conversationMode: "task",
    answerFirst: false,
    signals: [],
    complexity: "low",
    domain: "code",
    ...overrides,
  };
}
