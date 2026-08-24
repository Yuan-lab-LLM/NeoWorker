# Matrix User Guide

Matrix is best for federated teams and open-protocol rooms where NeoWorker should participate in room-based conversations.

## Best For

- Teams using Element or other Matrix clients.
- Federated collaboration across homeservers.
- Dedicated rooms for task intake.
- Open protocol deployments.

## Key Features

- Homeserver and access-token configuration.
- Room-based conversations.
- Federated messaging.
- Typing support where enabled.
- Message editing support depending on room and adapter behavior.

## Daily Workflow

Use dedicated rooms for NeoWorker workflows:

```text
/new
Summarize the decisions from this room and list action items.
```

Use `/new` before changing topics and `/stop` when the task should not continue.

## Best Practices

- Restrict room IDs when only specific rooms should route to NeoWorker.
- Use command-first routing in busy rooms.
- Keep sensitive work in private rooms or DMs.
- Treat cross-homeserver room content as shared context.
- Confirm encryption behavior before relying on encrypted-room workflows.

## Watch-Outs

- End-to-end encryption support depends on room settings and adapter capability.
- Federation can add delivery variability.
- Access tokens are sensitive credentials.

## Related Docs

- [Channel Integrations](../channels.md#matrix)
- [Gateway User Guide](../gateway-user-guide.md)
