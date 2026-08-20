# Third-party notices

Presentation Studio includes original NeoWorker integration code and design
guidance adapted from the following MIT-licensed projects:

- MiniMax AI `pptx-generator` skill — existing Presentation Studio foundation.
- `siril9/presentation-skill`, commit
  `3a22eed290fa2205b6a1e2de5549b4429c5fffd0` — source-first deck planning,
  style routing, reproducible generation, and rendered QA concepts.
- `gnipbao/knowledge-cat-ppt-skill`, commit
  `889c3dc00b356607fa9af935eb807056c3394886` — story architecture, deck-plan
  contracts, evidence tracking, and quality-gate concepts.

The upstream repositories are not bundled wholesale. NeoWorker uses an
independently implemented planning contract and runtime validation so these
capabilities share one Presentation Studio source project and QA report.

The MIT license text is available in `LICENSE.txt`.
