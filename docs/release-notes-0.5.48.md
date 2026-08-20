# Release Notes 0.5.48

Release `0.5.48` expands NeoWorker remote/private-tool access, adds a side conversation workflow for active tasks, and hardens long-running runtime surfaces that matter for release stability.

## Highlights

- **Side Chat**: `/side [question]` opens a right-side read-only chat about the selected running task. It uses hidden parent context, live parent-status snapshots for progress questions, and denies mutating tools so it cannot steer, approve, cancel, or modify the parent task.
- **Secure MCP Tunnels**: NeoWorker can now expose selected local/private MCP tools through an outbound-only relay you operate. The tunnel stack includes a self-hostable relay, local tunnel clients, separate client/caller tokens, policy enforcement, request limits, local audit logs, Settings UI, and a relay smoke test.
- **YouTube video intelligence**: Browser Workbench and native tools can ingest YouTube transcripts, store/search segments, answer questions over videos, and cite timestamped source segments.
- **Timeline and sidebar scalability**: task sidebars now use summary rows and cursor paging; selected-task timelines can load bounded pages and event details instead of forcing large payloads into the renderer.
- **Scheduler and routine reliability**: cron runs persist leases before task creation, tag scheduled tasks with `scheduledJobId`, detect active scheduled work after restart, and avoid duplicate work. Routine runs reconcile stale timeout rows against backing task completion.
- **Runtime safety fixes**: tool allowlists now treat an explicit empty set as deny-all, webviews use explicit URL policy, timeline payloads are sanitized before storage, and macOS sandbox profiles include `/var` and `/private/var` aliases.

## Release Readiness

- **Version bump**: package metadata is prepared for `0.5.48`.
- **Release baseline**: compare from `v0.5.47` to `v0.5.48`.
- **Unsigned macOS path**: keep using the unsigned/ad hoc macOS artifact validation path unless signing credentials are intentionally configured.
- **Database upgrade attention**: this release touches task timeline paging, payload hygiene, scheduler metadata, and routine run reconciliation. Validate an upgrade-path database, not only a fresh install.

## Suggested Validation

Run the focused checks before tagging or publishing:

```bash
npm run type-check
npm run build:electron
npm run build:react
npx vitest --config config/vitest.config.ts run src/electron/tunnels/__tests__/protocol.test.ts src/electron/tunnels/__tests__/relay.test.ts
npx vitest --config config/vitest.config.ts run src/electron/cron/__tests__/service.test.ts src/electron/routines/__tests__/service.test.ts
npx vitest --config config/vitest.config.ts run src/electron/database/__tests__/task-event-repository-timeline-page.test.ts src/electron/agent/__tests__/timeline-payload-sanitizer.test.ts
npx vitest --config config/vitest.config.ts run src/renderer/components/__tests__/side-chat-panel.test.ts src/renderer/components/mission-control/__tests__/MCOverviewTab.test.ts
npm run tunnel-relay:test
npm run release:smoke
```

## Documentation

- [Side Chat](side-chat.md)
- [Secure MCP Tunnels](secure-mcp-tunnels.md)
- [Mission Control](mission-control.md)
- [Remote Access](remote-access.md)
- [Security Guide](security-guide.md)
