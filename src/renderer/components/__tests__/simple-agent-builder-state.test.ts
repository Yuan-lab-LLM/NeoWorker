import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSimpleAgentBuilderSession,
  resetSimpleAgentBuilderSession,
  subscribeSimpleAgentBuilderSession,
  updateSimpleAgentBuilderSession,
} from "../simple-agent-builder-state";

describe("simple agent builder session", () => {
  afterEach(() => resetSimpleAgentBuilderSession());

  it("retains active creation state independently from the mounted page", () => {
    updateSimpleAgentBuilderSession({
      agentName: "产品经理-3",
      prompt: "AI 软件产品规划",
      stage: "designing",
    });

    expect(getSimpleAgentBuilderSession()).toMatchObject({
      agentName: "产品经理-3",
      prompt: "AI 软件产品规划",
      stage: "designing",
    });
  });

  it("notifies a newly mounted subscriber as background creation advances", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSimpleAgentBuilderSession(listener);

    updateSimpleAgentBuilderSession({ stage: "creating" });
    updateSimpleAgentBuilderSession({
      stage: "created",
      createdName: "产品经理-3",
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSimpleAgentBuilderSession()).toMatchObject({
      stage: "created",
      createdName: "产品经理-3",
    });
    unsubscribe();
  });
});
