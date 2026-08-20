import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "../../../../shared/types";
import { GuardrailManager } from "../../../guardrails/guardrail-manager";
import { ScrapingTools } from "../scraping-tools";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("../../../scraping/scraping-settings", () => ({
  ScrapingSettingsManager: {
    isEnabled: vi.fn(() => true),
    loadSettings: vi.fn(() => ({
      defaultFetcher: "default",
      headless: true,
      timeout: 30000,
      maxContentLength: 100000,
      pythonPath: "python3",
      proxy: { enabled: false, url: "" },
    })),
  },
}));

const workspace: Workspace = {
  id: "ws-1",
  name: "Test",
  path: "/tmp/workspace",
  permissions: { read: true, write: true, delete: false, network: true, shell: false },
  createdAt: new Date().toISOString(),
  lastAccessed: new Date().toISOString(),
};

describe("ScrapingTools network policy", () => {
  let tools: ScrapingTools;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(GuardrailManager, "isDomainAllowed").mockImplementation((url: string) => {
      return !url.includes("blocked.example");
    });
    tools = new ScrapingTools(workspace, { logEvent: vi.fn() } as Any, "task-1");
  });

  it("rejects scrape_page destinations before starting the bridge", async () => {
    await expect(
      tools.executeTool("scrape_page", { url: "https://blocked.example/private" }),
    ).rejects.toThrow("Domain not allowed");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects scrape_session step URLs before starting the bridge", async () => {
    await expect(
      tools.executeTool("scrape_session", {
        steps: [{ action: "navigate", url: "https://blocked.example/private" }],
      }),
    ).rejects.toThrow("Domain not allowed");
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
