type InputRecord = Record<string, any>;

function asText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).trim();
}

function compactText(values: unknown[]): string[] {
  return values.map(asText).filter(Boolean);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? compactText(value) : [];
}

function normalizeSlideData(slide: InputRecord): InputRecord {
  const explicit =
    slide.data && typeof slide.data === "object" && !Array.isArray(slide.data)
      ? slide.data
      : {};
  const chart =
    slide.chart && typeof slide.chart === "object" && !Array.isArray(slide.chart)
      ? slide.chart
      : {};
  const table =
    slide.table && typeof slide.table === "object" && !Array.isArray(slide.table)
      ? slide.table
      : {};
  const metrics = Array.isArray(slide.metrics) ? slide.metrics : [];
  const timeline = Array.isArray(slide.timeline) ? slide.timeline : [];
  const data: InputRecord = {
    categories: explicit.categories || chart.categories || [],
    series: explicit.series || chart.series || [],
    headers: explicit.headers || table.headers || [],
    rows: explicit.rows || table.rows || [],
    items: explicit.items || metrics || timeline || [],
  };
  const supportedDataKeys = new Set(["categories", "series", "headers", "rows", "items"]);
  const unsupportedDataKeys = Object.keys(explicit).filter(
    (key) => !supportedDataKeys.has(key),
  );
  if (unsupportedDataKeys.length > 0) {
    throw new Error(
      `Unsupported presentation field at slides[].data.${unsupportedDataKeys[0]}`,
    );
  }
  return data;
}

function normalizeSlideContent(slide: InputRecord): string[] {
  const content = Array.isArray(slide.content)
    ? slide.content
    : typeof slide.content === "string"
      ? slide.content
          .split(/\r?\n/)
          .map((line: string) => line.replace(/^[-*•]\s*/, "").trim())
          .filter(Boolean)
      : [];
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  const quote = slide.quote
    ? [slide.attribution ? `${slide.quote} — ${slide.attribution}` : slide.quote]
    : [];
  const data = normalizeSlideData(slide);

  const categories = Array.isArray(data.categories)
    ? compactText(data.categories)
    : [];
  const categoryLine = categories.length > 0
    ? [`Categories: ${categories.join(" · ")}`]
    : [];
  const seriesLines = Array.isArray(data.series)
    ? data.series.map((series: InputRecord) => {
        const values = Array.isArray(series?.values) ? series.values : [];
        const points = values.map((value: unknown, index: number) =>
          categories[index]
            ? `${categories[index]} ${asText(value)}`
            : asText(value),
        );
        return compactText([series?.name, points.join(" · ")]).join(": ");
      })
    : [];
  const headerLine = Array.isArray(data.headers) && data.headers.length > 0
    ? [compactText(data.headers).join(" · ")]
    : [];
  const rowLines = Array.isArray(data.rows)
    ? data.rows.map((row: unknown) =>
        Array.isArray(row) ? compactText(row).join(" · ") : asText(row),
      )
    : [];
  const itemLines = Array.isArray(data.items)
    ? data.items.map((item: InputRecord) =>
        compactText([item?.label, item?.value, item?.detail]).join(" · "),
      )
    : [];

  return compactText([
    ...content,
    ...bullets,
    ...quote,
    ...categoryLine,
    ...seriesLines,
    ...headerLine,
    ...rowLines,
    ...itemLines,
  ]);
}

export function normalizePresentationArtifactInput(input: InputRecord): any {
  const assetsById = new Map<string, InputRecord>(
    (Array.isArray(input?.assets) ? input.assets : [])
      .filter((asset: InputRecord) => asset?.id)
      .map((asset: InputRecord) => [String(asset.id), asset]),
  );
  const slides = (Array.isArray(input?.slides) ? input.slides : []).map(
    (slide: InputRecord, index: number) => {
      const allowedSlideKeys = new Set([
        "title",
        "subtitle",
        "content",
        "bullets",
        "quote",
        "attribution",
        "data",
        "metrics",
        "timeline",
        "chart",
        "table",
        "image",
        "imagePath",
        "layout",
        "layoutHint",
        "slideType",
        "visualBrief",
        "intent",
        "notes",
        "sectionIds",
        "factIds",
        "datasetIds",
        "factValues",
      ]);
      const unsupportedKey = Object.keys(slide || {}).find(
        (key) => !allowedSlideKeys.has(key),
      );
      if (unsupportedKey) {
        throw new Error(`Unsupported presentation field at slides[${index}].${unsupportedKey}`);
      }
      const referencedAsset = slide?.image?.id
        ? assetsById.get(String(slide.image.id))
        : undefined;
      const rawImagePath =
        slide?.image?.path || referencedAsset?.path || slide?.imagePath;
      return {
        title: asText(slide?.title) || `Slide ${index + 1}`,
        subtitle: slide?.subtitle,
        content: normalizeSlideContent(slide),
        data: normalizeSlideData(slide),
        imagePath: rawImagePath,
        layout: slide?.layout || slide?.layoutHint,
        slideType: slide?.slideType,
        visualBrief: slide?.visualBrief || slide?.intent,
        notes: slide?.notes,
        sectionIds: stringArray(slide?.sectionIds),
        factIds: stringArray(slide?.factIds),
        datasetIds: stringArray(slide?.datasetIds),
        factValues: slide?.factValues,
      };
    },
  );

  return {
    filename: input?.filename,
    generationMode: input?.generationMode,
    presentationWorkflow: input?.presentationWorkflow,
    workflowArtifactRoot: input?.workflowArtifactRoot,
    officeProfile: input?.officeProfile,
    templateId: input?.templateId,
    useCase: input?.useCase,
    title: input?.title,
    author: input?.author,
    audience: input?.audience,
    tone: input?.tone,
    visualMode: input?.visualMode,
    styleBrief: input?.styleBrief,
    themeColor: input?.themeColor || input?.brand?.primaryColor || input?.theme?.primaryColor,
    accentColor: input?.accentColor || input?.brand?.accentColor || input?.theme?.accentColor,
    titleColor:
      input?.titleColor || input?.brand?.titleColor || input?.theme?.titleColor,
    contentSnapshot: input?.contentSnapshot,
    slides,
  };
}

export function normalizeSpreadsheetArtifactInput(input: InputRecord): any {
  return {
    filename: input?.filename,
    officeProfile: input?.officeProfile,
    templateId: input?.templateId,
    useCase: input?.useCase,
    sheets: (Array.isArray(input?.sheets) ? input.sheets : []).map(
      (sheet: InputRecord, index: number) => {
        if (Array.isArray(sheet?.data)) {
          return {
            name: String(sheet?.name || `Sheet${index + 1}`),
            data: sheet.data,
            columnWidths: sheet?.columnWidths,
            hasHeader: sheet?.hasHeader,
            sectionIds: stringArray(sheet?.sectionIds),
            factIds: stringArray(sheet?.factIds),
            datasetIds: stringArray(sheet?.datasetIds),
            factValues: sheet?.factValues,
          };
        }
        const headers = Array.isArray(sheet?.headers) ? sheet.headers : [];
        const rows = Array.isArray(sheet?.rows) ? sheet.rows : [];
        return {
          name: String(sheet?.name || `Sheet${index + 1}`),
          data: headers.length > 0 ? [headers, ...rows] : rows,
          columnWidths: sheet?.columnWidths,
          hasHeader: headers.length > 0,
          sectionIds: stringArray(sheet?.sectionIds),
          factIds: stringArray(sheet?.factIds),
          datasetIds: stringArray(sheet?.datasetIds),
          factValues: sheet?.factValues,
        };
      },
    ),
    contentSnapshot: input?.contentSnapshot,
  };
}

export function normalizeDocumentArtifactInput(input: InputRecord): any {
  return {
    filename: input?.filename,
    format: input?.format,
    officeProfile: input?.officeProfile,
    templateId: input?.templateId,
    useCase: input?.useCase,
    contentSnapshot: input?.contentSnapshot,
    content: (Array.isArray(input?.content) ? input.content : []).map(
      (block: InputRecord, index: number) => {
        const allowedBlockKeys = new Set([
          "type",
          "text",
          "level",
          "items",
          "rows",
          "language",
          "sectionIds",
          "factIds",
          "datasetIds",
          "factValues",
        ]);
        const unsupportedKey = Object.keys(block || {}).find(
          (key) => !allowedBlockKeys.has(key),
        );
        if (unsupportedKey) {
          throw new Error(`Unsupported document field at content[${index}].${unsupportedKey}`);
        }
        return {
          ...block,
          sectionIds: stringArray(block?.sectionIds),
          factIds: stringArray(block?.factIds),
          datasetIds: stringArray(block?.datasetIds),
        };
      },
    ),
  };
}
