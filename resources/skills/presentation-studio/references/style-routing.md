# Style routing catalog

Choose one primary grammar from the audience, argument, evidence shape, and
delivery setting. Use color and decoration only after this routing decision.

| Grammar | Best for | Structural signature |
| --- | --- | --- |
| `answer-pyramid` | board, executive, consulting, investor decisions | answer first, supporting reasons, evidence, decision |
| `evidence-plate` | science, research, clinical, technical proof | claim, figure/table, annotation, method/source |
| `journey-map` | roadmaps, processes, histories, transformations | states over time, transitions, milestones, future state |
| `editorial-spread` | biographies, culture, brand stories, documentaries | paced chapters, strong crops, pull quotes, asymmetric spreads |
| `thesis-stage` | product launches, keynotes, vision and marketing | large thesis moments, demonstrations, reveals, memorable close |
| `operating-grid` | finance, KPIs, dashboards, operating reviews | metric hierarchy, comparisons, trends, decisions and owners |
| `public-docket` | policy, legal, compliance, public-sector work | issue, stakeholder, evidence, options, source-forward conclusion |
| `telemetry-canvas` | incidents, monitoring, operations, postmortems | current state, signal, timeline, root cause, action and status |

## Routing rules

- Select the primary grammar before authoring slide modules.
- Record the decision and rationale under `styleRoute` in
  `presentation-plan.json`.
- Use at most two secondary influences, each limited to a named treatment.
- Never rotate styles slide by slide just to create novelty.
- Charts, tables, timelines, comparisons, decisions, and references require
  their own semantic layouts inside the chosen grammar.
- A user-supplied template may constrain colors and typography, but it does not
  remove the need to select the content grammar.

Run `node scripts/validate_plan.mjs --project-dir "<project dir>"` before the
first final build. Planning warnings must be resolved or explicitly reported.
