# Multitask Command

`/multitask` starts a bounded collaborative run from one prompt. It is for work that can be split into independent lanes, run in parallel, and synthesized into one answer.

## Syntax

```text
/multitask <request>
/multitask <lane-count> <request>
```

Examples:

```text
/multitask fix the onboarding bugs and verify the flow
/multitask 6 audit the repo for performance issues and propose patches
```

The lane count defaults to `4` and is clamped to `2-8`. If the command has no request after it, NeoWorker shows a validation error and does not create a task.

## Runtime Behavior

When a desktop composer prompt starts with `/multitask`, NeoWorker:

- strips the `/multitask` prefix before saving the task prompt
- creates a normal task with collaborative multitask metadata
- creates an ephemeral agent team and `AgentTeamRun`
- plans lane-specific `AgentTeamItem` records
- dispatches each lane as a child task through the existing graph-backed team orchestrator
- keeps child tasks under the global task queue limit by setting `bypassQueue=false`
- synthesizes lane outputs through the existing collaborative synthesis phase

The task appears in the same task timeline and sidebar surfaces as other collaborative work, with a **Multitask** session label where available.

## Lane Planning

Lane assignment is best-effort and bounded:

1. Explicit bullet or numbered lists in the prompt become lane definitions first.
2. If no explicit lanes are present, NeoWorker asks the configured default LLM for JSON lane specs.
3. If that side LLM call fails or returns invalid output, NeoWorker falls back to deterministic lanes such as context/scope, implementation, risk review, and verification.

Each child prompt receives the root task context plus its lane title/details and is instructed to work only inside that lane, report files changed, and call out risks or blockers.

## Worktree Safety

For coding requests, `/multitask` is safest with **Git Worktree Isolation** enabled. Existing worktree settings still apply to each child task, so parallel lanes can receive separate branches/worktrees when the workspace supports it.

If a prompt looks code-related and worktree isolation is unavailable, NeoWorker logs a non-blocking warning on the root task instead of failing the run.

## Scope

V1 is command-first. It does not yet promote already queued tasks into one multitask run, and it is not a separate Agents Window. Use normal Agent Teams or Collaborative Mode when you want persistent team management rather than one prompt split into lanes.

## Implementation Landmarks

| Area | Files |
|------|-------|
| Command parser | `src/shared/multitask-command.ts` |
| Lane planner | `src/electron/agents/MultitaskLanePlanner.ts` |
| Task creation wiring | `src/renderer/App.tsx`, `src/electron/ipc/handlers.ts` |
| Child lane prompts | `src/electron/agents/AgentTeamOrchestrator.ts` |
| Config validation | `src/shared/types.ts`, `src/electron/utils/validation.ts` |

## Focused Checks

```bash
npx vitest --config config/vitest.config.ts \
  src/shared/__tests__/multitask-command.test.ts \
  src/electron/agents/__tests__/MultitaskLanePlanner.test.ts \
  src/electron/agents/__tests__/AgentTeamOrchestrator.test.ts
```

For broader validation after multitask changes:

```bash
npx vitest --config config/vitest.config.ts src/shared/__tests__ src/electron/agents/__tests__ src/renderer/components/__tests__
npm run type-check
```
