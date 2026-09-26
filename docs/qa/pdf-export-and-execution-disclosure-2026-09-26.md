# PDF export and settled execution disclosure

## Reproduced failure

Read the local NeoWorker task `310ef90e-81d9-4f48-ba7c-51a67b99e47a` without modifying its database or workspace. The task ended after about 36 minutes, with 276 recorded tool calls and no final response (`contract_error`). The first full export failed at about 16.7 minutes on image resolution and page 4 text validation. From about 19.8 minutes onward, the page 4 rejection repeated, followed by fragment exports and a math-heading rejection. Fourteen diagnostic PDFs were registered as artifacts.

Reprinted the retained manuscript with the installed generator. The same page 4 rejection reproduced. Its extracted text had 1,175 characters, 519 letters/numbers, no replacement characters, and no detected mojibake. Formula layout inserted hundreds of spaces, bringing the old content ratio below 45% despite readable text.

## Changes

- Exclude whitespace from the visible-character corruption denominator. Apply repeated-word heuristics to prose rather than isolated formula/CJK glyphs. Real mojibake and repetitive garbage remain rejected.
- Read KaTeX once; verify heading prose and positioned formula text separately because PDF extraction order can differ from visual order. Missing prose and missing formula tokens still fail.
- `generate_document` supports `purpose=diagnostic`; legacy `diag_`/`diag-` filenames default to this purpose. These files go under `.neoworker/tmp/pdf-diagnostics` and are not registered as deliverables. Generation returns its quality report.
- Fold an entire settled user turn into one disclosure. Leave final replies, file cards, and the latest unresolved failure or approval outside it. Live turns and replay retain their existing behavior. Historic raw event details no longer expand by default. The disclosure unmounts its details while closed.
- Restore blue paper headings, the title rule, blue quote/table accents and a more compact page layout, keeping FangSong/Times New Roman. Keep duplicate-title removal.

## Validation

- PDF text/generator, document-tools and PDF delivery integration suites passed (68 tests before the UI additions); the final PDF text/generator + disclosure + timeline visibility/action-block suites passed (45 tests, including 7 new turn-disclosure cases).
- Electron TypeScript and renderer production builds passed. Full renderer typecheck still reports pre-existing errors, so a clean repository-wide typecheck is not claimed.
- The retained manuscript exported once in about 12 seconds: 37 pages with the pre-style-adjustment layout; 35 pages with restored styling. Every final page rendered and passed the text/layout/image-resolution gates. This is export validation of saved content, not a new translation or semantic translation audit.
- Native Electron math-heading regression passed. Visually inspected the formerly rejected formula page, the math-heading sample and restored first page.
- Browser fixture using the production disclosure and grouping function: active 12-row process becomes one closed row on completion; final answer/file stay visible; mouse and keyboard expansion work. Verified after reload as well. Fixture screenshot: `output/pdf-failure-qa/process-collapsed.png`.
- No installer built or installed. No source manuscript, existing artifact, or user database was changed.

Local QA artifacts (ignored output directory): `output/pdf-failure-qa/repro.pdf`, `verified-render.pdf`, `restored-style.pdf`, `math-heading.pdf`, and their page previews.
