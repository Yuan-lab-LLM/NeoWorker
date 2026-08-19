# Mattermost User Guide

Mattermost is best for self-hosted teams that want NeoWorker available inside their existing team chat.

## Best For

- Self-hosted engineering or operations teams.
- Dedicated task channels.
- Real-time internal chat workflows.
- Recurring summaries into team channels.

## Key Features

- REST API and WebSocket messaging.
- Personal access token setup.
- Optional Team ID scoping.
- Real-time message routing.
- Message editing where supported by the adapter and server.

## Daily Workflow

Use dedicated Mattermost channels for NeoWorker tasks:

```text
/new
Review the release checklist and identify missing owners.
```

Use `/queue` and `/steer` to manage active work in a shared channel.

## Best Practices

- Use dedicated channels for recurring workflows.
- Scope NeoWorker to the relevant team.
- Use commands in busy channels.
- Use scheduled summaries for operational updates.
- Use DMs for approvals and sensitive context when available.

## Watch-Outs

- Server URL, TLS, and token permissions must match the Mattermost deployment.
- Self-hosted networking can affect WebSocket reliability.
- Broad channel access can create noise.

## Related Docs

- [Channel Integrations](../channels.md#mattermost)
- [Gateway User Guide](../gateway-user-guide.md)
