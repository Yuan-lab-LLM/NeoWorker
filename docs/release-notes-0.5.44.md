# Release Notes 0.5.44

Release `0.5.44` is a broad reliability and platform release. It expands Browser V2 and channel documentation, improves Browser Use approvals and gateway routing, adds DeepSeek and NanoGPT provider coverage, fixes several active-runtime bugs found during log review, and hardens the release pipeline that produced the macOS, Windows, Linux server, npm, and GitHub release artifacts.

## Highlights

- **Browser V2 and Browser Workbench docs**: added the canonical Browser V2 architecture guide and refreshed the product docs around the visible Browser Workbench default, `BrowserSessionManager`, Electron-workbench / Playwright-local / external-CDP backends, accessibility snapshot refs, diagnostics, downloads/uploads, real-browser consent, safety invariants, and verification flow.
- **Gateway and channel guides**: documented remote command routing, active-task behavior, `/new` and `/new temp` sessions, `/stop`, skill slash invocation, shared channel delivery, editable WhatsApp progress, scheduled channel output delivery, per-channel feature guides, and dedicated channel pages.
- **Browser Use approvals**: added browser-domain approval context, tool-prefix permission scopes, Browser Use domain approval prompts, sidebar approval wiring, Browser Use composer mentions, and browser-sidebar routing for markdown links.
- **Browser responsive QA**: the visible Browser Workbench can be driven through `browser_emulate` for desktop, tablet, and mobile breakpoint checks, with screenshots taken from the same controlled viewport the user can see.
- **Provider expansion**: added DeepSeek and NanoGPT as named provider options, including NanoGPT onboarding/settings support and safer Anthropic-compatible handling for routes that should not use NeoWorker-managed prompt caching.
- **Gateway runtime expansion**: added shared gateway types, channel delivery services, remote command normalization and registry support, WhatsApp command utilities, temporary workspace routing, voice event routing, tray channel activity, plugin/persona update hooks, and daemon startup wiring.
- **Persistent goal command**: added a slash-command path for setting and carrying a persistent goal in task context.
- **Image generation guidance**: bundled and registered the `imagegen-frontend-web` skill for higher-quality frontend image direction and generated visual references.

## User-Facing Improvements

- **Agents Hub Heartbeat-agent visibility**: Mission Control Heartbeat-enabled agents now surface in Agents Hub counts and panel state without implying they are necessarily executing tasks.
- **Browser Workbench polish**: refined Browser Workbench navigation, styles, sidebar approval UX, mention icon rendering, browser tool prompting, runtime browser tool definitions, and storage-secret redaction.
- **Messaging channel behavior**: tightened shared channel-message handling across Slack, Discord, email, Telegram, WhatsApp, and the channel registry.
- **Workspace status labels**: improved renderer labels around active workspace/task status, especially for OpenAI-compatible provider flows.
- **Branding refresh**: updated app/logo assets and the related documentation references for the current NeoWorker brand set.

## Fixes

- **Task metadata persistence**: restored persisted `TaskRepository.findAll` fields for assigned agent role, board metadata, and awaiting-user-input reason codes.
- **Retryable provider failures**: overloaded provider errors are now treated as transient, allowing existing fallback and retry handling to recover.
- **HTTP tool errors**: `http_request` failures preserve clearer failure reason and status metadata instead of collapsing into a generic unknown-error path.
- **OpenCode Go/Kimi tool calls**: improved OpenAI-compatible handling for Kimi/OpenCode Go style tool-call responses.
- **Anthropic-compatible model selection**: fixed overlapping custom-model matching so the intended Anthropic-compatible gateway model is selected.
- **NanoGPT auth/cache handling**: fixed NanoGPT Anthropic-compatible requests where NeoWorker-managed prompt caching should be bypassed.
- **Archive cleanup**: fixed archive deletion and SQLite cleanup paths so archived tasks and dependent rows are removed without foreign-key leftovers.
- **Workspace switching**: fixed active-chat workspace switching so task context follows the selected workspace correctly.
- **PPTX previews**: tightened workspace path validation for presentation preview loading.
- **Security hardening**: hardened MCP registry package verification, command/path containment, control-plane auth, and workspace file access.
- **Email channel timeouts**: reset IMAP timeout state after failures so one timeout does not cascade into later mailbox operations.
- **Dev-log diagnostics**: reduced false-positive error classification in development log utilities.

## Release Validation

- **Release workflow**: `v0.5.44` completed the full GitHub Actions release workflow after the mac unsigned smoke path was fixed.
- **macOS artifact smoke**: validated the unsigned macOS DMG/zip release path with the explicit unsigned-smoke allowance used by CI.
- **Windows installer smoke**: built and smoke-tested the Windows x64 installer artifact in CI.
- **Linux server smoke**: built the Linux x64 server tarball, verified checksum metadata, and smoke-tested the server package.
- **npm package smoke**: published and verified `neoworker@0.5.44`, including registry propagation and tarball metadata.
- **GitHub release assets**: published the macOS, Windows, Linux server, updater metadata, checksum, and blockmap assets under the `v0.5.44` GitHub release.

## macOS First Launch

- **Unsigned DMG Gatekeeper prompt**: NeoWorker macOS DMGs are currently unsigned. After dragging the app to Applications, open it once. If macOS blocks it, go to **System Settings > Privacy & Security**, scroll to **Security**, click **Open Anyway** next to `"NeoWorker" was blocked to protect your Mac`, then click **Open Anyway** in the confirmation dialog.
