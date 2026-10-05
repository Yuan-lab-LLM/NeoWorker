# Native layout workflow

New Presentation Studio projects use `layoutEngine: "catalog-v1"`. Complete the
brief and evidence register as before, then author each slide's `title`, `type`,
`layoutId: "auto"`, and `content` in `presentation-plan.json`. The build script
selects and renders native, editable PowerPoint objects. Do not create `.mjs`
slide modules in the same project.

Use `designFamily: "business"`, `"technology"`, or `"research"` for the whole
deck. The family determines the coherent color system, while the content
determines each slide's layout. All text uses the project's platform-safe fonts.
`theme.layoutColors` can override `primary`, `accent`, `muted`, `light`, and
`background` using six-digit hex values for requested branding.

## Content contracts

All layouts accept optional `subtitle`, `sourceNote` (short visible citation or
caveat), and `notes` (full sources or presenter notes). Strings are plain text.
No HTML, hidden fields, or inline styles. Each slide also has its existing
`index`, `id`, `role`, `intent`, `takeaway`, and `evidenceRefs` plan fields.

| Layout | Content fields | Use |
| --- | --- | --- |
| `cover-system` | `body`, `system` | Technical cover with source material, indexed knowledge and output |
| `branch-flow` | `body`, `flow` | 2–3 real branches converging into a merge and output |
| `document-transform` | `body`, `transformation` | Schematic document regions, processing stages and structured output |
| `mechanism-track` | `body`, `mechanisms`, `connected` | 2–4 illustrated mechanisms; connect only actual sequential steps |
| `evidence-stage` | `body`, exactly 3 `metrics`, required `sourceNote` | One primary metric and two supporting metrics with visible qualifications |
| `cover-image` | `body`, `image` | Product or subject image with title |
| `cover-type` | `body` | Typographic cover without invented imagery |
| `editorial-split` | `body`, `items` | One main point with 1–5 supporting items |
| `editorial-rows` | `body`, `items` | The same content in wider rows |
| `image-right`, `image-left` | `body`, `image` | An evidence image alongside prose |
| `image-wide` | `body`, `image` | Full-width original diagram/chart with a short interpretation |
| `image-gallery` | `body`, `images` | 2–4 original evidence images, complete aspect ratios and editable captions |
| `metrics-row` | `body`, `metrics` | 2–4 numeric callouts with units and caveats |
| `comparison-columns` | `body`, `columns` | 2–3 named alternatives |
| `table-focus` | `body`, `table` | Editable table, 2–5 columns, up to 7 data rows |
| `chart-focus` | `body`, `chart` | Editable bar/line chart with optional interpretation |
| `architecture-layers` | `body`, `layers` | 2–4 editable architectural layers |
| `process-steps` | `body`, `steps` | 2–6 numbered stages; 5–6 use two rows |
| `closing-statement` | `body`, optional `items` | Conclusion with up to 3 next steps |

`items`, `columns`, `layers`, and `steps` contain `{ "label": "…", "body": "…" }`.
`metrics` contain `{ "value": "32", "label": "DIMM 插槽", "detail": "DDR5 RDIMM" }`.
`image` is `{ "path": "slides/imgs/product.jpg", "alt": "产品正面", "source": "https://…", "fit": "contain" }`.
Use `contain` for product photos, diagrams and evidence; `cover` crops and should
only be used where losing an edge is acceptable. Use actual sourced imagery.

`images` is an array of 2–4 image objects, each with required `path`, `alt`,
`source`, and `caption`. Only `fit: "contain"` is supported in evidence galleries.
Use short captions and group related examples; use image-wide for a dense
architecture or product screenshot that needs the full slide width.

`table` is `{ "columns": ["项目", "规格"], "rows": [["机架", "2U"]], "columnWeights": [1, 3] }`.
Column weights are optional. Rows must have the exact column count. Keep units,
footnotes and configuration qualifications. No row or column is silently removed.

`chart` is `{ "type": "bar", "unit": "万元", "labels": ["方案 A", "方案 B"], "series": [{ "name": "预算", "values": [10, 12] }] }`.
Use 2–8 labels, 1–3 series, and only sourced numbers. Missing data must not become
zero. Keep chart labels short and explain caveats in `sourceNote` and `notes`.

## Example slide

Keep the scaffold's top-level fields. Complete `audience`, `purpose`,
`coreMessage`, and `narrative` (context, tension, resolution, callToAction).
`evidence` is an array of `{ "id": "source-01", "claim": "Specific supported fact", "source": "Source document and section" }`.
Each slide's `evidenceRefs` lists these IDs. `styleRoute.primaryGrammar` is one
of `answer-pyramid`, `evidence-plate`, `journey-map`, `editorial-spread`,
`thesis-stage`, `operating-grid`, `public-docket`, or `telemetry-canvas`.
Use `type: "cover"` for the opening, `type: "closing"` for the conclusion;
other types describe the content (process, architecture, comparison, evidence,
table, chart). `role`, `intent`, and `takeaway` are short descriptive strings.
The slide below is one entry in `slides`, not a replacement for the whole plan.

```json
{
  "index": 2,
  "id": "slide-02",
  "type": "comparison",
  "role": "comparison",
  "title": "两种部署方式",
  "intent": "Explain the deployment tradeoff",
  "takeaway": "Choose according to operational requirements",
  "evidenceRefs": ["source-01"],
  "layoutId": "auto",
  "content": {
    "columns": [
      {"label": "集中部署", "body": "统一管理资源。需要评估跨站点网络。"},
      {"label": "分布部署", "body": "贴近业务现场。需要维护多个站点。"}
    ],
    "sourceNote": "架构选择示意，需结合实际业务验证"
  }
}
```

## Capacity and repair

For DOCX/PPTX source material, scaffold with `--source "<file>"`. It registers
`sourceAssetManifests` in the plan and extracts original figures with nearby
text into `slides/imgs/`. The manifest includes original image dimensions when
readable; low-resolution labels need a native explanation or faithful redraw,
not stretching. Inspect the figures, then use their relative paths in
`content.image`; `source` identifies the original file and figure/section.
For an existing project, run `source-assets.mjs --source "<file>" --project-dir
"<project>"` and add the returned manifest filename to `sourceAssetManifests`.
Every extracted figure must appear in `content.image` or `content.images` with
its original bytes (a copied path is accepted). Native redraws supplement the
originals; they do not exempt the originals from the delivered PPTX. Use complete
contain views for evidence and add native explanation when the source is low-res.
For individual irrelevant assets, record a specific exclusion, for example:
```json
"sourceVisualReview": {
  "exclusions": [{
    "path": "slides/imgs/source-abc/figure-1.png",
    "category": "decorative",
    "reason": "Repeated letterhead icon with no technical or product information."
  }]
}
```
Categories: `decorative`, `duplicate` (an identical original must be retained),
`out-of-scope`, or `user-requested` (also requires `userInstruction` quoting the
explicit instruction). Inspect each image before excluding it. Never classify a
product screenshot, technical diagram or results chart as decorative merely
because it is low-res. Generic `native-redraw` / `not-relevant` waivers are not
accepted; partial reuse still reports all unaccounted figures.
This check tracks source use; it does not certify visual quality.

Run `validate_plan.mjs` before building. It checks content structure, selects
compatible layouts and estimates CJK/Latin wrapping at the intended font size.
It tries the alternate editorial layout if the first is too dense. An explicit
`layoutId` is respected. Unsupported content fields and overflow are errors.
The error names the slide and field, expected line count and available space.

Repair by rewriting for clarity without changing facts, using a compatible wider
layout, or splitting the slide when the requested slide count permits. Preserve
all required numbers, rows and sources. Never erase content to make validation
pass. Never shrink text automatically or silently increase the requested count.

Capacity is a conservative estimate, not a measurement of PowerPoint's font
renderer. When LibreOffice and pdftoppm are available, the build also checks the
rendered PDF for missing text, text outside its assigned frame and text overlaps.
`qa-report.json` records the selected layouts, frames and rendered measurements.
Rejected candidates stay in `.build/`, outside the delivery directory. Rendering
or measurement unavailability is reported explicitly; it is not a visual pass.
Bar charts include zero on their value axis. Tables and charts remain native.

The build keeps `visualInspection: "pending"`; after reviewing all PNGs, save a
separate visual-review receipt identifying the reviewed PPTX and preview files.
Passing automated checks alone is not a claim of visual quality or PowerPoint /
WPS compatibility. Native application verification is a separate check.

## Existing projects and custom designs

Existing module projects remain supported. For a user-requested custom design
that this catalog cannot represent, explicitly scaffold with
`--layout-engine modules` and use the previous native `createSlide` workflow.
Do not silently switch to that path to bypass a capacity error. Existing-deck
edits and translations continue to preserve the source PPTX. They must never be
routed through the new-deck catalog.

These layouts and the compiler are original NeoWorker code. Presenton's Template
V2 design informed the separation of content, geometry and capacity; Presenton's
templates, fonts, renderer and service are not bundled.

## Technical diagrams: choose relationships before prose

These fields generate native editable shapes, connectors and text. They are
schematic explanations, not fake product screenshots. All supplied labels and
bodies are checked for capacity. No field or branch is dropped. Use a short
conclusion as the title, a short subtitle, and original details in `notes`.
For unsupported geometry, use the deliberate module design workflow; do not
force unrelated content into a symbol or invent a branch to fill a layout.

**Cover:** `system` accepts 2–3 short source labels, a core and an output:

```json
{"system":{"inputs":["企业文档","表格与公式","专有知识"],"core":{"label":"知识检索","body":"解析与嵌入\n混合召回与重排"},"output":{"label":"来源可追溯","body":"结合企业知识生成\n保留来源供核验"}}}
```

Keep the cover title to two purposeful lines. The fragment matrix is a schematic,
not a chart of quantity or performance. Do not use this cover for unrelated topics.

**Branching architecture:** `flow` has `input`, 2–3 `branches`, `merge`, and
`output`. Each node is `{label, body}`. Short labels (about 2–6 CJK characters)
and at most two short lines per node keep the diagram readable.

```json
{"flow":{"input":{"label":"用户问题","body":"分析问题\n进入知识检索"},"branches":[{"label":"向量检索","body":"匹配语义相近的知识片段"},{"label":"关键词检索","body":"匹配术语与精确词项"}],"merge":{"label":"重排序","body":"按相关性\n调整候选顺序"},"output":{"label":"上下文\n与答案","body":"交由大模型生成\n关联原始来源"}}}
```

Do not use branches for a sequential process or claim concurrency from a logical
branch. Use `steps` for a longer ordered workflow and `layers` for grouped layers.

**Document transformation:** two labels, 2–4 content regions and 2–3 processing
stages. Region labels appear on the source schematic and the output. `body`
explains the output representation. Explicitly label the drawing as schematic.

```json
{"transformation":{"inputLabel":"非结构化文档","outputLabel":"结构化内容","regions":[{"label":"标题与段落","body":"保留层级与正文"},{"label":"表格","body":"还原行列关系"},{"label":"公式","body":"单独检测与识别"}],"stages":[{"label":"版面分析","body":"区分文档区域"},{"label":"专项识别","body":"分别处理文字、表格与公式"},{"label":"顺序还原","body":"合并段落并排序"}]},"body":"文档结构示意，非产品界面。"}
```

**Mechanisms:** each entry is `{kind, label, body}`. Supported symbols:
`document`, `layout`, `table`, `formula`, `vector`, `search`, `rank`, `shield`,
`publish`, `trace`. Use `connected: true` only for sequential relationships;
otherwise omit it or use false. Vector cells and rank bars are schematic, never
measured chart data. Keep source numbers in a real `chart` or `metrics` field.

```json
{"mechanisms":[{"kind":"layout","label":"文档解析","body":"保留布局、内容与结构。"},{"kind":"vector","label":"知识嵌入","body":"用向量表达知识片段。"},{"kind":"rank","label":"多级检索","body":"混合召回后进行重排。"}],"connected":true}
```

**Evidence:** `evidence-stage` requires exactly three numeric `metrics` and a
nonempty visible `sourceNote`. The first metric occupies the primary area.
Different units stay as callouts rather than misleading comparable bars. Three
metrics with a source note select this layout automatically; two/four use
`metrics-row`. Put full methodology in notes and essential caveats on the page.

For a technical deck, mix explanatory diagrams, evidence, narrative and detailed
reference pages. Do not repeat mechanism icons on every page or delete technical
substance to fit a layout. Inspect the actual exported slides to judge design.
