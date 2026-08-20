# Batch: Full Guidance

## Intent

Use this workflow for multi-target transformations where work can be partitioned and run in parallel.

## Core Flow

1. Define objective and target set.
2. Partition work into independent units.
3. Plan execution order and parallel width.
4. Execute with bounded concurrency.
5. Validate each unit.
6. Aggregate results and blockers.

## Partitioning Rules

- Prefer units that can fail independently.
- Keep unit size small enough to retry quickly.
- Track unit status: pending, running, success, failed, blocked.

## Domain Notes

### Code

- Prefer isolated branches/worktrees when available.
- Run per-unit tests/checks before completion.
- Stop at branch/worktree + verified summary by default.
- Do not auto-open PRs unless explicitly requested.

### Writing / Docs

- Apply consistent template changes per file.
- Validate structure and readability after conversion.

### Research

- Normalize format and evidence sections per artifact.
- Preserve citations and key assumptions.

### Operations

- Apply config/runbook changes in staged waves.
- Keep rollback notes per unit.

## External Side Effects Policy

- `confirm`: draft external actions and ask for explicit approval.
- `execute`: proceed when tool policies allow.
- `none`: do not execute external actions.

## Output Template

- Batch plan (units, dependencies, concurrency)
- Execution summary table per unit
- Validation results
- Blockers and rollback notes
- Recommended next batch

## Safety

- Avoid irreversible external actions without policy alignment.
- Report partial completion clearly.
- Keep summaries auditable and concise.
