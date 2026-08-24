/**
 * Tests for context-mode-detector
 */

import { describe, it, expect } from "vitest";
import { detectContextMode } from "../context-mode-detector";

describe("detectContextMode", () => {
  it("should return planning when conversationMode is think", () => {
    expect(detectContextMode("", "think")).toBe("planning");
    expect(detectContextMode("fix the bug", "think")).toBe("planning");
  });

  it("should return all when prompt is empty and no conversation mode", () => {
    expect(detectContextMode("")).toBe("all");
    expect(detectContextMode("   ")).toBe("all");
  });

  it("should detect coding mode from keywords", () => {
    expect(detectContextMode("fix the bug in the function")).toBe("coding");
    expect(detectContextMode("implement a new API endpoint")).toBe("coding");
    expect(detectContextMode("refactor this code")).toBe("coding");
  });

  it("should detect writing mode from keywords", () => {
    expect(detectContextMode("write a draft email")).toBe("writing");
    expect(detectContextMode("help me edit this document")).toBe("writing");
  });

  it("should detect research mode from keywords", () => {
    expect(detectContextMode("research how does React work")).toBe("research");
    expect(detectContextMode("find and compare options")).toBe("research");
  });

  it("should detect planning mode from keywords", () => {
    expect(detectContextMode("plan the approach for this project")).toBe("planning");
    expect(detectContextMode("break down the task into steps")).toBe("planning");
  });

  it("should return chat when conversationMode is chat and low keyword scores", () => {
    expect(detectContextMode("hello how are you", "chat")).toBe("chat");
  });

  it("should return all when scores are below threshold", () => {
    expect(detectContextMode("hi")).toBe("all");
  });
});
