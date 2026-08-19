# Design QA: Homepage quick start

- Source visual truth: `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-32524122-23d6-46d9-8b63-ff4058c7c4c2.png`
- Implementation screenshot: `/tmp/neoworker-quick-start-actual.jpg`
- Focused implementation crop: `/tmp/neoworker-quick-start-crop.jpg`
- Combined comparison input: `/tmp/neoworker-quick-start-comparison.png`
- Viewport: Electron desktop window, light theme, 1389 x 769 screenshot pixels
- Source dimensions: 2009 x 691 pixels
- Implementation dimensions: 1389 x 769 full view; 540 x 200 focused crop
- Density normalization: source and focused crop were proportionally normalized to 1200 px width in the combined comparison input
- State: zh-CN, focused homepage, default quick-start cards, idle composer

## Full-view comparison evidence

The Electron capture confirms the redesigned section is placed directly below the primary composer and remains visually subordinate to the greeting and composer. The section uses the source layout vocabulary: tinted rounded frame, compact heading row, three equal action cards, color-coded icon tiles, category labels, and circular directional controls.

## Focused region comparison evidence

The combined comparison input places the source and implementation in one image. The normalized crops show matching overall aspect ratio, three-column proportions, card radii, border weight, title/description hierarchy, and green/blue/cyan semantic accents. The implementation retains the product's existing type family and adds the existing refresh control to the section header.

## Required fidelity surfaces

- Fonts and typography: hierarchy and optical weight match the source intent; product typography is preserved rather than replaced.
- Spacing and layout rhythm: frame padding, header-to-grid gap, equal columns, card padding, and footer placement match the source composition.
- Colors and tokens: the light blue frame, white cards, restrained borders, and three semantic accent colors map to existing application tokens and support dark mode.
- Image quality and asset fidelity: no raster artwork is required in this component. Existing library icons are used; no handcrafted SVG or CSS drawing replaces a source asset.
- Copy and content: title, subtitle, descriptions, and Chinese category labels match the reference direction and remain coherent in the application.
- Accessibility and behavior: cards remain semantic buttons with labels; refresh behavior is preserved; hover and active feedback is subtle; reduced-motion rules are included.

## Findings

- [P0] Final post-restart capture is blocked by macOS Keychain authorization.
  - Location: Electron startup, before `SecureSettingsRepository` initialization.
  - Evidence: the restarted process is waiting inside `SecItemCopyMatching`; macOS `SecurityAgent` is active and Computer Use is prohibited from operating that protected system window.
  - Impact: the final restarted application state cannot be captured until the user approves the Keychain prompt.
  - Fix: the user must approve the macOS Keychain access dialog, then capture the same homepage state again.

## Comparison history

1. Initial implementation capture: no actionable P1/P2 visual mismatch in the normalized quick-start region. The pre-restart capture still showed the previous in-memory Slack icon because React fast refresh preserved card state.
2. Fix applied: changed the Slack card to the library Slack icon and performed a full Electron restart so state will initialize from the latest card data.
3. Post-fix evidence: blocked pending the protected macOS Keychain approval described above.

## Implementation checklist

- Approve the macOS Keychain access dialog.
- Capture the restarted focused homepage.
- Confirm the Slack mark and default three cards.
- Re-run the combined comparison and update the final result.

## Follow-up polish

- None identified from the normalized pre-restart comparison.

final result: blocked

---

# Design QA: Active-session composer parity

- Source visual truth:
  - `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-bd74fb7d-3b8a-47e4-a0aa-145963954610.png`
  - `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-1ca59319-970f-4bcd-b673-cf5da319c38b.png`
- Implementation screenshot: `artifacts/design-qa/composer-unified-electron-actual.png`
- Focused implementation crop: `artifacts/design-qa/composer-unified-electron-normalized.jpg`
- Combined comparison input: `artifacts/design-qa/composer-reference-vs-electron.png`
- Viewport: NeoWorker Electron desktop window, light theme, 1223 x 768 screenshot pixels
- Reference dimensions: 1650 x 374 pixels (full-access state)
- Implementation dimensions: 1223 x 768 full view; 650 x 150 focused crop, proportionally normalized to 1650 px width
- State: zh-CN, active completed conversation, focused density, full-access permission mode, idle composer

## Full-view comparison evidence

The Electron capture confirms the active-session composer remains anchored beneath the conversation with the same 800 px content width and compact vertical rhythm as the homepage composer. No utility control is clipped, overlapped, or detached from its intended row.

## Focused region comparison evidence

The combined comparison places the homepage full-access reference above the active-session implementation. Both use one rounded input surface followed by an unframed utility row. The active-session implementation now matches the reference for the model sparkle icon, amber full-access treatment, microphone/send controls, execution and automation controls, and the `/ 技能` entry.

## Required fidelity surfaces

- Typography: existing NeoWorker type tokens and compact control sizing are preserved.
- Spacing and layout: editor row, footer controls, and detached utility row align to the homepage composition.
- Colors and borders: one quiet composer outline; no second framed rail; warning semantics remain visible for full access.
- Icons: existing Lucide icons are reused consistently; no placeholder or custom-drawn icon was introduced.
- Copy and behavior: active-session workspace copy remains truthful while the shared execution, domain, and skills controls remain functional.
- Accessibility: buttons retain labels, menu semantics, disabled states, and keyboard focus behavior.

## Findings

- No P0, P1, or P2 visual mismatch remains in the requested composer region.
- A post-restart Computer Use capture was unavailable because the Mac locked, but the same renderer state was captured and compared immediately before restart. The production renderer build passed, and Electron then restarted successfully from that build.

## Comparison history

1. Initial state: active sessions used an attached bordered utility rail, omitted the skills entry, hid the model icon at desktop width, and neutralized the full-access warning state.
2. Fix applied: switched the session utility row to the homepage unframed layout, restored shared semantic states, and rendered the same skills entry.
3. Electron comparison: the full-access reference and normalized active-session crop match in hierarchy, proportions, border treatment, and control inventory.
4. Verification: composer style tests passed 8/8, the renderer production build succeeded, and Electron restarted successfully.

## Follow-up polish

- None required for the requested parity fix.

final result: passed

---

# Design QA: Inline follow-up queue

- Source visual truth: `/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-b76a0a80-59ff-4ca0-99d9-2fb12c006130.png`
- Target state: active NeoWorker conversation with two or more deferred follow-up messages
- Viewport: NeoWorker Electron desktop window, light theme
- State implementation: queued follow-ups are rendered immediately above the active-session composer and backed by the Electron daemon queue

## Source-to-implementation review

The implementation follows the source hierarchy without copying Codex-specific repository metadata: compact stacked rows, a small leading handle and message/attachment tile, a single-line truncated instruction, an explicit “调整方向” action, delete, and an overflow menu. The queue shares the existing 800 px composer width, visually attaches to its top edge, uses the product's existing tokens, and caps the visible stack at four rows before scrolling.

## Required fidelity surfaces

- Typography and density: 12.5 px row copy, 34 px minimum row height, and compact 24–26 px controls mirror the source's restrained density.
- Layout: the queue is placed immediately before the session composer, centered to the same width, with a connected top-card silhouette rather than a detached toast.
- Colors and borders: existing NeoWorker background, border, primary, and muted-text tokens preserve light/dark theme compatibility.
- Icons: Lucide icons already used by the product provide handle, message, attachment, edit, delete, copy, and overflow actions.
- Behavior: queue items come from the real daemon queue; edit, remove, copy, Escape cancellation, outside-click menu dismissal, attachment cleanup, and deferred execution ordering are implemented.
- Responsive behavior: at narrow container widths the text label is hidden while the edit control remains available.

## Verification

- Renderer production build: passed.
- Electron TypeScript build: passed.
- Focused queue/composer tests: 11/11 passed.
- Electron startup after the final build: passed.

## Findings

- [P1] Final source-versus-implementation screenshot comparison remains blocked.
  - The real queued state depends on submitting a follow-up during a narrow active-execution window. During Computer Use verification the test tasks either completed/failed before a second message could be queued, entered approval-only states that disabled the composer, or the Electron window closed while resolving an approval.
  - No production-only fixture or fake queue state was added just to manufacture a screenshot.
  - The implementation is build- and interaction-complete; a final visual capture still requires a naturally long-running task with at least two queued follow-ups.

## Follow-up polish

- Capture the active queue at the user's normal display scale during a naturally long-running task, place it beside the source screenshot, and correct any optical mismatch in row height or composer overlap if found.

final result: blocked
