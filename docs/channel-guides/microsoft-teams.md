# Microsoft Teams User Guide

Microsoft Teams is best for organizations already using Microsoft 365. It works well for internal team workflows, approvals, recurring summaries, and channel mention-based task intake.

## Best For

- Microsoft 365 organizations.
- Team channels where work is already coordinated.
- Approval-heavy enterprise workflows.
- Scheduled summaries into Teams channels.
- Direct-message task control.

## Key Features

- Bot Framework integration.
- Direct messages and channel mentions.
- Adaptive Card formatting.
- File attachment support.
- Auto-reconnect behavior.
- Shared NeoWorker gateway lifecycle once messages reach the router.

## Daily Workflow

Use DMs for personal work and sensitive approvals. Use channel mentions for shared work:

```text
/new
Summarize the current launch blockers from this channel.
```

For recurring work, schedule concise summaries into the channel rather than sending long task traces.

## Best Practices

- Keep the Teams app installed only where NeoWorker should operate.
- Use DMs for credentials, private documents, and approvals.
- Use channel mentions for team-visible tasks.
- Use `/new` before switching topics.
- Use scheduled delivery for daily or weekly team updates.

## Watch-Outs

- Tenant policies can affect app installation and bot messaging.
- Azure Bot credentials and endpoint configuration must remain valid.
- Long outputs can be noisy in Teams channels; prefer summaries with links or file outputs.

## Related Docs

- [Channel Integrations](../channels.md#microsoft-teams)
- [Gateway User Guide](../gateway-user-guide.md)
