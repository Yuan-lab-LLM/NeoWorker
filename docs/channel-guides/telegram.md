# Telegram User Guide

Telegram is a strong power-user channel for NeoWorker. It offers native bot commands, DMs, groups, group routing controls, and good mobile ergonomics.

## Best For

- Users who want a native slash command menu.
- Personal bot chats.
- Groups with command-only or mention-based routing.
- Link-research rooms.
- Fast mobile follow-ups and approvals.

## Key Features

- Core NeoWorker commands in Telegram's `/` menu.
- Direct messages, groups, and topic/thread context where Telegram provides it.
- Group routing modes: all, mentions only, mentions or commands, commands only.
- Allowed group chat IDs.
- Per-group and per-topic specialization for workspace, agent role, guidance, and tool policy.
- Reactions and responsive draft-style assistant updates.
- Attachment and voice handling where supported.

## Daily Workflow

Use the Telegram slash menu for common lifecycle controls:

```text
/new
/stop
/queue Add tests for this too.
/steer Keep the change docs-only.
/background Summarize yesterday's issue activity.
```

In groups, mention the bot or use commands depending on the routing mode. In DMs, normal text is usually enough.

## Best Practices

- Use `/new` before switching topics.
- Use `/new temp` for one-off experiments.
- Use command-only routing in busy groups.
- Use topic specialization when one Telegram forum group hosts several distinct workflows.
- Use dedicated groups for research-link collection.
- Use `/task` or `/status` to understand what NeoWorker thinks is active before steering it.
- Keep approvals in DMs unless the group is trusted.

## Watch-Outs

- Group sessions are shared by the group chat, so multiple people can steer the same active task.
- Very permissive routing can turn normal conversation into task input.
- Long outputs may be better summarized in Telegram and inspected in NeoWorker.

## Related Docs

- [Channel Integrations](../channels.md#telegram)
- [Channel Specialization](../channels.md#channel-specialization)
- [Gateway User Guide](../gateway-user-guide.md)
- [Research Channels](../research-channels.md)
