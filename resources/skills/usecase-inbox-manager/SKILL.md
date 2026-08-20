---
name: usecase-inbox-manager
description: "Triage Inbox Agent Today lanes, search mailbox evidence, prepare manual or AI-assisted replies, and suggest cleanup automations with strict confirmation gates."
---

# Inbox Manager

## Purpose

Triage Inbox Agent Today lanes, search mailbox evidence, prepare manual or AI-assisted replies, and suggest cleanup automations with strict confirmation gates.

## Prerequisite

- A real mailbox connection is required through Gmail, AgentMail, or the Email channel.
- If no mailbox is connected, stop immediately and ask the user to connect one in Settings.
- Never inspect workspace files, task history, or unrelated local artifacts as a substitute for mailbox data.

## Routing

- Use when: Use when the user asks to triage Inbox Agent, review Today lanes, search mailbox evidence, draft or manually prepare replies/forwards, and suggest cleanup automations with strict confirmation gates.
- Do not use when: Do not use when the request is asking for planning documents, high-level strategy, or non-executable discussion; use the relevant planning or design workflow instead.
- Outputs: Outcome from Inbox Manager: prioritized Today-lane plan, evidence-backed mailbox findings, safe reply/forward drafts, cleanup recommendations, and explicit next-step actions.
- Success criteria: Produces actionable inbox triage with clear confirmation boundaries and no fabricated tool-side behavior.

## Trigger Examples

### Positive

- Use the usecase-inbox-manager skill for this request.
- Help me with inbox manager.
- Use when the user asks to triage inbox, draft replies, and suggest cleanup automations with strict confirmation gates.
- Inbox Manager: provide an actionable result.

### Negative

- Do not use when the request is asking for planning documents, high-level strategy, or non-executable discussion; use the relevant planning or design workflow instead.
- Do not use usecase-inbox-manager for unrelated requests.
- This request is outside inbox manager scope.
- This is conceptual discussion only; no tool workflow is needed.

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| mode | select | No | Inbox manager mode |
| message_limit | number | No | Maximum number of messages to inspect |
| time_window | string | No | Lookback window (e.g., "24h", "3d") |
| output_format | select | No | How to format the final report |

## Runtime Prompt

- Current runtime prompt length: 1236 characters.
- Runtime prompt is defined directly in `../usecase-inbox-manager.json`.
