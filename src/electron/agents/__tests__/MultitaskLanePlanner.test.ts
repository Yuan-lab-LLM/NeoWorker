import { describe, expect, it, vi } from "vitest";
import { MultitaskLanePlanner } from "../MultitaskLanePlanner";
import type { LLMProvider } from "../../agent/llm/types";

describe("MultitaskLanePlanner", () => {
  it("uses explicit bullet lanes before calling the LLM", async () => {
    const provider: LLMProvider = {
      type: "openai",
      createMessage: vi.fn(),
      testConnection: vi.fn(),
    };

    const lanes = await MultitaskLanePlanner.plan(
      "- Frontend - implement the UI\n- Backend - add the API",
      { requestedLaneCount: 4, provider, modelId: "gpt-test" },
    );

    expect(provider.createMessage).not.toHaveBeenCalled();
    expect(lanes).toEqual([
      { title: "Frontend", description: "implement the UI" },
      { title: "Backend", description: "add the API" },
    ]);
  });

  it("uses LLM JSON lanes when no explicit list is present", async () => {
    const provider: LLMProvider = {
      type: "openai",
      createMessage: vi.fn(async () => ({
        id: "msg",
        content: [
          {
            type: "text",
            text: JSON.stringify([
              { title: "Inspect", description: "Inspect the current flow" },
              { title: "Implement", description: "Make the change" },
            ]),
          },
        ],
      })),
      testConnection: vi.fn(),
    };

    const lanes = await MultitaskLanePlanner.plan("fix the onboarding flow", {
      requestedLaneCount: 2,
      provider,
      modelId: "gpt-test",
    });

    expect(provider.createMessage).toHaveBeenCalledOnce();
    expect(lanes).toEqual([
      { title: "Inspect", description: "Inspect the current flow" },
      { title: "Implement", description: "Make the change" },
    ]);
  });

  it("falls back to bounded deterministic lanes when LLM planning fails", async () => {
    const provider: LLMProvider = {
      type: "openai",
      createMessage: vi.fn(async () => {
        throw new Error("offline");
      }),
      testConnection: vi.fn(),
    };

    const lanes = await MultitaskLanePlanner.plan("audit the repo", {
      requestedLaneCount: 3,
      provider,
      modelId: "gpt-test",
    });

    expect(lanes).toHaveLength(3);
    expect(lanes[0].title).toBe("Context and Scope");
  });
});
