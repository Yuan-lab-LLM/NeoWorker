# Agent Security with Numbat

NeoWorker can inspect live agent actions and endpoint agent artifacts with a
pinned build of [Perplexity Numbat](https://github.com/perplexityai/numbat).
The integration is disabled by default and is controlled by the organization
admin policy.

## Security boundary

Numbat runs as a local child process with `shell: false`, a minimal environment,
bounded stdin/stdout, a per-call timeout, and checksum verification. NeoWorker
passes a minimal action projection—command, path, URL, MCP identity, and input
key names—not the original arbitrary tool input or tool output.

The `agent_security` policy stage runs before user approval and tool execution.
Its decision is monotonic:

- `no_override` continues into NeoWorker's existing permission and approval policy.
- `deny` blocks the action.
- Numbat can never grant an action, suppress an approval, or weaken a NeoWorker
  denial.

Enforcement failures follow `runtime.agentSecurity.failurePolicy`. `open`
continues with a diagnostic. `deny_high_risk` blocks only high-risk actions
while enforcement mode is active.

## Runtime provenance

The release build downloads the exact source commit and Go SDK declared in
`resources/numbat/source-manifest.json`, verifies both SHA-256 digests, applies
the checksum-pinned NeoWorker adapter patch, runs adapter tests, compiles with
`CGO_ENABLED=0`, and writes a runtime manifest containing the binary digest.
Packaged and externally supplied binaries are verified again before execution.

Build or verify the current-platform runtime:

```bash
npm run numbat:build
npm run numbat:verify
```

For an approved external build, both variables are required:

```bash
export NEOWORKER_NUMBAT_BINARY=/absolute/path/to/numbat
export NEOWORKER_NUMBAT_SHA256=<sha256>
```

`NEOWORKER_AGENT_SECURITY_DISABLED=1` is an emergency local kill switch. It
disables evaluation even when the admin policy is enabled and is reported as a
disabled runtime.

## Policy

Settings > System & Security > Admin Policies exposes:

- enabled state and monitor/enforce mode;
- built-in, NeoWorker-recommended, or custom rule profile;
- fail-open or deny-high-risk runtime failure handling;
- hook timeout and history retention;
- optional scheduled artifact scan.

Custom rule directories must be absolute, outside the active workspace, owned
by the current user or root, and not group/world writable. Symlinks are
rejected.

The recommended profile turns on enforcement only for nine high-confidence
high/critical rules covering destructive deletion, disk wipe, fork bombs,
reverse shells, runtime permission bypass, secret-manager egress, SSH
persistence, container host escape, and sudoers tampering. All other built-in
rules remain detection-only.

Policy defaults and accepted ranges are:

| Field | Default | Accepted values |
|---|---:|---|
| `enabled` | `false` | Boolean |
| `mode` | `monitor` | `monitor`, `enforce` |
| `ruleProfile` | `recommended` | `builtin`, `recommended`, `custom` |
| `customRuleDirs` | `[]` | Absolute safe directories used by `custom` |
| `failurePolicy` | `open` | `open`, `deny_high_risk` |
| `timeoutMs` | `1500` | `250`–`5000` |
| `retentionDays` | `30` | `1`–`365` |
| `scheduledScan.enabled` | `false` | Boolean |
| `scheduledScan.intervalHours` | `24` | `1`–`168` |

The full policy lives at `runtime.agentSecurity` in the active user-data
directory's `policies.json`. See [Admin Policies](admin-policies.md) for the
complete schema.

## Operations

The desktop Agent Security panel exposes runtime health, recent findings,
finding lifecycle, diagnostics, scans, rule checks, and external-agent
inventory. Hook installation and removal always require an explicit
confirmation and use a stable checksum-verified binary path.

Equivalent local CLI commands include:

```bash
neoworker security status --refresh
neoworker security findings
neoworker security finding <finding-id> acknowledged
neoworker security decisions
neoworker security inventory --refresh
neoworker security scan
neoworker security check-rules
neoworker security hooks status codex
neoworker security hooks install codex --yes
neoworker security hooks uninstall codex --yes
neoworker security prune --yes
```

Add `--remote` to use the Control Plane. Read operations require `read` scope;
mutating operations require `admin` scope.

Case bundles contain Numbat findings, decisions, and cited events without raw
evidence by default:

```bash
neoworker security case build incident-123 --task-id <task-id>
neoworker security case verify <bundle-name>
```

Verification proves bundle self-consistency, not publisher authenticity.

## Data and retention

Findings, enforcement decisions, diagnostics, and external-agent inventory are
stored in additive SQLite tables. Per-task Numbat record and state files live
under the active NeoWorker user-data directory with owner-only directory
permissions. Records are redacted again before database ingestion.

Retention pruning preserves open findings. Resolved/acknowledged findings,
decisions, and diagnostics older than the configured retention period are
removed. Case bundles are not automatically pruned.

## Troubleshooting

If status reports `unavailable`:

1. Run `neoworker security status --refresh` and inspect the reported runtime
   error.
2. In a source checkout, run `npm run numbat:build`, followed by
   `npm run numbat:verify`.
3. For an offline verification, set `NEOWORKER_NUMBAT_OFFLINE=1`; the command will
   fail if the checksum-pinned source or Go SDK is not already cached.
4. If using `NEOWORKER_NUMBAT_BINARY`, also set the exact
   `NEOWORKER_NUMBAT_SHA256`. Symlinks, writable binaries, ownership mismatches,
   and checksum mismatches are rejected.

Do not enable enforcement until runtime health is `ok` and the selected rules
pass `neoworker security check-rules`. The emergency
`NEOWORKER_AGENT_SECURITY_DISABLED=1` switch disables evaluation locally; it does
not edit the saved organization policy.
