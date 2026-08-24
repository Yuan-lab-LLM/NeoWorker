import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomSkill } from "../../../shared/types";
import type { LoadedPlugin, PluginManifest } from "../types";

const mocks = vi.hoisted(() => ({
  discoverPlugins: vi.fn(),
  loadPlugin: vi.fn(),
  isPackAllowed: vi.fn(),
  isPackRequired: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
  unregisterPluginSkills: vi.fn(),
  secureInitialized: false,
  strictPolicies: undefined as any,
  securePayload: undefined as
    | { packs?: Record<string, boolean>; skills?: Record<string, Record<string, boolean>> }
    | undefined,
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/tmp/neoworker-registry-test"),
  },
}));

vi.mock("../loader", () => ({
  discoverPlugins: mocks.discoverPlugins,
  loadPlugin: mocks.loadPlugin,
  getPluginDataPath: (pluginName: string) => `/tmp/neoworker-registry-test/${pluginName}`,
  isPluginCompatible: () => true,
}));

vi.mock("../../admin/policies", () => ({
  isPackAllowed: mocks.isPackAllowed,
  isPackRequired: mocks.isPackRequired,
  loadPoliciesStrict: () => mocks.strictPolicies,
}));

vi.mock("../../agent/custom-skill-loader", () => ({
  getCustomSkillLoader: () => ({
    registerPluginSkill: vi.fn(),
    unregisterPluginSkills: mocks.unregisterPluginSkills,
  }),
}));

vi.mock("../../database/SecureSettingsRepository", () => ({
  SecureSettingsRepository: {
    isInitialized: () => mocks.secureInitialized,
    getInstance: () => ({
      load: () => mocks.securePayload,
      save: (_category: string, payload: object) => {
        mocks.securePayload = payload as typeof mocks.securePayload;
      },
    }),
  },
}));

vi.mock("../../utils/user-data-dir", () => ({
  getUserDataDir: () => "/tmp/neoworker-registry-test",
}));

function makeSkill(overrides: Partial<CustomSkill> = {}): CustomSkill {
  return {
    id: "smb-plan-payroll",
    name: "Plan Payroll",
    description: "Plan payroll",
    icon: "$",
    prompt: "Plan payroll",
    enabled: true,
    ...overrides,
  };
}

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: "smb-complete",
    displayName: "SMB Complete",
    version: "0.1.0",
    description: "Small business workflows",
    type: "pack",
    skills: [makeSkill()],
    ...overrides,
  };
}

function makeLoadedPlugin(manifest = makeManifest()): LoadedPlugin {
  return {
    manifest,
    instance: {
      register: mocks.register,
      unregister: mocks.unregister,
    },
    path: "/tmp/smb-complete",
    state: "loaded",
    loadedAt: new Date(),
  };
}

async function loadRegistry() {
  vi.resetModules();
  const { PluginRegistry } = await import("../registry");
  return PluginRegistry.getInstance();
}

describe("PluginRegistry pack runtime state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secureInitialized = false;
    mocks.strictPolicies = {
      version: 1,
      updatedAt: new Date().toISOString(),
      packs: { allowed: [], blocked: [], required: [] },
      connectors: { blocked: [] },
      agents: { maxHeartbeatFrequencySec: 60, maxConcurrentAgents: 10 },
      everydayAgent: {
        blocked: false,
        blockedBundles: [],
        forceReviewOnly: false,
        maxHeartbeatCadenceMinutes: 60,
        maxConcurrentBackgroundWork: 1,
        activeHours: { enabled: false, windows: [] },
      },
      runtime: {
        allowedPermissionModes: [],
        allowedSandboxTypes: ["macos", "docker"],
        requireSandboxForShell: false,
        allowUnsandboxedShell: false,
        network: {
          defaultAction: "allow",
          allowedDomains: [],
          blockedDomains: [],
          allowShellNetwork: false,
        },
        autoReview: { enabled: true },
        telemetry: { enabled: false },
      },
      general: {
        allowCustomPacks: true,
        allowGitInstall: true,
        allowUrlInstall: true,
      },
    };
    mocks.securePayload = undefined;
    mocks.isPackAllowed.mockReturnValue(true);
    mocks.isPackRequired.mockReturnValue(false);
    mocks.discoverPlugins.mockResolvedValue([
      { path: "/tmp/smb-complete", manifest: makeManifest(), securityReport: undefined },
    ]);
    mocks.loadPlugin.mockResolvedValue({
      success: true,
      plugin: makeLoadedPlugin(),
    });
  });

  it("does not register runtime content for admin-blocked packs", async () => {
    mocks.isPackAllowed.mockReturnValue(false);
    const registry = await loadRegistry();

    await registry.initialize();

    expect(mocks.register).not.toHaveBeenCalled();
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });

  it("does not load script entrypoints for admin-blocked packs", async () => {
    mocks.isPackAllowed.mockReturnValue(false);
    mocks.discoverPlugins.mockResolvedValue([
      {
        path: "/tmp/smb-complete",
        manifest: makeManifest({ main: "index.js" }),
        securityReport: undefined,
      },
    ]);
    const registry = await loadRegistry();

    await registry.initialize();

    expect(mocks.loadPlugin).not.toHaveBeenCalled();
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });

  it("does not load script entrypoints for user-disabled packs", async () => {
    mocks.secureInitialized = true;
    mocks.securePayload = { packs: { "smb-complete": false } };
    mocks.discoverPlugins.mockResolvedValue([
      {
        path: "/tmp/smb-complete",
        manifest: makeManifest({ main: "index.js" }),
        securityReport: undefined,
      },
    ]);
    const registry = await loadRegistry();

    await registry.initialize();

    expect(mocks.loadPlugin).not.toHaveBeenCalled();
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });

  it("does not load pack runtime code when policies fail to load", async () => {
    mocks.strictPolicies = null;
    mocks.discoverPlugins.mockResolvedValue([
      {
        path: "/tmp/smb-complete",
        manifest: makeManifest({ main: "index.js" }),
        securityReport: undefined,
      },
    ]);
    const registry = await loadRegistry();

    await registry.initialize();

    expect(mocks.loadPlugin).not.toHaveBeenCalled();
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });

  it("removes runtime registrations when a loaded pack becomes policy-blocked", async () => {
    const registry = await loadRegistry();
    await registry.initialize();
    expect(registry.getPlugin("smb-complete")?.state).toBe("registered");

    mocks.isPackAllowed.mockReturnValue(false);
    await registry.reconcilePackRuntimeState();

    expect(mocks.unregisterPluginSkills).toHaveBeenCalledWith("smb-complete");
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });

  it("leaves runtime state unchanged when policy reconciliation cannot load policies", async () => {
    const registry = await loadRegistry();
    await registry.initialize();
    mocks.strictPolicies = null;

    await registry.reconcilePackRuntimeState();

    expect(mocks.unregisterPluginSkills).not.toHaveBeenCalled();
    expect(registry.getPlugin("smb-complete")?.state).toBe("registered");
  });

  it("cleans partial tool registrations when script registration throws", async () => {
    mocks.loadPlugin.mockResolvedValueOnce({
      success: true,
      plugin: {
        ...makeLoadedPlugin(),
        instance: {
          register: vi.fn(async (api: { registerTool: (tool: unknown) => void }) => {
            api.registerTool({
              name: "leaky-tool",
              description: "Should be removed after failure",
              inputSchema: {},
              handler: async () => ({}),
            });
            throw new Error("boom");
          }),
        },
      },
    });
    const registry = await loadRegistry();

    await registry.initialize();

    expect(registry.getPlugin("smb-complete")?.state).toBe("error");
    expect(registry.getTools().has("smb-complete:leaky-tool")).toBe(false);
  });

  it("applies saved skill toggles to disabled pack manifests", async () => {
    mocks.secureInitialized = true;
    mocks.securePayload = {
      packs: { "smb-complete": false },
      skills: { "smb-complete": { "smb-plan-payroll": false } },
    };
    const registry = await loadRegistry();

    await registry.initialize();

    const skill = registry.getPlugin("smb-complete")?.manifest.skills?.[0];
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
    expect(skill?.enabled).toBe(false);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("throws on reload failure and keeps the pack visible but disabled", async () => {
    const registry = await loadRegistry();
    await registry.initialize();

    mocks.loadPlugin.mockResolvedValueOnce({
      success: false,
      error: "missing manifest",
    });

    await expect(registry.reloadPlugin("smb-complete")).rejects.toThrow(
      "Failed to reload plugin smb-complete",
    );
    expect(registry.getPlugin("smb-complete")?.state).toBe("disabled");
  });
});
