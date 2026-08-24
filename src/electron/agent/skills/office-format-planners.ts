import type { CanonicalContentSnapshot } from "../../utils/office-content-model";
import type {
  OfficeCliContentBlock,
  OfficeCliSheetData,
  OfficeCliSlideContent,
} from "./officecli-artifact-builder";

export interface OfficePlanDiagnostic {
  level: "repair" | "warning";
  code: string;
  message: string;
  element?: string;
}

export interface OfficePlanResult<T> {
  value: T;
  diagnostics: OfficePlanDiagnostic[];
}

type ReferencedSlide = OfficeCliSlideContent & {
  factIds?: string[];
  sectionIds?: string[];
  datasetIds?: string[];
  factValues?: Record<
    string,
    { value?: string | number; unit?: string; asOf?: string }
  >;
};

function uniqueIds(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function factSummary(
  fact: CanonicalContentSnapshot["facts"][number],
): string {
  const measuredValue = [fact.value, fact.unit].filter(
    (value) => value !== undefined && String(value).trim(),
  ).join(" ");
  const qualifiers = [measuredValue, fact.asOf ? `截至 ${fact.asOf}` : ""]
    .filter(Boolean)
    .join(" · ");
  return qualifiers ? `${fact.statement}：${qualifiers}` : fact.statement;
}

function normalizedType(slide: ReferencedSlide, index: number): string {
  const explicit = String(slide.slideType || slide.layout || "").trim();
  if (index === 0) return explicit || "cover";
  if (explicit && !["titleContent", "twoColumn"].includes(explicit)) return explicit;
  if (slide.imagePath) return "image";
  if ((slide.data?.series || []).length > 0) return "chart";
  if ((slide.data?.rows || []).length > 0) return "table";
  if ((slide.data?.items || []).length > 0) {
    const numeric = slide.data?.items?.filter((item) =>
      /\d/.test(String(item.value ?? "")),
    ).length || 0;
    return numeric >= Math.ceil((slide.data?.items?.length || 1) / 2)
      ? "metric"
      : "timeline";
  }
  const contentCount = slide.content?.filter(Boolean).length || 0;
  if (explicit === "twoColumn" || contentCount === 2) return "comparison";
  if (contentCount === 3) return "process";
  return explicit || "content";
}

function citationNotes(
  slide: ReferencedSlide,
  snapshot?: CanonicalContentSnapshot,
): string {
  if (!snapshot || !slide.factIds?.length) return slide.notes || "";
  const sourceById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const factById = new Map(snapshot.facts.map((fact) => [fact.id, fact]));
  const citations = Array.from(
    new Map(
      slide.factIds
        .flatMap((factId) => factById.get(factId)?.sourceIds || [])
        .map((sourceId) => sourceById.get(sourceId))
        .filter((source): source is NonNullable<typeof source> => Boolean(source))
        .map((source) => [
          source.id,
          `${source.title}${source.url ? ` (${source.url})` : ""}`,
        ]),
    ).values(),
  );
  if (citations.length === 0) return slide.notes || "";
  return [slide.notes?.trim(), `Sources: ${citations.join("; ")}`]
    .filter(Boolean)
    .join("\n");
}

export function planOfficePresentation(
  slides: ReferencedSlide[],
  snapshot?: CanonicalContentSnapshot,
): OfficePlanResult<ReferencedSlide[]> {
  if (!Array.isArray(slides) || slides.length === 0) {
    throw new Error("At least one slide is required.");
  }
  const diagnostics: OfficePlanDiagnostic[] = [];
  const planned = slides.flatMap((originalSlide, index): ReferencedSlide[] => {
    let slide = originalSlide;
    const type = normalizedType(slide, index);
    let content = (slide.content || []).map((item) => String(item).trim()).filter(Boolean);
    const hasStructuredData = Boolean(
      slide.data &&
        ((slide.data.categories?.length || 0) > 0 ||
          (slide.data.series?.length || 0) > 0 ||
          (slide.data.headers?.length || 0) > 0 ||
          (slide.data.rows?.length || 0) > 0 ||
          (slide.data.items?.length || 0) > 0),
    );
    const allowsSparse = ["cover", "title", "section", "closing", "blank"].includes(type);
    if (!allowsSparse && !slide.imagePath && !hasStructuredData && content.length === 0) {
      const matchingSection = snapshot?.sections.find(
        (section) => section.title.trim().toLowerCase() === slide.title.trim().toLowerCase(),
      );
      const matchingFacts = matchingSection
        ? snapshot?.facts.filter((fact) => matchingSection.factIds.includes(fact.id)) || []
        : [];
      content = [
        matchingSection?.summary || "",
        ...matchingFacts.map(factSummary),
      ].filter(Boolean);
      if (content.length > 0 && matchingSection) {
        slide = {
          ...slide,
          sectionIds: uniqueIds([...(slide.sectionIds || []), matchingSection.id]),
          factIds: uniqueIds([...(slide.factIds || []), ...matchingSection.factIds]),
          datasetIds: uniqueIds([...(slide.datasetIds || []), ...matchingSection.datasetIds]),
        };
        diagnostics.push({
          level: "repair",
          code: "PPT_EMPTY_SLIDE_FILLED_FROM_SNAPSHOT",
          element: `slide-${index + 1}`,
          message: `Filled the empty slide from frozen section "${matchingSection.title}".`,
        });
      } else {
        diagnostics.push({
          level: "repair",
          code: "PPT_EMPTY_SLIDE_REMOVED",
          element: `slide-${index + 1}`,
          message: `Removed empty slide "${slide.title}" instead of publishing a sparse shell.`,
        });
        return [];
      }
    }
    if (type !== String(slide.slideType || slide.layout || "")) {
      diagnostics.push({
        level: "repair",
        code: "PPT_LAYOUT_INFERRED",
        element: `slide-${index + 1}`,
        message: `Selected ${type} layout from the slide's actual content structure.`,
      });
    }
    if (!allowsSparse && !hasStructuredData && content.join("").length < 32) {
      diagnostics.push({
        level: "warning",
        code: "PPT_LOW_DENSITY",
        element: `slide-${index + 1}`,
        message: "Slide content is unusually short and should be reviewed for decision-useful detail.",
      });
    }
    return [{
      ...slide,
      slideType: type,
      content,
      notes: citationNotes(slide, snapshot),
    }];
  });

  if (planned.length === 0) {
    throw new Error("No substantive slides remain after removing empty pages.");
  }

  if (snapshot) {
    const consumedSectionIds = new Set(planned.flatMap((slide) => slide.sectionIds || []));
    const consumedFactIds = new Set(planned.flatMap((slide) => slide.factIds || []));
    const consumedDatasetIds = new Set(planned.flatMap((slide) => slide.datasetIds || []));
    const missingSections = snapshot.sections.filter(
      (section) => !consumedSectionIds.has(section.id),
    );
    const missingFacts = snapshot.facts.filter((fact) => !consumedFactIds.has(fact.id));
    const missingDatasets = snapshot.datasets.filter(
      (dataset) => !consumedDatasetIds.has(dataset.id),
    );

    for (const [chunkIndex, sections] of chunked(missingSections, 4).entries()) {
      planned.push({
        title: chunkIndex === 0 ? "分析范围补充" : `分析范围补充 ${chunkIndex + 1}`,
        slideType: "content",
        content: sections.map((section) =>
          section.summary ? `${section.title}：${section.summary}` : section.title,
        ),
        sectionIds: sections.map((section) => section.id),
      });
    }

    for (const [chunkIndex, facts] of chunked(missingFacts, 6).entries()) {
      planned.push({
        title: chunkIndex === 0 ? "关键事实补充" : `关键事实补充 ${chunkIndex + 1}`,
        slideType: "content",
        content: facts.map(factSummary),
        factIds: facts.map((fact) => fact.id),
        factValues: Object.fromEntries(
          facts.map((fact) => [
            fact.id,
            { value: fact.value, unit: fact.unit, asOf: fact.asOf },
          ]),
        ),
      });
    }

    for (const dataset of missingDatasets) {
      planned.push({
        title: dataset.title,
        subtitle:
          dataset.rows.length > 12
            ? `展示前 12 行，共 ${dataset.rows.length} 行`
            : undefined,
        slideType: "table",
        data: {
          headers: dataset.headers,
          rows: dataset.rows.slice(0, 12),
        },
        datasetIds: [dataset.id],
      });
    }

    const repairedCount = missingSections.length + missingFacts.length + missingDatasets.length;
    if (repairedCount > 0) {
      diagnostics.push({
        level: "repair",
        code: "PPT_CONTENT_COVERAGE_COMPLETED",
        message: `Added compact appendix slides for ${repairedCount} frozen content item(s) that were not referenced by the draft.`,
      });
    }
  }

  // Break up monotonous runs while preserving data-driven layouts.
  const fallbackLayouts = ["content", "comparison", "process"];
  for (let index = 2; index < planned.length; index += 1) {
    const current = planned[index].slideType;
    if (
      current === planned[index - 1].slideType &&
      current === planned[index - 2].slideType &&
      current === "content"
    ) {
      const replacement = fallbackLayouts[index % fallbackLayouts.length];
      planned[index] = { ...planned[index], slideType: replacement };
      diagnostics.push({
        level: "repair",
        code: "PPT_REPETITIVE_LAYOUT_REPAIRED",
        element: `slide-${index + 1}`,
        message: `Changed a repeated content layout to ${replacement}.`,
      });
    }
  }

  if (planned.length >= 7) {
    const layouts = new Set(planned.map((slide) => slide.slideType));
    if (layouts.size < 3) {
      diagnostics.push({
        level: "warning",
        code: "PPT_LOW_LAYOUT_DIVERSITY",
        message: `Only ${layouts.size} layout type(s) are used across ${planned.length} slides; at least 3 are recommended.`,
      });
    }
  }
  return { value: planned, diagnostics };
}

function splitLongParagraph(text: string): string[] {
  if (text.length <= 520) return [text];
  const sentences = text.split(/(?<=[。！？.!?])\s*/u).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences.length > 1 ? sentences : [text]) {
    if (current && current.length + sentence.length > 420) {
      chunks.push(current);
      current = "";
    }
    current += sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function planOfficeDocument<T extends OfficeCliContentBlock>(
  content: T[],
  title?: string,
): OfficePlanResult<T[]> {
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error("Document content cannot be empty.");
  }
  const diagnostics: OfficePlanDiagnostic[] = [];
  const planned = [...content];
  if (planned[0]?.type !== "heading" || Number(planned[0]?.level || 0) !== 1) {
    planned.unshift({ type: "heading", level: 1, text: title || "报告" } as T);
    diagnostics.push({
      level: "repair",
      code: "DOCX_TITLE_INSERTED",
      element: "block-1",
      message: "Inserted a document title so the file has a stable heading hierarchy.",
    });
  }
  const expanded: T[] = [];
  planned.forEach((block, index) => {
    if (block.type !== "paragraph") {
      expanded.push(block);
      return;
    }
    const chunks = splitLongParagraph(String(block.text || "").trim());
    expanded.push(...chunks.map((text) => ({ ...block, text })));
    if (chunks.length > 1) {
      diagnostics.push({
        level: "repair",
        code: "DOCX_LONG_PARAGRAPH_SPLIT",
        element: `block-${index + 1}`,
        message: `Split one ${String(block.text || "").length}-character paragraph into ${chunks.length} readable paragraphs.`,
      });
    }
  });
  return { value: expanded, diagnostics };
}

export function planOfficeSpreadsheet<T extends OfficeCliSheetData>(
  sheets: T[],
): OfficePlanResult<T[]> {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error("At least one worksheet is required.");
  }
  const diagnostics: OfficePlanDiagnostic[] = [];
  const names = new Set<string>();
  const planned = sheets.map((sheet, index) => {
    if (!Array.isArray(sheet.data) || sheet.data.length === 0) {
      throw new Error(`Worksheet ${index + 1} ("${sheet.name}") has no data.`);
    }
    const base = String(sheet.name || `Sheet${index + 1}`).trim().slice(0, 27) || `Sheet${index + 1}`;
    let name = base;
    let suffix = 2;
    while (names.has(name.toLowerCase())) {
      name = `${base.slice(0, 27)}-${suffix}`;
      suffix += 1;
    }
    names.add(name.toLowerCase());
    if (name !== sheet.name) {
      diagnostics.push({
        level: "repair",
        code: "XLSX_DUPLICATE_SHEET_RENAMED",
        element: `sheet-${index + 1}`,
        message: `Renamed worksheet "${sheet.name}" to "${name}" to prevent an invalid duplicate name.`,
      });
    }
    return { ...sheet, name, hasHeader: sheet.hasHeader ?? true };
  });
  return { value: planned, diagnostics };
}
