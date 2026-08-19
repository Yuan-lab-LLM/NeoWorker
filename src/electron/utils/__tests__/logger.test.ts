import { beforeEach, describe, expect, it, vi } from "vitest";

describe("createLogger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.NEOWORKER_LOG_LEVEL;
    delete process.env.NEOWORKER_LOG_COMPONENTS;
  });

  it("suppresses debug logs at default info level", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = await import("../logger");
    const logger = createLogger("Test");

    logger.debug("hidden");
    logger.info("shown");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[Test] shown");
  });

  it("emits debug logs when NEOWORKER_LOG_LEVEL=debug", async () => {
    process.env.NEOWORKER_LOG_LEVEL = "debug";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = await import("../logger");
    const logger = createLogger("MCPClientManager");

    logger.debug("debug line");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[MCPClientManager] debug line");
  });

  it("filters by NEOWORKER_LOG_COMPONENTS", async () => {
    process.env.NEOWORKER_LOG_LEVEL = "debug";
    process.env.NEOWORKER_LOG_COMPONENTS = "mcpclientmanager";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { createLogger } = await import("../logger");
    const mcpLogger = createLogger("MCPClientManager");
    const mainLogger = createLogger("Main");

    mcpLogger.info("allowed");
    mainLogger.info("blocked");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("[MCPClientManager] allowed");
  });
});
