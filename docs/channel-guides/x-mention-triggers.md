# X Mention Triggers User Guide

X mention triggers are best for allowlisted public or semi-public task intake using a command prefix.

## Best For

- Lightweight social task triggers.
- Public intake from trusted allowlisted authors.
- Temporary-workspace tasks based on mentions.
- Workflows where replies are reviewed before public posting.

## Key Features

- Mention polling through Bird CLI.
- Command prefix enforcement, defaulting to `do:`.
- Author allowlists.
- Idempotent task creation by tweet ID.
- Temporary workspace routing by default.
- No automatic outbound posting unless explicitly enabled.

## Daily Workflow

An allowlisted author mentions the account with the configured prefix:

```text
@yourbot do: summarize this thread and extract action items
```

NeoWorker creates one task for the mention and avoids duplicate work for the same tweet ID.

## Best Practices

- Keep the allowlist tight.
- Use a clear command prefix.
- Treat public content as untrusted input.
- Keep tasks in temporary workspaces unless the workflow is reviewed.
- Keep automatic outbound posting disabled unless you explicitly need it.

## Watch-Outs

- Mentions may be public.
- Polling interval and API/network behavior affect latency.
- Do not route public input into private workspaces without review.
- Social context can be incomplete, quoted, or adversarial.

## Related Docs

- [Channel Integrations](../channels.md#x-twitter)
- [X Mention Triggers](../x-mention-triggers.md)
