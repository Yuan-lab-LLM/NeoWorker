# Release Notes 0.5.22

## Summary

Release `0.5.22` packages the session runtime and permission-system refresh as a publishable build. The codebase changes include the canonical session runtime owner, the layered permission engine, workspace-local permission rule management, the session checklist primitive, graph-backed delegation, typed worker roles, semantic batch summaries, and the UI/completion updates that surface them.

## New Features

- SessionRuntime now owns session-scoped task state, checklist state, permission state, and recovery snapshot data.
- Session checklist primitive in `SessionRuntime` with `task_list_create`, `task_list_update`, and `task_list_list`.
- Session snapshot resume now prefers `session_runtime_v2` checkpoints and can reconstruct legacy resumes before upgrading them on the next checkpoint.
- Layered permission engine with explicit modes, workspace-local rules, profile rules, and denial fallback.
- Workspace rule manager in Settings for browsing and removing workspace-local permission rules.
- Metadata-driven `ToolScheduler` with automatic batching for safe reads and scoped serialization for writes.
- Normalized orchestration graph engine for delegated work, workflow phases, and ACP-backed task state.
- Built-in worker roles: `researcher`, `implementer`, `verifier`, and `synthesizer`.
- Semantic tool-batch summaries surfaced in timeline and completion projections.

## Enhancements

- Completion UI now carries richer terminal text from result summaries, semantic summaries, and verifier output.
- Right-panel task details now surface a read-only ordered session checklist plus a verification reminder banner when the runtime raises one.
- Follow-up messages remain visible in task timelines, including orphaned follow-ups handled after a main task completes.
- Renderer surfaces were updated across the main content view, right panel, approval dialog, and task-event compatibility logic.
- Settings now includes a permission panel for default mode, profile rules, and workspace-local rule browsing/removal.
- Mission Control, task detail views, gateway relays, cron exports, and supervisor notifications consume the richer completion payload.

## Fixes

- Fixed terminal-state divergence between task events and the task row for follow-up completion paths.
- Fixed a late resume race where approval-driven resume handling could overwrite a freshly completed task row back to `executing`.
- Fixed visibility for orphaned follow-up prompts in the timeline.
- Reduced noisy screenshot rendering during iterative canvas work.

## Docs

- Updated the README and docs home to point at `0.5.22`.
- Added a session note describing the runtime migration work completed in this cycle.
- Added a dedicated permission-system page and refreshed the session-runtime and skills-runtime documentation.

## Internal / Runtime Changes

- Shared turn ownership now lives in the runtime kernel.
- SessionRuntime now owns the session checklist bucket, validation, verification-nudge logic, and replayable checklist events.
- Permission decisions now flow through a layered permission engine with session, workspace, profile, and compatibility rule sources.
- Tool batching, transcript normalization, and ordered tool-result handling are centralized.
- Delegated work is graph-backed across child tasks, workflow phases, collaborative teams, and ACP.
- Verification now uses a dedicated read-only worker role and verdict-based completion semantics.
- Tool-batch summaries are generated once per scheduler batch and attached to projections.
- ACP and control-plane task handlers now project delegated work from the orchestration graph instead of treating it as a separate runtime.
- Resume paths now re-read canonical persisted task state before writing `executing`, so terminal rows cannot be reopened by stale renderer or approval flow timing.
- Content-builder and runtime helper modules were expanded to support the new execution, orchestration, and projection paths.
- Tool policy, search, middleware, handler registry, and envelope plumbing were updated to support the new scheduler and runtime contracts.
- Shared types, detection, sanitization, and timeline-event contracts were updated to match the new history and projection model.
- Renderer updates span debug, session, timeline, and completion surfaces so the new runtime state is visible end to end.
- The permission settings surface and workspace-rule management panel expose workspace-local policy state directly in the desktop UI.

## Test / Build Changes

- Expanded unit coverage for the turn kernel, scheduler, orchestration graph, worker roles, verification, permission engine, and completion projections.
- Improved build and packaging flow for the macOS release bundle.
- Release packaging now emits `0.5.22` artifact names and version metadata.
- A large test expansion landed across runtime, permission, ACP, inbox/mailbox, debug, renderer, and release/build paths to cover the new subsystem wiring.
- Build and packaging scripts were updated alongside refreshed branding assets so the release artifacts and UI assets stay aligned.

## Upgrade Notes

- Tasks resumed from older snapshots continue to work because runtime restore still falls back to legacy `conversationHistory` payloads and rewrites them to `session_runtime_v2` on the next checkpoint.
- Execution-style tasks now have access to the session checklist primitive and its advisory verification nudge.
- Approval-driven or follow-up-driven resumes no longer risk reopening a task that has already reached a terminal state.
- Permission prompts can now persist workspace or profile rules, and workspace rules can be managed from the Settings panel.
