# Slack User Guide

Slack is best for workplace teams that coordinate in channels, DMs, and mentions. It works well for shared operational workflows, lightweight approvals, and curated progress updates.

## Best For

- Team channels where NeoWorker should help with shared work.
- DMs for personal tasks and approvals.
- Recurring summaries and operational updates.
- Multi-workspace Slack installations.
- Curated progress in channels where status visibility matters.

## Key Features

- Socket Mode integration.
- DM and `@mention` routing.
- Registered Slack slash command payload routing.
- Multiple Slack workspace installations in one NeoWorker profile.
- File uploads.
- Editable progress messages for curated progress mode.
- Minimal or curated progress relay settings.
- Per-channel specialization for workspace, agent role, guidance, and tool policy.

## Daily Workflow

In DMs, send normal text to start work. In channels, mention NeoWorker or use registered slash commands:

```text
/new
/stop
/queue Add the release note too.
/steer Keep this customer-facing.
/background Summarize open launch blockers.
```

Slack only sends slash commands that are registered in the Slack app. If `/new` or `/stop` does not reach NeoWorker, register that command in Slack first.

## Best Practices

- Use DMs for private work and approvals.
- Use channel mentions for shared tasks.
- Register the core slash commands your team actually uses.
- Use minimal progress in busy channels.
- Use curated progress in operational channels where short updates help.
- Keep each recurring workflow tied to a clear channel.
- Specialize high-signal channels such as support, launch, or review channels so new tasks start in the right workspace automatically.

## Watch-Outs

- Slack slash commands are not automatic; each command must be registered in Slack.
- Socket Mode needs the right app-level token and bot token.
- Broad channel access can make NeoWorker visible in places where it should not operate.
- Long generated content is usually easier to review in NeoWorker than in Slack.

## Related Docs

- [Channel Integrations](../channels.md#slack)
- [Channel Specialization](../channels.md#channel-specialization)
- [Gateway User Guide](../gateway-user-guide.md#slack-tips)
- [Gateway Message Lifecycle](../gateway-message-lifecycle.md)
