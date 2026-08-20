# Twitch User Guide

Twitch is best for public or semi-public livestream chat interaction where NeoWorker should respond with concise text.

## Best For

- Stream chat interaction.
- Moderator-controlled prompts.
- Public audience Q&A with clear boundaries.
- Lightweight commands during live sessions.

## Key Features

- IRC chat integration over WebSocket.
- Multi-channel support.
- Text-only replies.
- Automatic splitting for longer responses.
- Twitch rate-limit aware behavior.

## Daily Workflow

Use short, explicit prompts:

```text
/new
Summarize the current stream topic in one paragraph.
```

For serious tasks, restrict who can trigger NeoWorker or route the work to a private channel.

## Best Practices

- Treat public chat as untrusted input.
- Use moderator-only or command-only workflows for task starts.
- Keep outputs short.
- Avoid approvals, private data, or sensitive file work in Twitch chat.
- Move deeper work to a private NeoWorker session.

## Watch-Outs

- Twitch has strict rate limits and message length limits.
- No file attachments.
- Public messages may be logged, clipped, or repeated outside your control.

## Related Docs

- [Channel Integrations](../channels.md#twitch)
- [Gateway User Guide](../gateway-user-guide.md)
