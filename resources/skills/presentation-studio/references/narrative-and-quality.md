# Narrative and quality contract

Presentation Studio uses a story-first planning layer before slide geometry.
This contract combines the strongest reusable ideas from `presentation-skill`
and Knowledge Cat while keeping one NeoWorker-native build pipeline.

## 1. Start with a deck brief

Resolve these fields before authoring slides:

- audience and decision context
- purpose and delivery setting
- one deck-level `coreMessage`
- evidence burden and source constraints
- target slide count and language
- desired visual direction, including any forbidden style cues

Do not ask the user for information already present in the task or source files.
When a missing choice changes the result materially, record the assumption in
the plan and make it visible in the final handoff.

## 2. Build a narrative spine

Every non-trivial deck needs a progression, not a list of topics:

1. Opening: establish the audience's question or desired outcome.
2. Context: show what is true now.
3. Tension: identify the gap, risk, conflict, or opportunity.
4. Evidence: prove the argument with sourced facts and comparisons.
5. Resolution: show the recommended answer or future state.
6. Action: finish with a decision, next step, or memorable conclusion.

Short decks may combine adjacent stages, but they must still have an opening,
turn, and landing. A section title alone is not a narrative role.

## 3. Give every slide one job

Each item in `presentation-plan.json` must define:

- `role`: its narrative role or semantic page type
- `intent`: what the slide must accomplish
- `takeaway`: the one sentence the audience should remember
- `evidenceRefs`: stable references into the evidence register
- `assetIntent`: the visual object required to carry the meaning

Do not move into detailed layout while the takeaway is ambiguous. Avoid three
consecutive slides with the same role or silhouette.

## 4. Keep an evidence register

Evidence-bearing claims must be represented in the plan before rendering. Use
stable IDs and record the source URL/file, retrieval date when relevant, and
the slide IDs that consume the evidence. Never use image generation to invent
numbers, screenshots, product interfaces, citations, or factual diagrams.

If a source cannot be verified, label the claim as an assumption or remove it.

## 5. Route to a visual grammar

Select exactly one primary grammar from `style-routing.md`. It owns the page
system, hierarchy, reading path, density, and core semantic layouts. Up to two
secondary influences may contribute bounded treatments such as image framing
or chart annotation; they must not replace the primary grammar.

A palette is not a grammar. A visual redesign must change structure and
information placement when the content job changes.

## 6. Run four QA passes

1. **Planning QA**: brief, narrative, slide roles, evidence references, and
   style route are complete.
2. **Package QA**: the PPTX opens, slide count matches, placeholders are gone,
   and required editable objects exist.
3. **Geometry QA**: no clipping, collisions, off-canvas elements, unreadable
   fonts, weak contrast, or misleading chart scales.
4. **Rendered visual QA**: inspect every slide image at full size and at
   thumbnail scale; verify hierarchy, pacing, density, variety, and coherence.

Fix the source project and rebuild. Do not patch the generated PPTX when source
modules are available. A valid package without rendered inspection is not a
fully verified deck.
