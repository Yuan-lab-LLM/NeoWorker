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

## Design reference

`presenton/presenton` Template V2 informed the separation of typed content,
curated layouts and content capacity in the native layout catalog. The catalog
and compiler are independently implemented NeoWorker code. No Presenton source
templates, fonts, export runtime or other assets are distributed with this feature.

## Native template engine

The template-v1 adapter calls the separately bundled MIT-licensed PPT Master
by HugoHe (Copyright 2025–2026 HugoHe, https://github.com/hugohe3/ppt-master).
Its original license, attribution and integrity checks remain in `../ppt-master/`.
NeoWorker adds immutable template imports, explicit content bindings, capacity
checks and integration with Presentation Studio's renderer. The original native
clone/fill engine owns the OOXML writes.
