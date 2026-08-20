# NeoWorker vs OpenClaw: Improvement Plan

**Last updated:** After the layered-memory refactor, session recall tooling, curated hot memory, and edge-case hardening changes.

---

## Executive Summary

The earlier OpenClaw-inspired memory gaps are mostly closed now:

- `search_sessions` adds explicit recent-run transcript recall
- `memory_topics_load` adds focused topical memory packs under `.neoworker/memory/topics`
- `memory_curate` and `memory_curated_read` add a Hermes-like curated hot-memory lane
- archive memory is still searchable, but no longer injected by default
- behavior-adaptation toggles are exposed in `GuardrailSettings`
- task/message feedback UI already exists and feeds the learning loop

The remaining differences versus OpenClaw are now mostly product-shape choices rather than missing primitives. OpenClaw still has the simpler plain-markdown mental model; NeoWorker now favors a layered system with a small always-visible curated lane and explicit recall tools for broader history.

---

## Current Comparison Matrix

| Aspect | OpenClaw | NeoWorker | Current status |
|--------|----------|-----------|----------------|
| **Personalization** | `USER.md`, `IDENTITY.md`, `SOUL.md` in workspace | `UserProfileService`, `RelationshipMemoryService`, `.neoworker/USER.md`, curated hot memory, adaptive style | NeoWorker has both file-based and structured personalization |
| **Always-visible memory** | Plain markdown memory files | Curated hot memory in `<neoworker_hot_memory>` plus auto-managed blocks in `.neoworker/USER.md` and `.neoworker/MEMORY.md` | NeoWorker now has a dedicated hot-memory lane |
| **Archive recall** | Markdown memory history | `MemoryService`, `search_memories`, imported ChatGPT history, indexed `.neoworker/` markdown | NeoWorker keeps broader searchable recall separate from always-on injection |
| **Session recall** | Session-history tooling | `search_sessions` over transcript spans and checkpoints | Gap closed |
| **Topic-focused recall** | Workspace-native markdown browsing | `memory_topics_load` packs focused topic files under `.neoworker/memory/topics` | NeoWorker now has an explicit topical recall path |
| **Daily logs** | `memory/YYYY-MM-DD.md` style files | `DailyLogService` + `DailyLogSummarizer` under `.neoworker/memory/daily` and `.neoworker/memory/summaries` | Primitive exists; writer wiring remains an optional follow-up |
| **Style adaptation** | Static persona files | `AdaptiveStyleEngine` with UI toggles in `GuardrailSettings` | NeoWorker ahead |
| **Feedback learning** | Limited in reviewed docs | Message/task thumbs, `FeedbackService`, `UserProfileService.ingestUserFeedback`, playbook reinforcement | NeoWorker ahead |
| **Privacy** | Local-first | Local-first plus `SecureSettingsRepository` encryption | NeoWorker ahead |

---

## What Changed

### Memory runtime

- `src/electron/memory/CuratedMemoryService.ts` adds the curated hot-memory lane
- `src/electron/memory/SessionRecallService.ts` adds transcript/checkpoint recall
- `src/electron/memory/MemorySynthesizer.ts` now emits:
  - `<neoworker_hot_memory>`
  - `<neoworker_structured_memory>`
  - `<neoworker_recall_hints>`
- `src/electron/settings/memory-features-manager.ts` now defaults archive injection to off

### Tooling

- `memory_curate`
- `memory_curated_read`
- `search_sessions`
- `memory_topics_load`

### UI and learning surfaces

- `src/renderer/components/GuardrailSettings.tsx` exposes `adaptiveStyleEnabled` and `channelPersonaEnabled`
- `src/renderer/components/MainContent.tsx` and `src/renderer/components/RightPanel.tsx` expose message/task feedback controls
- `src/renderer/components/MemoryHubSettings.tsx` already exposes `Open USER.md` and `Open MEMORY.md`

---

## Remaining Optional Follow-Ups

These are still reasonable OpenClaw-inspired improvements, but they are no longer parity blockers:

1. Surface the memory-feature flags (`curatedMemoryEnabled`, `sessionRecallEnabled`, `topicMemoryEnabled`, `defaultArchiveInjectionEnabled`) in the Memory Hub instead of keeping them runtime/settings-only.
2. Add a first-class UI for browsing generated topic packs under `.neoworker/memory/topics`.
3. Wire more automatic writers into `DailyLogService` if the product wants OpenClaw-style operational journaling to become a default workflow.
4. Add an “OpenClaw-like memory mode” setup guide that explains how to lean more heavily on `.neoworker/USER.md`, `.neoworker/MEMORY.md`, and daily logs.

---

## Key File References

| Component | Path |
|-----------|------|
| Curated hot memory | `src/electron/memory/CuratedMemoryService.ts` |
| Session recall | `src/electron/memory/SessionRecallService.ts` |
| Prompt memory assembly | `src/electron/memory/MemorySynthesizer.ts` |
| Topic packs | `src/electron/memory/LayeredMemoryIndexService.ts` |
| Archive memory | `src/electron/memory/MemoryService.ts` |
| Memory tools | `src/electron/agent/tools/memory-tools.ts` |
| System recall tools | `src/electron/agent/tools/system-tools.ts` |
| Memory feature defaults | `src/electron/settings/memory-features-manager.ts` |
| Guardrail adaptation UI | `src/renderer/components/GuardrailSettings.tsx` |
| Memory hub UI | `src/renderer/components/MemoryHubSettings.tsx` |
| Feedback UI | `src/renderer/components/MainContent.tsx`, `src/renderer/components/RightPanel.tsx` |
