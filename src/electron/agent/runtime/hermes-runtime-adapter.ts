import {
  HermesAcpClient, HermesAcpError,
  type AcpObject, type AcpRequestContext, type HermesAcpClientOptions,
  type HermesAcpMcpServer,
} from "./hermes-acp-client";
import { HermesPermissionBridge, type HermesPermissionHandler } from "./hermes-permission-bridge";
import { HermesToolHostMcpServer, type HermesToolHostMcpOptions } from "./hermes-tool-host-mcp";

export interface HermesSessionCheckpoint {
  schema: "neoworker_hermes_acp_v1";
  sessionId: string;
  cwd: string;
  agentVersion: string;
  /** Missing means a legacy session using Hermes-native tools. */
  toolOwnership?: "neoworker" | "hermes";
  /** Host-side progress used to make recovery decisions without replaying effects. */
  toolProgress?: HermesToolProgressCheckpoint;
  /** Last NeoWorker task-event sequence observed while persisting this checkpoint. */
  logSequence?: number;
}

export interface HermesToolProgressCheckpoint {
  activeToolCallIds: string[];
  completedToolCallIds: string[];
  failedToolCallIds: string[];
  unknownToolCallIds: string[];
  lastToolCallId?: string;
}

export interface HermesRetryConfirmationRequest {
  sessionId: string;
  unknownToolCallIds: string[];
  checkpoint: HermesSessionCheckpoint;
}
export interface HermesRuntimeOptions extends HermesAcpClientOptions {
  checkpoint?: HermesSessionCheckpoint;
  onCheckpoint?: (checkpoint: HermesSessionCheckpoint) => Promise<void>;
  getLogSequence?: () => number | undefined;
  onUpdate?: (update: AcpObject) => void;
  onPermissionRequest?: HermesPermissionHandler;
  permissionTimeoutMs?: number;
  onRetryConfirmation?: (
    request: HermesRetryConfirmationRequest,
    context: AcpRequestContext,
  ) => Promise<boolean>;
  onRequest?: (method: string, params: AcpObject, context: AcpRequestContext) => Promise<unknown>;
  /**
   * Optional task-scoped NeoWorker Tool Host exposed to Hermes through MCP.
   * The caller remains responsible for disabling Hermes native tools when
   * selecting this mode; otherwise duplicate native and host-owned tools may
   * be offered by the ACP runtime.
   */
  hostToolBridge?: HermesToolHostMcpOptions;
}
export interface HermesPromptResult {
  assistantText: string;
  stopReason: string;
  sessionId: string;
}

// Keep a single task's accumulated assistant transcript bounded. Individual
// ACP frames are already capped by HermesAcpClient, but a long-running session
// can otherwise append an unbounded number of valid chunks in the Electron
// process.
const MAX_ASSISTANT_TEXT_CHARS = 2_000_000;
const ASSISTANT_TEXT_TRUNCATION_MARKER = "\n[Hermes response truncated by NeoWorker]\n";

/**
 * A real Hermes ACP session, independent of NeoWorker's TurnKernel.
 * The production executor owns the host-side policy boundary; this adapter keeps
 * Hermes protocol details isolated from Electron business code.
 */
export class HermesRuntimeAdapter {
  private readonly client = new HermesAcpClient();
  private sessionCheckpoint?: HermesSessionCheckpoint;
  private readonly activeToolCallIds = new Set<string>();
  private readonly completedToolCallIds = new Set<string>();
  private readonly failedToolCallIds = new Set<string>();
  private readonly unknownToolCallIds = new Set<string>();
  private toolProgressRevision = 0;
  private lastToolCallId?: string;
  private checkpointWrite: Promise<void> = Promise.resolve();
  private activePrompt?: Promise<HermesPromptResult>;
  private text = "";
  private lastToolBoundary = 0;
  private sawToolActivity = false;
  private acceptingUpdates = false;
  private connected = false;
  private connecting?: Promise<HermesSessionCheckpoint>;
  private readonly permissions: HermesPermissionBridge;
  private cancelRequested = false;
  private paused = false;
  private hostToolServer?: HermesToolHostMcpServer;
  private hostToolServerConfig?: HermesAcpMcpServer;

  constructor(private readonly options: HermesRuntimeOptions) {
    this.sessionCheckpoint = options.checkpoint;
    this.restoreToolProgress(options.checkpoint?.toolProgress);
    this.permissions = new HermesPermissionBridge(options.onPermissionRequest, options.permissionTimeoutMs);
    this.client.onRequest = (method, params, context) => {
      if (method === "session/request_permission") {
        return this.permissions.request(params, this.acceptingUpdates ? this.sessionCheckpoint?.sessionId : undefined, context);
      }
      if (options.onRequest) return options.onRequest(method, params, context);
      return Promise.reject(new HermesAcpError("Unsupported client method", -32601));
    };
    this.client.onNotification = ({ method, params }) => {
      if (method !== "session/update" || params.sessionId !== this.sessionCheckpoint?.sessionId) return;
      const update = params.update;
      if (!update || typeof update !== "object" || Array.isArray(update)) return;
      const value = update as AcpObject;
      const sessionUpdate = String(value.sessionUpdate || "");
      if (
        sessionUpdate === "tool_call" ||
        sessionUpdate === "tool_call_update" ||
        sessionUpdate === "tool_result"
      ) {
        this.markToolBoundary();
      }
      if (this.acceptingUpdates && value.sessionUpdate === "agent_message_chunk") {
        const content = value.content as AcpObject | undefined;
        if (content?.type === "text" && typeof content.text === "string") {
          if (this.text.length < MAX_ASSISTANT_TEXT_CHARS) {
            const remaining = MAX_ASSISTANT_TEXT_CHARS - this.text.length;
            this.text += content.text.slice(0, remaining);
            if (content.text.length > remaining) this.text += ASSISTANT_TEXT_TRUNCATION_MARKER;
          }
        }
      }
      if (this.acceptingUpdates || !["agent_thought_chunk", "agent_message_chunk"].includes(sessionUpdate)) {
        this.options.onUpdate?.(value);
      }
    };
  }

  connect(): Promise<HermesSessionCheckpoint> {
    if (this.connected && this.sessionCheckpoint) return Promise.resolve(this.getCheckpoint()!);
    if (this.connecting) return this.connecting;
    this.connecting = this.open().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }

  /** Stable lifecycle alias used by the runtime adapter contract. */
  start(): Promise<HermesSessionCheckpoint> {
    return this.connect();
  }

  private async open(): Promise<HermesSessionCheckpoint> {
    try {
      if (this.options.hostToolBridge && !this.hostToolServer) {
        const bridge = this.options.hostToolBridge;
        this.hostToolServer = new HermesToolHostMcpServer({
          ...bridge,
          taskId: bridge.taskId,
          execute: async (input) => {
            this.markToolBoundary();
            this.updateToolProgress(input.toolCallId, "running");
            // Persist before dispatching the host operation. If persistence
            // fails, fail closed so a side effect is never started without a
            // recovery marker.
            await this.persistCheckpoint();
            const dispatchCheckpoint = this.getCheckpointPayload();
            try {
              const response = await bridge.execute({
                ...input,
                ...(dispatchCheckpoint ? { checkpoint: dispatchCheckpoint } : {}),
              });
              this.updateToolProgress(
                input.toolCallId,
                response.status === "success"
                  ? "completed"
                  : response.status === "cancelled"
                    ? "cancelled"
                    : "failed",
              );
              await this.persistCheckpoint();
              const responseCheckpoint = this.getCheckpointPayload();
              return {
                ...response,
                ...(responseCheckpoint ? { checkpoint: responseCheckpoint } : {}),
              };
            } catch (error) {
              // A transport/runtime rejection does not tell us whether a
              // side effect reached the host. Keep it in the checkpoint and
              // require explicit confirmation before retry().
              const code = String((error as { code?: unknown })?.code || "");
              this.updateToolProgress(
                input.toolCallId,
                code === "CANCELLED" ? "cancelled" : "unknown",
              );
              await this.persistCheckpoint();
              throw error;
            }
          },
        });
        this.hostToolServer.suspendToolCalls();
        const endpoint = await this.hostToolServer.start();
        this.hostToolServerConfig = {
          type: "http",
          name: "neoworker",
          url: endpoint.url,
          headers: endpoint.headers,
        };
      }
      const launchOptions = this.hostToolServerConfig
        ? {
            ...this.options,
            env: {
              ...this.options.env,
              // The MCP endpoint is task-local. Inherited HTTP proxies must
              // never route loopback tool calls through an external proxy.
              NO_PROXY: this.loopbackNoProxy("NO_PROXY"),
              no_proxy: this.loopbackNoProxy("no_proxy"),
            },
          }
        : this.options;
      await this.client.start(launchOptions);
      const init = await this.client.initialize();
      if (init.protocolVersion !== 1) throw new Error("Unsupported Hermes ACP protocol version");
      const agentInfo = init.agentInfo as AcpObject | undefined;
      const agentVersion = String(agentInfo?.version ?? "unknown");
      if (this.sessionCheckpoint) {
        if (this.sessionCheckpoint.schema !== "neoworker_hermes_acp_v1" || this.sessionCheckpoint.cwd !== this.options.cwd) {
          throw new Error("Hermes checkpoint does not match this workspace");
        }
        const ownership = this.sessionCheckpoint.toolOwnership ?? "hermes";
        if (ownership !== (this.options.hostToolBridge ? "neoworker" : "hermes")) {
          throw new Error("Hermes checkpoint tool ownership does not match this runtime");
        }
        const caps = init.agentCapabilities as AcpObject | undefined;
        if (caps?.loadSession !== true) throw new Error("Hermes cannot restore sessions");
        await this.client.loadSession(this.sessionCheckpoint.sessionId, this.options.cwd, this.getMcpServers());
      } else {
        const session = await this.client.newSession(this.options.cwd, this.getMcpServers());
        if (typeof session.sessionId !== "string" || !session.sessionId) throw new Error("Hermes returned no session id");
        this.sessionCheckpoint = {
          schema: "neoworker_hermes_acp_v1", sessionId: session.sessionId,
          cwd: this.options.cwd, agentVersion,
          toolOwnership: this.options.hostToolBridge ? "neoworker" : "hermes",
        };
      }
      // Persist the stable Hermes session handle before a prompt can run tools.
      await this.persistCheckpoint();
      this.connected = true;
      return this.getCheckpoint()!;
    } catch (error) {
      await this.client.stop();
      await this.hostToolServer?.stop();
      this.hostToolServer = undefined;
      this.hostToolServerConfig = undefined;
      this.connected = false;
      throw error;
    }
  }

  prompt(text: string, signal?: AbortSignal): Promise<HermesPromptResult> {
    if (this.activePrompt) return Promise.reject(new HermesAcpError("A Hermes prompt is already running", "SESSION_BUSY"));
    const prePaused = this.paused;
    this.cancelRequested = prePaused;
    if (!prePaused) this.paused = false;
    const run = async () => {
      // An AbortSignal can fire while ACP is still connecting or while the
      // remote agent is waiting for a tool response.  Suspend the host before
      // the transport observes the abort so no late file/Shell call can start
      // after the caller has asked us to stop.
      let signalAborted = false;
      const onAbort = () => {
        signalAborted = true;
        this.cancelRequested = true;
        this.acceptingUpdates = false;
        this.permissions.cancelPending();
        this.hostToolServer?.suspendToolCalls();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      try {
        const checkpoint = await this.connect();
        if (signalAborted || signal?.aborted) {
          // Keep AbortSignal cancellation observable as a rejected prompt;
          // callers use the error code to distinguish it from pause(), whose
          // internal cancel intentionally resolves with stopReason=cancelled.
          throw new HermesAcpError("Hermes ACP prompt cancelled", "CANCELLED");
        }
        if (this.cancelRequested) {
          return { assistantText: "", stopReason: "cancelled", sessionId: checkpoint.sessionId };
        }
        this.hostToolServer?.resumeToolCalls();
        this.text = "";
        this.lastToolBoundary = 0;
        this.sawToolActivity = false;
        this.acceptingUpdates = true;
        const result = await this.client.prompt(checkpoint.sessionId, text, {
          timeoutMs: this.options.timeoutMs ?? 30 * 60_000,
          idleTimeoutMs: Math.min(this.options.timeoutMs ?? 300_000, 300_000),
          signal,
        });
        const meta = result._meta as { neoworker?: { runtimeError?: { code?: unknown; message?: unknown } } } | undefined;
        const runtimeError = meta?.neoworker?.runtimeError;
        if (runtimeError && typeof runtimeError.message === "string") {
          throw new HermesAcpError(
            runtimeError.message,
            typeof runtimeError.code === "string" ? runtimeError.code : "HERMES_RUNTIME_ERROR",
            runtimeError,
          );
        }
        if (typeof result.stopReason !== "string") throw new Error("Hermes prompt returned no stop reason");
        const assistantText = this.sawToolActivity
          ? this.text.slice(this.lastToolBoundary)
          : this.text;
        return {
          assistantText,
          stopReason: this.cancelRequested ? "cancelled" : result.stopReason,
          sessionId: checkpoint.sessionId,
        };
      } catch (error) {
        // Never resubmit an interrupted prompt automatically: tools may already
        // have produced side effects. The user can restore the existing session.
        await this.client.stop();
        this.connected = false;
        throw error;
      } finally {
        signal?.removeEventListener("abort", onAbort);
        // If a host callback ignored cancellation or the transport closed
        // before a structured result arrived, the side effect is unknown.
        // Preserve that fact for an explicit retry decision.
        if (this.activeToolCallIds.size > 0) {
          for (const toolCallId of this.activeToolCallIds) {
            this.updateToolProgress(toolCallId, this.paused ? "cancelled" : "unknown");
          }
          await this.persistCheckpoint().catch(() => undefined);
        }
        this.hostToolServer?.suspendToolCalls();
        this.acceptingUpdates = false;
        this.permissions.cancelPending();
      }
    };
    this.activePrompt = run().finally(() => { this.activePrompt = undefined; });
    return this.activePrompt;
  }

  async cancel(): Promise<void> {
    const active = this.activePrompt;
    if (!active) return;
    this.cancelRequested = true;
    this.acceptingUpdates = false;
    this.permissions.cancelPending();
    this.hostToolServer?.suspendToolCalls();
    // The deadline covers initialization too. Waiting for connect() outside
    // this race made Stop wait for the entire initialization timeout.
    const graceful = (async () => {
      if (this.connecting) await this.connecting.catch(() => undefined);
      this.hostToolServer?.suspendToolCalls();
      if (this.sessionCheckpoint) this.client.cancel(this.sessionCheckpoint.sessionId);
      await active.catch(() => undefined);
    })();
    let force: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        graceful,
        new Promise<void>((resolve) => {
          force = setTimeout(() => {
            void this.close().finally(resolve);
          }, 3000);
        }),
      ]);
    } finally {
      if (force) clearTimeout(force);
      // A cancelled Hermes process may still emit updates or initiate a late
      // MCP call. Resume the persisted session on a fresh transport.
      if (this.options.hostToolBridge) await this.close();
    }
  }

  /**
   * Pause at a safe protocol boundary. Hermes has no portable pause primitive,
   * so an active prompt is cancelled without discarding its persisted session;
   * resume() continues that session and never replays the interrupted request.
   */
  async pause(): Promise<void> {
    this.paused = true;
    await this.cancel();
  }

  async resume(prompt = "Continue the task from the last checkpoint. Do not repeat side effects whose result is unknown."): Promise<HermesPromptResult> {
    if (!this.paused) throw new HermesAcpError("Hermes session is not paused", "SESSION_NOT_PAUSED");
    // A process can be restarted while a host call is still marked active in
    // the persisted checkpoint. Treat that marker as an unknown side effect
    // and use the same confirmation gate as retry(), rather than silently
    // continuing a potentially duplicated operation.
    if (this.getUnknownToolCallIds().length > 0) {
      return this.retry(prompt);
    }
    this.paused = false;
    return this.prompt(prompt);
  }

  /**
   * Retry a failed or interrupted turn from the saved session. A transport
   * failure may have happened after a host side effect started, so unknown
   * calls require an explicit user decision before another turn is submitted.
   */
  async retry(
    prompt = "Retry the task from the last checkpoint. Inspect the current workspace and tool results first. Do not repeat any side effect whose result is unknown.",
    signal?: AbortSignal,
  ): Promise<HermesPromptResult> {
    const checkpoint = this.getCheckpoint();
    if (!checkpoint) {
      throw new HermesAcpError(
        "Cannot retry Hermes before a session checkpoint exists",
        "NO_CHECKPOINT",
      );
    }
    const unknownToolCallIds = this.getUnknownToolCallIds(checkpoint);
    if (unknownToolCallIds.length > 0) {
      if (signal?.aborted) {
        throw new HermesAcpError("Hermes retry cancelled", "CANCELLED");
      }
      const confirmationController = new AbortController();
      const abortConfirmation = () => confirmationController.abort(signal?.reason);
      signal?.addEventListener("abort", abortConfirmation, { once: true });
      try {
        const approved = await this.options.onRetryConfirmation?.(
          { sessionId: checkpoint.sessionId, unknownToolCallIds, checkpoint },
          { signal: confirmationController.signal },
        );
        if (!approved || confirmationController.signal.aborted) {
          throw new HermesAcpError(
            "Hermes retry requires confirmation because a previous side effect has an unknown result",
            "RETRY_CONFIRMATION_REQUIRED",
            { unknownToolCallIds },
          );
        }
      } finally {
        signal?.removeEventListener("abort", abortConfirmation);
      }
    }
    this.paused = false;
    return this.prompt(prompt, signal);
  }

  isPaused(): boolean {
    return this.paused;
  }

  getCheckpoint(): HermesSessionCheckpoint | undefined {
    return this.snapshotCheckpoint();
  }

  /**
   * Monotonic host-tool progress marker used by the executor to decide whether
   * a transient provider failure happened before any side effect was started.
   */
  getToolProgressRevision(): number {
    return this.toolProgressRevision;
  }

  /** Stable checkpoint accessor used by runtime integrations. */
  checkpoint(): HermesSessionCheckpoint | undefined {
    return this.getCheckpoint();
  }

  async close(): Promise<void> {
    this.cancelRequested = true;
    this.acceptingUpdates = false;
    this.permissions.cancelPending();
    const hostToolServer = this.hostToolServer;
    this.hostToolServer = undefined;
    this.hostToolServerConfig = undefined;
    this.connected = false;
    await Promise.allSettled([
      this.client.stop(),
      hostToolServer?.stop(),
    ]);
  }

  private getMcpServers(): HermesAcpMcpServer[] {
    const configured = Array.isArray(this.options.mcpServers) ? this.options.mcpServers : [];
    return this.hostToolServerConfig ? [...configured, this.hostToolServerConfig] : configured;
  }

  private restoreToolProgress(progress?: HermesToolProgressCheckpoint): void {
    if (!progress) return;
    for (const value of progress.activeToolCallIds || []) {
      if (typeof value === "string" && value) this.activeToolCallIds.add(value);
    }
    for (const value of progress.completedToolCallIds || []) {
      if (typeof value === "string" && value) this.completedToolCallIds.add(value);
    }
    for (const value of progress.failedToolCallIds || []) {
      if (typeof value === "string" && value) this.failedToolCallIds.add(value);
    }
    for (const value of progress.unknownToolCallIds || []) {
      if (typeof value === "string" && value) this.unknownToolCallIds.add(value);
    }
    this.lastToolCallId = typeof progress.lastToolCallId === "string"
      ? progress.lastToolCallId
      : undefined;
  }

  private getUnknownToolCallIds(
    checkpoint = this.getCheckpoint(),
  ): string[] {
    if (!checkpoint) return [];
    return Array.from(new Set([
      ...(checkpoint.toolProgress?.unknownToolCallIds ?? []),
      // A process can terminate while a call is still active. Treat that
      // persisted active marker as unknown on the next resume or retry.
      ...(checkpoint.toolProgress?.activeToolCallIds ?? []),
    ]));
  }

  private updateToolProgress(
    toolCallId: string,
    status: "running" | "completed" | "failed" | "unknown" | "cancelled",
  ): void {
    const normalized = toolCallId.trim();
    if (!normalized) return;
    this.toolProgressRevision += 1;
    this.lastToolCallId = normalized;
    this.activeToolCallIds.delete(normalized);
    this.completedToolCallIds.delete(normalized);
    this.failedToolCallIds.delete(normalized);
    this.unknownToolCallIds.delete(normalized);
    if (status === "running") this.activeToolCallIds.add(normalized);
    else if (status === "completed") this.completedToolCallIds.add(normalized);
    else if (status === "failed") this.failedToolCallIds.add(normalized);
    else if (status === "unknown") this.unknownToolCallIds.add(normalized);
  }

  private markToolBoundary(): void {
    this.sawToolActivity = true;
    this.lastToolBoundary = this.text.length;
  }

  private boundedToolCallIds(values: Set<string>): string[] {
    return Array.from(values).slice(-256);
  }

  private snapshotToolProgress(): HermesToolProgressCheckpoint | undefined {
    const hasProgress =
      this.activeToolCallIds.size > 0 ||
      this.completedToolCallIds.size > 0 ||
      this.failedToolCallIds.size > 0 ||
      this.unknownToolCallIds.size > 0 ||
      !!this.lastToolCallId;
    if (!hasProgress) return undefined;
    return {
      activeToolCallIds: this.boundedToolCallIds(this.activeToolCallIds),
      completedToolCallIds: this.boundedToolCallIds(this.completedToolCallIds),
      failedToolCallIds: this.boundedToolCallIds(this.failedToolCallIds),
      unknownToolCallIds: this.boundedToolCallIds(this.unknownToolCallIds),
      ...(this.lastToolCallId ? { lastToolCallId: this.lastToolCallId } : {}),
    };
  }

  private snapshotCheckpoint(): HermesSessionCheckpoint | undefined {
    if (!this.sessionCheckpoint) return undefined;
    const logSequence = this.options.getLogSequence?.();
    const toolProgress = this.snapshotToolProgress();
    return {
      ...this.sessionCheckpoint,
      ...(toolProgress ? { toolProgress } : {}),
      ...(Number.isFinite(logSequence)
        ? { logSequence: Math.max(0, Math.floor(logSequence as number)) }
        : {}),
    };
  }

  /**
   * Convert the internal checkpoint into the versioned host protocol shape.
   * The returned object is a fresh bounded snapshot so a bridge cannot mutate
   * the adapter's recovery state while a tool is running.
   */
  private getCheckpointPayload(): Record<string, unknown> | undefined {
    const checkpoint = this.getCheckpoint();
    if (!checkpoint) return undefined;
    const toolProgress = checkpoint.toolProgress;
    return {
      ...checkpoint,
      ...(toolProgress
        ? {
            toolProgress: {
              ...toolProgress,
              activeToolCallIds: [...toolProgress.activeToolCallIds],
              completedToolCallIds: [...toolProgress.completedToolCallIds],
              failedToolCallIds: [...toolProgress.failedToolCallIds],
              unknownToolCallIds: [...toolProgress.unknownToolCallIds],
            },
          }
        : {}),
    };
  }

  private async persistCheckpoint(): Promise<void> {
    const snapshot = this.snapshotCheckpoint();
    if (!snapshot) return;
    this.sessionCheckpoint = snapshot;
    if (!this.options.onCheckpoint) return;
    const write = this.checkpointWrite
      .catch(() => undefined)
      .then(() => this.options.onCheckpoint!(snapshot));
    this.checkpointWrite = write.catch(() => undefined);
    await write;
  }

  private loopbackNoProxy(key: "NO_PROXY" | "no_proxy"): string {
    const current = this.options.env?.[key] ?? process.env[key] ?? "";
    return [...new Set([...current.split(",").map((part) => part.trim()).filter(Boolean), "127.0.0.1", "localhost", "::1"])].join(",");
  }
}
