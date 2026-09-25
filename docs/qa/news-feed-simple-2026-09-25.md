# Cover-free News Feed validation — 2026-09-25

The existing production component uses one text card layout across arXiv, Hugging Face, and GitHub, with bundled official logos, restrained source labels, and the app's soft-blue accent. Removed the cover component and its image loading effects/styles; retained source settings and task handoffs.

## Validation

- Renderer production build passed; existing large-chunk advisory remains.
- Focused lint passed without errors or warnings.
- Browser harness rendered the real React component, app styles, and nine cached public feed items with in-memory IPC substitutes.
- Verified three/two/one columns at 1500/1000/560-pixel panel widths, Chinese/light and English/dark screenshots, and no horizontal document overflow.
- Verified bookmarks, search, source filtering, GitHub settings, expandable abstracts, PDF translation and repository reading task handoffs.
- No cover elements, no cover API calls, and no renderer exceptions.

This is a local UI validation, not a live upstream network test or a rebuilt installer. The preceding macOS installer still contains the earlier cover layout.
