# Hermes Runtime integration

NeoWorker contains three Hermes integration paths for compatibility and
diagnostics:

- **Hermes Agent provider** points at Hermes API Server (`http://127.0.0.1:8642/v1`). This is a complete Hermes agent runtime: it creates an `AIAgent` and executes Hermes-native tools inside the Hermes process. It is an external-runtime option, so NeoWorker cannot claim ownership of those side effects.
- **Hermes Model Proxy provider** points at Hermes' model-only credential proxy (`http://127.0.0.1:8645/v1`). The proxy forwards OpenAI-compatible request and response bodies without running an agent loop. This is the host-owned path: NeoWorker's `SessionRuntime`, `ToolRegistry`, approval policy, sandbox, Shell executor, and task log receive and execute the returned tool calls.
- **Hermes ACP session adapter** (`HermesAcpClient` and `HermesRuntimeAdapter`) runs Hermes' Agent Loop, persists an ACP session handle, streams `session/update` events, cancels prompts, and restores sessions. New tasks launch through NeoWorker's version-pinned Python wrapper and expose task tools through a loopback MCP Tool Host.

New NeoWorker tasks use the embedded Hermes ACP Harness by default, regardless of
whether the prompt is a short question, a web lookup, code work, or an Office
workflow. The renderer does not expose an `Auto`/`Hermes`/`Native` runtime
selector, and the backend does not choose Native based on prompt complexity.
Hermes owns the model loop while NeoWorker executes the exposed tools through
`NeoWorkerToolHost` and `ToolExecutionCoordinator`. Hermes startup and runtime
availability failures fail closed; they are visible task failures and never
silently switch the task to the Native loop. The persisted
`runtimePreference` field is retained only for old task rows and compatibility
integrations. Existing Native tasks and legacy Hermes checkpoints remain
compatible and are not silently migrated. Desktop pause/resume retains the
saved session and sends an explicit continuation prompt.

The adapter exposes a stable lifecycle surface: `start()`/`prompt()`, `cancel()`/`pause()`, `resume()`/`retry()`, `checkpoint()` and `close()`. Each host call is recorded in one correlated NeoWorker lifecycle chain: `request`, `approval`, `running`, and one terminal state (`result`, `failed`, `timed_out`, or `cancelled`). The chain carries the task ID, tool call ID, structured idempotency key, phase, start/end timestamps, duration, exit code or termination reason when available, and a classified error type. Approval records include the approval type and status (`requested`, `granted`, `denied`, or `delegated`); the existing daemon approval events remain the source of truth for the user decision. The internally gated `run_command` and `delete_file` handlers additionally emit the actual requested/granted/denied/cancelled result through the same lifecycle callback and persist the correlated `toolCallId` in the daemon approval details. `tool_host_lifecycle` remains the transport/idempotency record and can be joined by the same task ID and tool call ID. Validation and idempotency rejections (for example, a conflicting payload or an unknown side effect after restart) also write a terminal Tool Host error response before throwing, so the persisted request cannot look like an indefinitely running call. ACP transport events are normalized as durable `hermes_runtime_transport` task events with request, first-byte, response, timeout, cancellation, protocol-error and connection-close phases; response bodies are never logged. Every NeoWorker Tool Host request carries a fresh bounded checkpoint snapshot after its call is marked active, and the terminal response carries a new snapshot after the outcome is persisted. The checkpoint keeps bounded tool-call IDs and the last NeoWorker event sequence. `resume()` and `retry()` treat persisted active calls as unknown and invoke the host's explicit confirmation callback before submitting another Hermes turn; they never replay a tool call automatically. The capability ownership table is maintained in [hermes-capability-matrix.md](hermes-capability-matrix.md).

Executor prompts use a versioned, bounded host contract (`<neoworker_runtime_contract_v1>`) followed by separate workspace, task, context, skill and permission-filtered NeoWorker memory layers. Memory is injected as read-only background data and is omitted for disallowed gateway contexts or sub-agents. Follow-ups carry only the latest user message plus the workspace root, so the full task context is not resent on every turn. If initial execution finds a persisted session checkpoint, the executor sends a recovery prompt through `retry()` instead of submitting the original task through `prompt()`; unknown side effects therefore remain behind the existing approval gate.

ACP assistant message chunks are delivered as ephemeral `llm_streaming` updates. NeoWorker does not persist one timeline row per streamed token; the completed assistant message remains the durable transcript record, while internal thought chunks are discarded. This keeps long Hermes responses from turning into synchronous database-write storms and preserves task-switch performance. A successful Hermes follow-up also runs through the normal terminal finalizer, so the task status and result summary cannot remain stuck at `executing` after the response is delivered.

After a successful Hermes turn, the executor keeps the connected ACP session and
task-scoped MCP endpoint warm for 60 seconds. A follow-up in the same workspace
and session reuses that adapter, avoiding a second Python process launch,
ACP initialization, and MCP server handshake. Failed, cancelled, paused, or
workspace-mismatched turns close the old adapter instead of retaining a stale
process; completed executors also release the runtime when the daemon evicts
them from its cache. The warm, reused, and closed transitions are durable
diagnostic metrics, so a slow task can be compared against actual session
startup and reuse behavior after the fact.

Checkpoint persistence is bounded at the timeline lookup boundary. The
executor reads only the newest task event to capture the current log sequence,
and each checkpoint creates one tool-progress snapshot before copying its
bounded ID lists. A long task therefore does not make every host-tool
checkpoint scan or clone the entire task history.

For host-owned Hermes tasks, transient provider failures have at most three attempts with bounded backoff. Completed host calls remain in the saved session; active or unknown side effects block automatic retry. A separately classified connection failure before prompt dispatch can retry startup once even when no session checkpoint exists. It cannot run a native-model recovery summary or finalize as partial success: the user sees an engine-start failure and diagnostics retain the failed stage. Cancellation, missing executables, explicit non-retryable errors and legacy native-tool sessions do not use startup retry. Retries are recorded as `hermes_runtime_retry`.

`HermesRuntimeOptions.onPermissionRequest` receives the operation details, offered options, and an AbortSignal. Return the selected option ID or null. `HermesPermissionBridge` validates the active session and options and dismisses on timeout, cancellation or handler failure. Generic `onRequest` callbacks cannot approve permission requests. The production executor wires this handler to the daemon task approval service; UI integrations must still close any pending approval surface when the signal aborts.

The daemon exposes `createHermesPermissionHandler(taskId)`, which delegates to the existing `requestApproval` path. In host-owned ACP sessions, tool execution also goes through the regular NeoWorker tool policy, approval, sandbox, timeout and lifecycle path. ACP permission callbacks alone are not a sandbox and remain relevant to legacy sessions.

The adapter keeps the task-scoped MCP Tool Host suspended until an ACP prompt is active. Pause, cancel, or an externally aborted `AbortSignal` immediately aborts active host calls and rejects late `tools/call` requests. A cancelled host-owned prompt closes its transport after the ACP cancel handshake; resume reconnects to the persisted checkpoint on a fresh transport so late updates or calls from the cancelled turn cannot start a new side effect.

## ACP Tool Host boundary

Hermes Agent v0.18.0's ACP `session/new` contract accepts `mcpServers`, but its server creates each session with the built-in `hermes-acp` toolset. That toolset includes native `terminal`, `read_file`, `write_file`, `patch`, and `process` tools. The current ACP contract has no request field for replacing that toolset or forwarding native tool calls to the client. Registering a NeoWorker MCP server therefore adds tools but does not, by itself, transfer ownership of those side effects.

`scripts/hermes-acp-neoworker-host.py` replaces the ACP agent's enabled toolsets with only `mcp-neoworker` before initialization. It disables workspace context loading, memory loading, project plugins and inherited kanban tool activation for this process. It does not modify the user's Hermes installation. The wrapper requires exactly `hermes-agent==0.18.0`; another version fails closed until the adapter is verified. Disabling the `hermes-acp` bundle would be insufficient because Hermes deliberately preserves core tools when disabling a platform bundle.

`HermesToolHostMcpServer` exposes only the task's filtered catalog on an ephemeral `127.0.0.1` port with a random bearer token. Every tool call enters the existing executor Tool Host, and the persisted result is returned to Hermes as a bounded MCP tool result. Session-scoped correlation prevents reused MCP request IDs from aliasing calls after reconnect. Request timeout, runtime shutdown, and rejected host dispatches propagate as structured tool results so Hermes can distinguish a failed operation from a malformed MCP response. Loopback addresses are added to the child process's `NO_PROXY`/`no_proxy` so local tool traffic cannot accidentally go through an inherited HTTP proxy.

The desktop package builds and ships a standalone Hermes ACP host from the pinned `hermes-agent==0.18.0` distribution. PyInstaller uses **onedir**: the executable and its `_internal` libraries travel together, with relative framework symlinks preserved. Unlike onefile, every team member does not unpack another runtime before replying to initialize. The packaged app launches the executable directly; end users do not need Python, the `hermes` command, or a separate Hermes Agent installation. The build uses an isolated Python environment only while producing the installer and checks both the build and relocated runtime. Source-mode development may still fall back to `scripts/hermes-acp-neoworker-host.py` and a local Hermes/Python installation. Artifact smoke runs the embedded executable's credential-free runtime check and verifies the onedir manifest.

Run `node scripts/qa/hermes-team-startup.mjs` after building the embedded runtime. It compiles the current adapter source, launches five real ACP processes sharing an isolated Hermes data directory, and uses a local model fixture to verify distinct sessions, one host-tool file write per worker and five successful results. It never uses user chat data or provider credentials. The 2026-10-08 macOS arm64 run completed initialize in 660–824 ms per worker and the full fixture in 4.73 seconds; this is a startup/tool-chain check, not live-model report-generation timing. The installed onefile runtime took about 33 seconds for five initialize-only probes on the same machine.

Read-only team researchers and verifiers are evaluated on their findings, consistently in the executor and daemon. They are not required to create another copy of a parent-requested PDF/PPT. Implementers, synthesizers and parent tasks still require the requested artifact; this does not convert an engine startup failure into success.

Hermes successful prompt completion uses the shared best-effort finalizer. Like native finalization, it must emit the collected source citations **before** daemon completion checks key-claim evidence. Otherwise a worker that successfully read its sources but omitted URLs from its final prose is incorrectly downgraded to `partial_success / contract_error`. Web-fetch citations are collected only for successful, nonempty page responses, using the fetched title and final URL; skipped or failed fetches do not satisfy the gate. Citation, finalization-order, and daemon-gate regressions cover this path without disabling missing-evidence checks.

The real local Hermes 0.18.0 probe on 2026-09-10 listed exactly the supplied host probe tool and successfully invoked it once through a configured model, returning `NEOWORKER_HOST_OK`. The latest run of `node scripts/qa/run-hermes-live-hostchain.mjs` also drove the real model through `write_file` and `run_command`; NeoWorker recorded one approval, persisted both tool lifecycles, produced the exact file and Shell output, and ended with no unknown tool call. This closes the live file/Shell/approval path. Cancellation, pause/resume and unknown-side-effect confirmation remain covered by deterministic tests and Windows runner validation. A separate Model Proxy attempt can still return HTTP 402/502 when its provider account is unavailable; the wrapper preserves such provider failures as `field_meta.neoworker.runtimeError` so ACP `end_turn` cannot be mistaken for success.

Persistent Shell output is bounded before parsing: its in-memory command buffer is capped at 1,000,000 characters, and the returned visible output is capped at 100KB while retaining the diagnostic tail. The protocol buffer accumulates stream chunks and, after overflow, keeps a bounded head plus tail without rebuilding a megabyte-sized string for every Windows pipe chunk. Tool results sent back to the model are capped at 200,000 characters. The full structured result remains available to task logs and evidence, while the model receives a valid truncated payload with an explicit marker.

For the source-level ownership evidence, see [hermes-tool-ownership-audit.md](hermes-tool-ownership-audit.md). For current evidence, outstanding requirements and package freshness, see [hermes-test-report.md](hermes-test-report.md).

## Local test

The packaged desktop app launches the version-pinned embedded Hermes host. A
separate Hermes Agent installation is not required. Source-mode development may
use the local Python wrapper, but that is only a development fallback.

Run the focused checks:

```sh
npm test -- --run src/electron/agent/runtime/__tests__/hermes-runtime-routing.test.ts
npm test -- --run src/electron/agent/__tests__/executor-entrypoints.test.ts
npm test -- --run src/electron/agent/runtime/__tests__/hermes-acp-client.test.ts
npm test -- --run src/electron/agent/runtime/__tests__/hermes-tool-host-mcp.test.ts src/electron/agent/__tests__/executor-hermes-recovery.test.ts
npm test -- --run src/electron/agent/runtime/__tests__/hermes-host-owned-toolchain.test.ts
python3 scripts/qa/test_hermes_host_launcher.py
npm test -- --run src/electron/agent/tools/__tests__/shell-tools.test.ts
```

Do not automatically retry an interrupted ACP prompt: Hermes may already have performed a side effect. Restore the checkpoint and let the user explicitly continue.

For a real model-driven host-chain check after `npm run build:electron`, run:

```sh
node scripts/qa/run-hermes-live-hostchain.mjs
```

The script uses temporary workspace and user-data directories, prints only structured validation metadata, and closes both the Hermes process and the persistent NeoWorker Shell session before exiting.
