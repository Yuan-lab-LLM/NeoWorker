# News Hub sources, brands and scroll containment — 2026-09-25

## Scope

- Add separate anonymous Hugging Face Models / Datasets feeds to Open source, including independent preferences, cache, bookmarks, canonical links and card-specific action drafts.
- Bundle official marks for all 27 directory entries, including 23 connected providers; render them in cards, source filters, directory and preference controls.
- Contain visually hidden labels and preference navigation within the feed scrollport.

## Evidence

- Live production PaperNewsService and fetchWithSystemProxy in an isolated Electron profile: both official Hub endpoints returned HTTP 200. Each fetched 60 candidates; default 14-day filtering retained 48 models and 35 datasets. Cache reload retained all 83. Results vary over time.
- 75 tests passed across news adapters, service, publisher parsers, preferences, IPC and navigation. Five new Hub cases cover both sources, canonical links, metadata, old-config migration, filtering, anonymous requests, cache/bookmark restore, 429 retention and disabled-source behavior.
- Electron TypeScript compilation passed. Repository-wide renderer type checking still reports pre-existing errors outside the changed files; no diagnostics were reported in the changed feature files.
- Browser fixture uses production components/styles and the live Hub snapshot. Model fetch order saved as downloads; dataset order remained trending. Source filters displayed separate counts. All displayed images loaded. Local official logo gallery checked in light and dark themes.
- Regression reproduced before repair: a 720px viewport had an outer document height of 42,930px, and PageDown moved the sidebar to -358px. After repair outer height stayed equal to viewport, root scroll stayed zero and sidebar stayed fixed when scrolling long results or opening/closing preferences. Also rechecked at the browser's 1,040px viewport height.
- UI preview uses a mock IPC bridge; backend live fetching and persistence were separately exercised above. No model execution, weight downloads or full dataset downloads were needed.

Local live reports and fixtures: `output/hf-hub-2026-09-25/`. Build and packaged-app verification results are retained alongside the delivered DMG.
