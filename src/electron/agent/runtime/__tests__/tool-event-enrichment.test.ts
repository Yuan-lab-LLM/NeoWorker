import { describe, expect, it } from "vitest";
import { enrichToolEventPayload } from "../tool-event-enrichment";

describe("enrichToolEventPayload", () => {
  it("adds a structured envelope to tool results", () => {
    const payload = enrichToolEventPayload("tool_result", {
      tool: "write_file",
      result: { path: "src/example.ts", success: true },
    });

    expect(payload.envelope).toEqual(
      expect.objectContaining({
        toolName: "write_file",
        status: "success",
      }),
    );
  });

  it("preserves an existing envelope", () => {
    const payload = enrichToolEventPayload("tool_error", {
      tool: "run_command",
      error: "boom",
      envelope: { toolName: "run_command", status: "error" },
    });

    expect(payload.envelope).toEqual({ toolName: "run_command", status: "error" });
  });
});
