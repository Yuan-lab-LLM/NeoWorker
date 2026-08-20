import { describe, expect, it } from "vitest";

import {
  resolveDefaultRuntimeToolSchedulerSpec,
  resolveToolExecutionScopeKeys,
} from "../runtime-tool-scheduler-spec";

describe("runtime-tool-scheduler-spec", () => {
  it("marks mcp tools fail-closed as serial by default", () => {
    const spec = resolveDefaultRuntimeToolSchedulerSpec({
      toolName: "mcp_demo_read_file",
      input: {},
    });

    expect(spec.concurrencyClass).toBe("serial_only");
  });

  it("marks action tools fail-closed as serial by default", () => {
    const spec = resolveDefaultRuntimeToolSchedulerSpec({
      toolName: "gmail_action",
      input: { action: "list_messages" },
    });

    expect(spec.concurrencyClass).toBe("serial_only");
  });

  it("derives workspace path scope keys for file writes", () => {
    const spec = resolveDefaultRuntimeToolSchedulerSpec({
      toolName: "write_file",
      input: { path: "src/index.ts" },
    });

    const scopes = resolveToolExecutionScopeKeys({
      spec,
      toolName: "write_file",
      input: { path: "src/index.ts" },
    });

    expect(scopes).toEqual([{ kind: "workspace_path", key: "src/index.ts" }]);
  });

  it("derives browser session scope keys", () => {
    const spec = resolveDefaultRuntimeToolSchedulerSpec({
      toolName: "browser_get_content",
      input: { session_id: "browser-1" },
    });

    const scopes = resolveToolExecutionScopeKeys({
      spec,
      toolName: "browser_get_content",
      input: { session_id: "browser-1" },
    });

    expect(scopes).toEqual([{ kind: "browser_session", key: "browser-1" }]);
  });
});
