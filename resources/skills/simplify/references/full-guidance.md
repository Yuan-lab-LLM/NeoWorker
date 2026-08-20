# Simplify: Full Guidance

## Intent

Use this workflow when the user already has work-in-progress output and wants a tighter version with less noise.

## Execution Checklist

1. Confirm target and scope.
2. Capture the current baseline in 3-6 bullets.
3. Run a domain-specific simplification pass.
4. Preserve intent and behavior.
5. Return concise before/after deltas and next action.

## Domain Passes

### Code

- Remove duplication and dead paths.
- Reduce nesting and branching complexity.
- Improve naming and cohesion.
- Keep existing behavior stable.
- Add/adjust tests only when needed to protect behavior.

### Writing

- Cut redundant sentences.
- Prefer direct subject-verb structure.
- Keep one idea per paragraph.
- Reorder sections for decision-first reading.

### Research

- Lead with conclusions and confidence.
- Collapse low-signal context.
- Convert long prose to concise evidence bullets.
- Flag assumptions and unknowns explicitly.

### Operations

- Convert dense prose to step-based runbook actions.
- Reduce ambiguous instructions.
- Add rollback and failure paths.
- Highlight decision gates.

### General

- Keep essentials.
- Remove repetitive framing.
- Improve scannability.

## Output Template

- Simplified result
- What changed (before/after delta)
- Risks or tradeoffs
- Next action

## Safety

- Do not fabricate facts.
- Do not broaden scope without asking.
- Keep edits minimal and verifiable.
