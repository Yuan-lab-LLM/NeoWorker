# Signal User Guide

Signal is best for privacy-sensitive mobile control of NeoWorker, especially with strict sender policies and trusted users.

## Best For

- Privacy-sensitive direct messages.
- Small trusted groups.
- Mobile-first task starts and approvals.
- Users who need encrypted transport.

## Key Features

- signal-cli integration.
- Direct and group sender policies.
- Allowlist support.
- Trust modes for identity keys.
- Native or daemon operating mode.

## Daily Workflow

Use direct messages for normal task control:

```text
/new
Summarize this document in five bullets.
```

In groups, use commands deliberately:

```text
/queue Add the security note too.
```

## Best Practices

- Use a dedicated Signal number for production.
- Use allowlists for DMs and groups.
- Keep approvals in direct chats.
- Choose trust mode deliberately; manual trust is safer but requires more work.
- Use command-first routing in groups.

## Watch-Outs

- Registering signal-cli can deregister an existing Signal app using that number.
- Identity key changes need attention.
- Signal is not ideal for very long formatted output.

## Related Docs

- [Channel Integrations](../channels.md#signal)
- [Gateway User Guide](../gateway-user-guide.md)
