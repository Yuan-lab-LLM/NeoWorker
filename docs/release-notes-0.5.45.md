# Release Notes 0.5.45

Release `0.5.45` is a broad platform, workflow, and reliability release. It adds the plan-based Agent Builder, finance and legal workflow packs, channel specialization, Google Workspace Tasks/Slides support, mailbox compose/send upgrades, runtime network/sandbox policy controls, Dreaming memory curation, and `/multitask` lane fan-out. It also refreshes the docs around managed agents, legal workflows, responsive browser QA, deployment posture, and renderer task-surface performance.

## Highlights

- **Agent Builder and managed-agent templates**: Agents Hub can generate managed-agent plans from a prompt, surface missing connections, create managed agents from the plan, and route tests/previews through normal main-window managed sessions. New finance templates cover pitch, meeting prep, market research, earnings review, model building, valuation review, GL reconciliation, month-end close, statement audit, and KYC screening.
- **Finance and legal workflow packs**: added legal practice packs for commercial, corporate, employment, IP, litigation, privacy, product, regulatory, legal clinic, law student, CoCounsel-style, and legal-builder workflows. Finance packs now cover finance core, fund administration, KYC operations, and expanded equity research, financial analysis, investment banking, private equity, and wealth management guidance.
- **Channel specialization**: channels, chats, and threads can now resolve specialization records that set workspace, agent role, system guidance, tool restrictions, and shared-context memory behavior. The gateway applies those choices when creating new tasks.
- **Google Workspace MCP expansion**: Google Tasks and Slides are first-class MCP tool families, with OAuth scope diagnostics, reconnect guidance for missing scopes, and explicit confirmation for destructive or broad operations.
- **Mailbox compose and send upgrades**: mailbox drafts can attach workspace-scoped local files, queue sends, retry actions, use Microsoft Graph send paths, refresh provider navigation metadata, and back off transient Gmail sync failures cleanly.
- **Dreaming memory curation**: Workflow Intelligence now has a documented Dreaming phase with persisted runs and candidates so memory improvements remain reviewable before application.
- **`/multitask` collaborative lanes**: the composer can start a bounded 2-8 lane collaborative run, optionally using LLM lane planning, with worktree safety warnings for code tasks and synthesis through the existing team orchestration flow.
- **Runtime policy controls**: admin policies now cover permission modes, allowed sandbox backends, shell sandbox requirements, coarse shell network egress, domain network evaluation, auto-review, telemetry, and integration-auth notifications.

## User-Facing Improvements

- **Agents Hub polish**: the managed-agent detail surface is clearer about configuration, missing connections, starter prompts, test runs, deployment surfaces, and finance-oriented templates.
- **Legal intake UX**: Claude-for-Legal picker selections remain editable before launch, matter-heavy legal tasks can show structured demand/generic intake cards, and management commands are excluded from legal intake handling.
- **Responsive browser QA**: the visible Browser Workbench supports `browser_emulate` viewport changes for desktop, tablet, and mobile screenshot passes.
- **Task surface performance**: the renderer task view now lazy-loads heavy task surfaces, splits CSS ownership into focused files, adds markdown/code rendering helpers, and includes a renderer performance fixture for failure-storm scenarios.
- **Spawned-agent visibility**: new sidebar utilities and components expose spawned-agent progress and live task-event policy more consistently.
- **Docs refresh**: README, docs home, Managed Agents, Mission Control, message-box shortcuts, providers, deployment, troubleshooting, and project status now reflect the current Agent Builder, Dreaming, legal workflow, multitask, and deployment model.

## Reliability and Security

- **Shell sandbox behavior**: persistent shell commands keep their session lifecycle when sandboxing is not required, `requireSandboxForShell` controls fallback behavior, and macOS sandbox profiles honor each command's network decision.
- **Network policy evaluation**: browser, web fetch, voice call, and shell network paths now log policy decisions and use a shared policy layer before legacy guardrail checks.
- **WhatsApp TLS handling**: certificate trust failures pause reconnect attempts and surface an actionable status instead of entering repeated retry loops.
- **Integration auth notices**: likely X/Twitter auth and challenge failures can create deduped reconnect notifications.
- **Deployment posture checks**: headless/control-plane deployments now have fail-closed posture checks and clearer reverse-proxy/trusted-proxy guidance.
- **Telemetry export**: task-event telemetry can be queued for optional export without blocking task-event persistence.

## Developer and Packaging Notes

- **Version bump**: package metadata is prepared for `0.5.45`.
- **Release diff reviewed**: the local release diff from `v0.5.44` to `HEAD` covers 311 files.
- **Validation already run during prep**:
  - `npm run build`
  - `npm run build:electron`
  - `npm run build:connectors`
  - `npm run build:react`
  - `npx vitest --config config/vitest.config.ts run tests/tools/shell-tools.test.ts src/electron/agent/tools/__tests__/browser-tools.test.ts src/electron/security/__tests__/network-policy.test.ts`
  - `npm run package:mac:unsigned`
  - `node scripts/smoke-desktop-artifacts.mjs --platform=mac --allow-unsigned --expected-version=0.5.45`
  - `git diff --check`
- **Platform smoke status**:
  - macOS arm64 DMG smoke passed for `NeoWorker-0.5.45-arm64.dmg` with the unsigned fallback path.
  - Windows installer packaging/smoke must run on Windows; local macOS packaging stops at the native `better-sqlite3` rebuild because `node-gyp` does not support cross-compiling that module from source.
  - Linux server packaging/smoke must run on Linux x64; the local packager intentionally refuses non-Linux hosts so bundled native modules match the target.

## Suggested Release Validation

Before publishing, run the normal release gate from a clean checkout or worktree:

```bash
npm ci --no-audit --no-fund
npm run build
npm run release:smoke
```

If this release is published to npm, create and validate the tarball explicitly with `npm pack --ignore-scripts --silent` and verify the packed artifact contains the built Electron and renderer outputs before `npm publish --ignore-scripts`.
