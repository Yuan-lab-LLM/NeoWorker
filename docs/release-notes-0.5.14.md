# Release Notes 0.5.14

This page summarizes the product changes included in `0.5.14`, based on changes merged after `v0.5.13` on 2026-03-28.

## Overview

The 0.5.14 release turns Inbox Agent into a cross-channel relationship workspace. It adds manual contact identity linking, reply routing through the most active connected channel, Mission Control handoff for inbox threads, and mailbox-native automation flows. The release also consolidates Google Workspace helpers, refreshes inbox and settings surfaces, and updates the product visuals and docs to match the current state of the app.

## What Changed

### Inbox Agent and Contact Identity

- **Unified contact identity**: Inbox Agent now treats a person as a cross-channel identity instead of a single email thread. The new identity flow can search by name, email, phone, handle, or CRM id, then link Slack, Teams, WhatsApp, Signal, iMessage, and CRM handles to the same contact.
- **Reply routing**: the inbox can surface the best reply target first when a contact is more active in Slack, Teams, WhatsApp, Signal, or iMessage than in email.
- **Relationship timeline**: the research rail now merges email and linked-channel history into a single relationship timeline with channel preference hints.
- **Contact settings**: a dedicated contact identity settings surface makes manual review and linking available from Settings.

### Mission Control and Mailbox Automation

- **Mission Control handoff**: important threads can be turned into company issues with mailbox context, assigned to an operator, and handed off without losing inbox traceability.
- **Automation hub**: mailbox rules, reminder cadences, and patrol schedules are now represented as explicit mailbox automation objects instead of only ad hoc inbox behavior.
- **Thread-level automation actions**: inbox threads can create tasks, schedule review flows, wake agents, or become Mission Control issues from the same workspace.

### Google Workspace and Messaging Plumbing

- **Shared Google Workspace helpers**: Gmail, Calendar, and Drive helpers were consolidated into shared utilities so inbox, settings, and background flows use the same workspace primitives.
- **OAuth normalization**: Google Workspace token flow handling was tightened to keep connector-backed auth stable across the inbox pipeline.
- **Mailbox signal propagation**: inbox events now propagate through mailbox, trigger, playbook, briefing, and knowledge-graph paths more directly.

### Heartbeat V3, Briefing, and Planning

- **Heartbeat input**: mailbox and scheduling signals now feed Heartbeat v3 and related planning/briefing flows more directly.
- **Mission Control summaries**: the Mission Control surface shows more issue context and inbox automation state so operators can see what happened without opening the thread first.
- **Planner and briefing updates**: strategic planning and daily briefing surfaces were refreshed to incorporate the newer inbox workflow and related signals.

### UI, Branding, and Documentation

- **Inbox and settings UI**: the inbox panel, settings surfaces, workspace selector, and mission control views were updated to support the new contact identity and handoff workflow.
- **Visual refresh**: new hero, logo, and favicon assets were added for the current brand set, along with refreshed app screenshots.
- **Docs synchronization**: README, docs home, feature docs, use-case examples, project status, and comparison docs were updated to reflect current product counts and workflows.

## Notes

- Identity linking is intentionally conservative. Ambiguous matches require review instead of auto-linking.
- Reply routing only exposes real conversation targets that have been linked or observed as active.
- Mission Control handoffs stay traceable to the source inbox thread.
- This page is the canonical summary for the changes included in `0.5.14`.
