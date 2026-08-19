# BlueBubbles User Guide

BlueBubbles is best for users who want iMessage and SMS access through a Mac running the BlueBubbles server.

## Best For

- iMessage/SMS bridge workflows.
- Apple Messages users who already run BlueBubbles.
- Personal or small-group task control.
- Group chats where BlueBubbles already provides the bridge.

## Key Features

- iMessage and SMS support.
- Group chats.
- Webhooks or fallback polling.
- Contact allowlist support.
- Self-message capture behavior where configured.

## Daily Workflow

Message the connected BlueBubbles chat:

```text
/new
Summarize this thread and suggest next steps.
```

Use `/new temp` for scratch work and `/stop` to cancel active tasks.

## Best Practices

- Run BlueBubbles server on a Mac that stays online.
- Use contact allowlists for controlled access.
- Use DMs for approvals and private context.
- Use group chats only when everyone understands NeoWorker may respond.
- Keep long outputs in NeoWorker desktop when possible.

## Watch-Outs

- Bridge availability controls whether NeoWorker can receive and send messages.
- SMS behavior can differ from iMessage behavior.
- Requires a Mac with Messages signed in.

## Related Docs

- [Channel Integrations](../channels.md#bluebubbles)
- [Gateway User Guide](../gateway-user-guide.md)
