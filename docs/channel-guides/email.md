# Email User Guide

Email is best for asynchronous task intake, long-form requests, filtered automation, and attachment-heavy workflows.

## Best For

- Users who prefer email to chat.
- Long task descriptions with attachments.
- Subject-filtered task intake.
- Sender/domain allowlisted automation.
- Recurring mailbox summaries and triage.

## Key Features

- IMAP/SMTP support for many providers.
- Provider presets.
- Microsoft OAuth for Outlook.com-family personal accounts.
- Reply threading.
- Sender/domain allowlists.
- Subject filters.
- Attachment ingestion.
- LOOM protocol support where configured.

## Daily Workflow

Send one task per thread when possible:

```text
Subject: [NeoWorker] Review vendor proposal

Please summarize the attached proposal, list risks, and draft three negotiation points.
```

Use clear subject prefixes and include the desired final output.

## Best Practices

- Use a dedicated subject prefix such as `[NeoWorker]`.
- Configure allowed senders or domains.
- Keep one request per email thread.
- Attach relevant files directly.
- Include workspace or project context in the email.
- Use scheduled mailbox summaries for recurring workflows.

## Watch-Outs

- Email is slower than real-time chat because it uses polling.
- Authentication requirements vary by provider.
- Avoid broad open sender policies.
- Outlook.com personal accounts require Microsoft OAuth rather than password auth.

## Related Docs

- [Channel Integrations](../channels.md#email)
- [Inbox Agent](../inbox-agent.md)
- [Gateway User Guide](../gateway-user-guide.md)
