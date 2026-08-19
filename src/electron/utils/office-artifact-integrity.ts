import * as fs from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";

export type OfficeArtifactFormat = "docx" | "pptx" | "xlsx";

export interface OfficeArtifactExpectation {
  format: OfficeArtifactFormat;
  expectedSlideCount?: number;
  allowTitleOnlySlideNumbers?: number[];
  minimumContentCharactersPerSlide?: number;
  expectedSheetCount?: number;
  expectedNonEmptySheetCount?: number;
  minimumTextCharacters?: number;
}

export interface OfficeArtifactIntegrityReport {
  passed: boolean;
  format: OfficeArtifactFormat;
  errors: string[];
  warnings: string[];
  observed: {
    slideCount?: number;
    blankSlideNumbers?: number[];
    titleOnlySlideNumbers?: number[];
    sheetCount?: number;
    nonEmptySheetCount?: number;
    formulaErrorCount?: number;
    textCharacters?: number;
  };
}

function decodeXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function visibleTextFromXml(xml: string, tagName: string): string {
  const expression = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  return Array.from(xml.matchAll(expression))
    .map((match) => decodeXmlText(match[1] || ""))
    .join("")
    .replace(/\s+/g, "")
    .trim();
}

function visibleTextRunsFromXml(xml: string, tagName: string): string[] {
  const expression = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  return Array.from(xml.matchAll(expression))
    .map((match) => decodeXmlText(match[1] || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function containsReplacementCharacters(text: string): boolean {
  return /\uFFFD|(?:ï¿½){1,}/.test(text);
}

function numericPart(fileName: string): number {
  const match = fileName.match(/(\d+)(?=\.xml$)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function officeExtension(format: OfficeArtifactFormat): string {
  return `.${format}`;
}

/**
 * Performs deterministic package-level checks that OfficeCLI's generic
 * validation cannot infer from the user's request: requested slide/sheet
 * counts, non-empty content, and the required OOXML parts for each format.
 */
export async function inspectOfficeArtifactIntegrity(
  filePath: string,
  expectation: OfficeArtifactExpectation,
): Promise<OfficeArtifactIntegrityReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const observed: OfficeArtifactIntegrityReport["observed"] = {};
  const expectedExtension = officeExtension(expectation.format);
  if (path.extname(filePath).toLowerCase() !== expectedExtension) {
    errors.push(
      `Expected ${expectedExtension} output, received ${path.extname(filePath) || "no extension"}.`,
    );
  }

  let archive: JSZip;
  try {
    const bytes = await fs.readFile(filePath);
    if (bytes.length === 0) throw new Error("file is empty");
    archive = await JSZip.loadAsync(bytes);
  } catch (error) {
    return {
      passed: false,
      format: expectation.format,
      errors: [
        ...errors,
        `The Office package could not be opened: ${error instanceof Error ? error.message : String(error)}`,
      ],
      warnings,
      observed,
    };
  }

  if (!archive.file("[Content_Types].xml")) {
    errors.push("The Office package is missing [Content_Types].xml.");
  }

  if (expectation.format === "docx") {
    const documentPart = archive.file("word/document.xml");
    if (!documentPart) {
      errors.push("The Word package is missing word/document.xml.");
    } else {
      const xml = await documentPart.async("string");
      const visibleText = visibleTextFromXml(xml, "w:t");
      const textCharacters = visibleText.length;
      observed.textCharacters = textCharacters;
      if (textCharacters < Math.max(1, expectation.minimumTextCharacters || 1)) {
        errors.push("The Word document does not contain the requested visible content.");
      }
      if (containsReplacementCharacters(visibleText)) {
        errors.push("The Word document contains replacement or mojibake characters.");
      }
    }
  }

  if (expectation.format === "pptx") {
    if (!archive.file("ppt/presentation.xml")) {
      errors.push("The PowerPoint package is missing ppt/presentation.xml.");
    }
    const slideFiles = Object.keys(archive.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
      .sort((a, b) => numericPart(a) - numericPart(b));
    observed.slideCount = slideFiles.length;
    if (
      typeof expectation.expectedSlideCount === "number" &&
      slideFiles.length !== expectation.expectedSlideCount
    ) {
      errors.push(
        `Expected ${expectation.expectedSlideCount} slides, but the package contains ${slideFiles.length}.`,
      );
    }
    const blankSlideNumbers: number[] = [];
    const titleOnlySlideNumbers: number[] = [];
    const allowTitleOnly = new Set(expectation.allowTitleOnlySlideNumbers || []);
    const minimumContentCharacters = Math.max(
      1,
      expectation.minimumContentCharactersPerSlide || 1,
    );
    for (const [index, slideName] of slideFiles.entries()) {
      const xml = await archive.file(slideName)!.async("string");
      const textRuns = visibleTextRunsFromXml(xml, "a:t");
      const visibleText = textRuns.join("");
      const hasText = visibleText.length > 0;
      const hasVisual = /<(?:p:pic|p:graphicFrame|a:blip)\b/i.test(xml);
      if (!hasText && !hasVisual) blankSlideNumbers.push(index + 1);
      const contentCharacters = textRuns.slice(1).join("").length;
      if (
        !allowTitleOnly.has(index + 1) &&
        !hasVisual &&
        contentCharacters < minimumContentCharacters
      ) {
        titleOnlySlideNumbers.push(index + 1);
      }
      if (containsReplacementCharacters(visibleText)) {
        errors.push(`Slide ${index + 1} contains replacement or mojibake characters.`);
      }
    }
    observed.blankSlideNumbers = blankSlideNumbers;
    observed.titleOnlySlideNumbers = titleOnlySlideNumbers;
    if (blankSlideNumbers.length > 0) {
      errors.push(`Blank slides detected: ${blankSlideNumbers.join(", ")}.`);
    }
    if (titleOnlySlideNumbers.length > 0) {
      errors.push(
        `Content slides with only a title detected: ${titleOnlySlideNumbers.join(", ")}.`,
      );
    }
  }

  if (expectation.format === "xlsx") {
    if (!archive.file("xl/workbook.xml")) {
      errors.push("The Excel package is missing xl/workbook.xml.");
    }
    const worksheetFiles = Object.keys(archive.files)
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
      .sort((a, b) => numericPart(a) - numericPart(b));
    observed.sheetCount = worksheetFiles.length;
    if (
      typeof expectation.expectedSheetCount === "number" &&
      worksheetFiles.length !== expectation.expectedSheetCount
    ) {
      errors.push(
        `Expected ${expectation.expectedSheetCount} worksheets, but the package contains ${worksheetFiles.length}.`,
      );
    }
    let nonEmptySheetCount = 0;
    let formulaErrorCount = 0;
    for (const worksheetName of worksheetFiles) {
      const xml = await archive.file(worksheetName)!.async("string");
      if (/<(?:[a-z][\w.-]*:)?(?:c|row|is)\b/i.test(xml)) {
        nonEmptySheetCount += 1;
      }
      const formulaErrors = xml.match(
        /#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/gi,
      );
      formulaErrorCount += formulaErrors?.length || 0;
      const worksheetText = decodeXmlText(xml);
      if (containsReplacementCharacters(worksheetText)) {
        errors.push(
          `Worksheet ${path.basename(worksheetName)} contains replacement or mojibake characters.`,
        );
      }
    }
    observed.nonEmptySheetCount = nonEmptySheetCount;
    observed.formulaErrorCount = formulaErrorCount;
    if (
      typeof expectation.expectedNonEmptySheetCount === "number" &&
      nonEmptySheetCount < expectation.expectedNonEmptySheetCount
    ) {
      errors.push(
        `Expected at least ${expectation.expectedNonEmptySheetCount} non-empty worksheets, but found ${nonEmptySheetCount}.`,
      );
    }
    if (formulaErrorCount > 0) {
      errors.push(`The workbook contains ${formulaErrorCount} formula error value(s).`);
    }
  }

  return {
    passed: errors.length === 0,
    format: expectation.format,
    errors,
    warnings,
    observed,
  };
}
