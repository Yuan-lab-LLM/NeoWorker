# LINE User Guide

LINE is best for mobile-first workflows in teams or communities where LINE is the primary chat app.

## Best For

- LINE official account workflows.
- Mobile-first task intake.
- Customer or community conversations.
- Regions and teams where LINE is the standard messaging channel.

## Key Features

- LINE Messaging API integration.
- Webhook-based inbound events.
- Reply messages and push messages.
- Text and supported media handling.

## Daily Workflow

Use concise mobile-friendly messages:

```text
/new
Turn this customer note into a polite response.
```

Use `/commands` for available controls and `/stop` to cancel active work.

## Best Practices

- Use reply-message flows for normal interactions when possible.
- Use allowlists or pairing for controlled access.
- Keep outputs concise for mobile readers.
- Be deliberate about push-message usage.
- Use `/new` before changing topics.

## Watch-Outs

- Reply tokens expire quickly.
- Push messages can consume monthly quota.
- Webhook URL and channel secret must stay correct.

## Related Docs

- [Channel Integrations](../channels.md#line)
- [Gateway User Guide](../gateway-user-guide.md)
