# Session Runtime Owner Extraction

This note records the follow-up runtime refactor completed on 2026-04-02 so the current codebase state is documented in one place.

## What changed

### Canonical session owner

- Added a dedicated `SessionRuntime` under `src/electron/agent/runtime/`.
- Moved the mutable execution mirror into explicit runtime buckets:
  - transcript
  - tooling
  - files
  - loop
  - recovery
  - queues
  - worker
  - verification
  - checklist
  - usage
- Kept `TaskExecutor` focused on task bootstrap, plan construction, completion policy, and UI/daemon projection.

### Turn execution

- `SessionRuntime` now owns the active `TurnKernel` creation path for step, follow-up, and text turns.
- The executor no longer stores mirrored loop state for those paths.
- Runtime helpers now handle adaptive-budget requests, context-overflow recovery, follow-up draining, retry reset, and workspace refresh.

### Persistence and resume

- Runtime snapshots are now written as `conversation_snapshot` events with payload schema `session_runtime_v2`.
- Restore precedence now prefers:
  1. V2 checkpoint payloads
  2. V2 `conversation_snapshot` event payloads
  3. legacy checkpoint payloads with `conversationHistory`
  4. legacy `conversation_snapshot` payloads with `conversationHistory`
  5. fallback reconstruction from task events
- Legacy restores are upgraded automatically on the next checkpoint write.

### Session checklist primitive

- Added a session-local checklist bucket with ordered items, timestamps, and verification-nudge state.
- Added runtime-owned checklist APIs for create, update, list, and explicit nudge clearing.
- Added runtime tools `task_list_create`, `task_list_update`, and `task_list_list` for execution-style task paths only.
- Added dedicated replayable events:
  - `task_list_created`
  - `task_list_updated`
  - `task_list_verification_nudged`
- Added a non-blocking verification nudge algorithm that activates only after implementation items are complete and no explicit verification coverage exists yet.

### Task projection

- Runtime-owned counters now project back into the task row from a single source of truth.
- The projected values include:
  - budget usage
  - continuation count and window
  - lifetime turns used
  - compaction counters and markers
  - no-progress streak
  - last loop fingerprint

### Worker and verification state

- Session-local verification state is now runtime-owned.
- Mentioned-agent dispatch state is now runtime-owned.
- Recovery state and retry metadata are now accessed through runtime getters and setters instead of executor-local mirrors.

### Terminal-state sync hardening

- Completion now follows a persist-then-emit order so `task_completed` is emitted only after the task row has terminal status, timestamps, and outcome metadata.
- Resume handling now re-reads canonical persisted task state before applying `executing`.
- Terminal tasks reject late resume attempts instead of being reopened by stale approval or follow-up flows.
- Duplicate resume requests also skip redundant `executing` writes when the task is already running.

## User-visible effects

- Tasks can resume from persisted `session_runtime_v2` payloads with the same loop state, worker state, and recovery state they had when the snapshot was saved.
- Non-trivial execution tasks can maintain a session-local checklist that stays visible in the task UI for the life of the task.
- Verification reminders can now surface inside the session without becoming a hard completion gate.
- Legacy tasks still resume successfully because the runtime falls back to older payload shapes and upgrades them on the next save.
- The task row and persisted snapshot now stay aligned more reliably because both are driven from the same runtime projection.
- Approval-driven resume paths no longer regress a completed task row back to `executing`.
- Main interactive tasks no longer inherit an implicit strategy turn window; explicit `maxTurns` is now reserved for managed/helper flows or callers that intentionally request it.

## Validation

- Electron typecheck passes.
- Runtime unit tests cover V2 snapshot round-tripping, legacy restore fallbacks, checklist state ownership, verification-nudge behavior, recovery state ownership, and workspace update invalidation.
- Resume-path regression tests cover terminal-task rejection and duplicate `executing` suppression.

## Related docs

- [Session Runtime](../session-runtime.md)
- [Architecture](../architecture.md)
- [Features](../features.md)
- [Context Compaction](../context-compaction.md)
- [Project Status](../project-status.md)
