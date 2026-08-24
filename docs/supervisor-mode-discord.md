# Supervisor Mode on Discord

NeoWorker can run a strict Discord-native supervisor loop between two NeoWorker agents plus a human operator.

## What It Does

- A watched output channel acts as the worker's publication surface.
- A dedicated coordination channel carries the protocol between the worker and supervisor.
- Mission Control receives the same escalation and resolution events, so operators do not need to live in Discord.

## Protocol

NeoWorker uses four markers:

- `[CW_STATUS_REQUEST]`
- `[CW_REVIEW_REQUEST]`
- `[CW_ESCALATION_NOTICE]`
- `[CW_ACK]`

Rules:

- Exactly one valid marker per actionable coordination message.
- Exactly one configured peer bot mention per actionable coordination message.
- `[CW_ACK]` is terminal.
- One reply per turn.
- Exchange depth is capped at 3 messages.

## Setup

1. Open **Settings > Channels > Discord**.
2. Configure the normal Discord bot credentials.
3. Enable **Discord supervisor protocol**.
4. Set:
   - coordination channel ID
   - watched output channel IDs
   - peer bot user IDs
   - worker agent role
   - supervisor agent role
   - human escalation channel or user
5. Save the Discord settings.
6. Add review and escalation policy to `.neoworker/SUPERVISOR.md`.

## Workspace Contract

When supervisor mode is enabled, NeoWorker reads `.neoworker/SUPERVISOR.md` alongside the rest of the workspace kit. Use it to define:

- freshness windows
- evidence requirements
- escalation criteria
- output-channel quality checks
- worker vs supervisor boundaries

Do not store credentials or Discord IDs in this file.

## Mission Control

Supervisor exchanges appear in the activity stream as `Supervisor Exchange` events. Escalated exchanges can be resolved from NeoWorker, and the resolution can optionally be mirrored back to Discord.

## When To Use This

Use Discord supervisor mode when you want:

- a strict worker/supervisor split in Discord
- a machine-readable termination contract
- human escalation only when judgment is required

Use Heartbeat v3 and Mission Control alone when the work is internal to NeoWorker and does not require a Discord-native coordination lane.
