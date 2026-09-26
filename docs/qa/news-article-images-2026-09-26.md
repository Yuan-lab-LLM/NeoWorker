# Selective article images — 2026-09-26

## Behavior

- Text view remains the default. Technology and business categories expose an optional, remembered “图文视图” toggle.
- MIT AI, Qbit, EE Times China, GitHub Blog and Huxiu individual source filters also expose the toggle. Their original categories remain unchanged.
- The aggregate feed (all categories + all sources) remains text-only and never requests covers.
- Images load near the viewport through the existing trusted item-ID IPC and bounded main-process cache. The renderer receives compressed JPEG data, not external image URLs.
- Source images use a 16:9 area. Cards retain equal heights and aligned footer actions. Missing covers have no broken-image element, site-logo substitution or empty cover placeholder.
- MIT RSS media and article-specific HTML thumbnails are extracted during a normal refresh. Existing cached items can fall back to article metadata. Qbit's static social icons are excluded in favor of images scoped to its article body.
- Reuses the bundled PDF canvas decoder when macOS nativeImage cannot decode CDN WebP. No additional runtime dependency.

## Validation

- 59 focused tests passed across image scope, publisher parsing, cover cache/security, WebP conversion and IPC. The changed cover policy was retested after final adjustments.
- Renderer production build and Electron TypeScript build passed.
- Repository-wide type check still reports existing errors; none reference the changed news files. Full log: `output/news-images-qa/typecheck.log`.
- Live integration uses actual Electron `fetchWithSystemProxy`, `PaperNewsCovers`, publisher parsers and image renderer. Saved output: `output/news-images-qa/results.json`.
  - MIT AI: 3/3 sampled article images downloaded and decoded.
  - Huxiu: 3/3 sampled article images downloaded and decoded.
  - GitHub Blog: 1/3 sampled article images downloaded and decoded (WebP response). Two samples supplied generic logo covers and were correctly omitted.
  - Qbit: article-body media extraction verified on actual HTML, but the CDN returned 403; no reliable image delivery verified.
  - EE Times China: current environment returned HTTP/2/protocol errors. The source's article-thumbnail route is supported, but live image delivery remains unverified.
- Browser preview renders the production PaperNewsPanel with captured live data and a test cover IPC stub; no model calls.
  - Huxiu desktop: three card heights all 507.625 px; footer bottoms all 1026.3125 px.
  - Mixed GitHub Blog results: one image, two text fallbacks; equal heights and footer positions.
  - Returning to aggregate feed removed images without increasing request count.
  - 560 px viewport: single 518 px column, document width 560 px, no horizontal overflow.
- Screenshots: `output/news-images-qa/desktop.png`, `output/news-images-qa/narrow.png`.

## Release state

Source implementation only. No new macOS installer was produced for this request.
