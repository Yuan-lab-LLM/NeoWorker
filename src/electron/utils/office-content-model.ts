import { createHash, randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

export const OFFICE_CONTENT_SCHEMA_VERSION = "1.0";

export type OfficeArtifactFormat = "docx" | "pptx" | "xlsx";
export type ContentConfidence = "high" | "medium" | "low";

export interface SourceRecord {
  id: string;
  title: string;
  url?: string;
  publisher?: string;
  accessedAt?: string;
}

export interface ContentFact {
  id: string;
  statement: string;
  value?: string | number;
  unit?: string;
  asOf?: string;
  sourceIds: string[];
  confidence: ContentConfidence;
  critical?: boolean;
}

export interface ContentSection {
  id: string;
  title: string;
  summary?: string;
  factIds: string[];
  datasetIds: string[];
  required?: boolean;
}

export interface DataSet {
  id: string;
  title: string;
  headers: string[];
  rows: unknown[][];
  sourceIds: string[];
  asOf?: string;
  unit?: string;
  required?: boolean;
}

export interface CanonicalContentSnapshot {
  schemaVersion: typeof OFFICE_CONTENT_SCHEMA_VERSION;
  snapshotId: string;
  frozenAt: string;
  title: string;
  executiveSummary: string[];
  facts: ContentFact[];
  sections: ContentSection[];
  datasets: DataSet[];
  sources: SourceRecord[];
  caveats: string[];
}

export interface ContentConsumption {
  format: OfficeArtifactFormat;
  elementId: string;
  sectionIds?: string[];
  factIds?: string[];
  datasetIds?: string[];
}

export interface ContentOmission {
  kind: "section" | "fact" | "dataset";
  id: string;
  reason: string;
}

export interface OfficeContentCoverageReport {
  snapshotId: string;
  format: OfficeArtifactFormat;
  criticalFactCoverage: number;
  generalCoverage: number;
  consumedSectionIds: string[];
  consumedFactIds: string[];
  consumedDatasetIds: string[];
  missingCriticalFactIds: string[];
  missingRequiredSectionIds: string[];
  missingRequiredDatasetIds: string[];
  omissions: ContentOmission[];
  passed: boolean;
  issues: string[];
}

export interface FormatFactProjection {
  format: OfficeArtifactFormat;
  factId: string;
  value?: string | number;
  unit?: string;
  asOf?: string;
  elementId: string;
}

export interface OfficeContentConsistencyReport {
  snapshotId: string;
  passed: boolean;
  issues: string[];
}

function normalizedText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function stableValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return normalizedText(value).replace(/,/g, "").toLowerCase();
}

function assertUniqueIds(label: string, values: Array<{ id: string }>): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = normalizedText(value.id);
    if (!id) throw new Error(`${label} contains an empty id.`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate id "${id}".`);
    seen.add(id);
  }
}

function assertReferences(
  label: string,
  references: string[],
  validIds: Set<string>,
): void {
  for (const reference of references) {
    if (!validIds.has(reference)) {
      throw new Error(`${label} references unknown id "${reference}".`);
    }
  }
}

export function validateCanonicalContentSnapshot(
  snapshot: CanonicalContentSnapshot,
): CanonicalContentSnapshot {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Canonical content snapshot is required.");
  }
  if (snapshot.schemaVersion !== OFFICE_CONTENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported content snapshot schema "${String(snapshot.schemaVersion)}". Expected ${OFFICE_CONTENT_SCHEMA_VERSION}.`,
    );
  }
  if (!normalizedText(snapshot.snapshotId)) throw new Error("snapshotId is required.");
  if (!normalizedText(snapshot.title)) throw new Error("Snapshot title is required.");
  if (!Number.isFinite(Date.parse(snapshot.frozenAt))) {
    throw new Error("frozenAt must be an ISO date.");
  }
  for (const key of ["executiveSummary", "facts", "sections", "datasets", "sources", "caveats"] as const) {
    if (!Array.isArray(snapshot[key])) throw new Error(`${key} must be an array.`);
  }

  assertUniqueIds("sources", snapshot.sources);
  assertUniqueIds("facts", snapshot.facts);
  assertUniqueIds("sections", snapshot.sections);
  assertUniqueIds("datasets", snapshot.datasets);

  const sourceIds = new Set(snapshot.sources.map((source) => source.id));
  const factIds = new Set(snapshot.facts.map((fact) => fact.id));
  const datasetIds = new Set(snapshot.datasets.map((dataset) => dataset.id));
  for (const fact of snapshot.facts) {
    if (!normalizedText(fact.statement)) {
      throw new Error(`Fact "${fact.id}" has no statement.`);
    }
    if (!["high", "medium", "low"].includes(fact.confidence)) {
      throw new Error(`Fact "${fact.id}" has invalid confidence.`);
    }
    assertReferences(`Fact "${fact.id}"`, fact.sourceIds || [], sourceIds);
  }
  for (const section of snapshot.sections) {
    if (!normalizedText(section.title)) {
      throw new Error(`Section "${section.id}" has no title.`);
    }
    assertReferences(`Section "${section.id}" facts`, section.factIds || [], factIds);
    assertReferences(
      `Section "${section.id}" datasets`,
      section.datasetIds || [],
      datasetIds,
    );
  }
  for (const dataset of snapshot.datasets) {
    if (!normalizedText(dataset.title)) {
      throw new Error(`Dataset "${dataset.id}" has no title.`);
    }
    if (!Array.isArray(dataset.headers) || !Array.isArray(dataset.rows)) {
      throw new Error(`Dataset "${dataset.id}" must contain headers and rows arrays.`);
    }
    assertReferences(`Dataset "${dataset.id}"`, dataset.sourceIds || [], sourceIds);
  }
  return snapshot;
}

export function createCanonicalContentSnapshot(
  input: Omit<CanonicalContentSnapshot, "schemaVersion" | "snapshotId" | "frozenAt"> &
    Partial<Pick<CanonicalContentSnapshot, "snapshotId" | "frozenAt">>,
): CanonicalContentSnapshot {
  const snapshot: CanonicalContentSnapshot = {
    ...input,
    schemaVersion: OFFICE_CONTENT_SCHEMA_VERSION,
    snapshotId: input.snapshotId || randomUUID(),
    frozenAt: input.frozenAt || new Date().toISOString(),
  };
  return validateCanonicalContentSnapshot(snapshot);
}

export function hashCanonicalContentSnapshot(
  snapshot: CanonicalContentSnapshot,
): string {
  validateCanonicalContentSnapshot(snapshot);
  return createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");
}

export function buildOfficeContentCoverageReport(
  snapshot: CanonicalContentSnapshot,
  format: OfficeArtifactFormat,
  consumption: ContentConsumption[],
  omissions: ContentOmission[] = [],
): OfficeContentCoverageReport {
  validateCanonicalContentSnapshot(snapshot);
  const consumedSectionIds = new Set<string>();
  const consumedFactIds = new Set<string>();
  const consumedDatasetIds = new Set<string>();
  for (const item of consumption.filter((entry) => entry.format === format)) {
    item.sectionIds?.forEach((id) => consumedSectionIds.add(id));
    item.factIds?.forEach((id) => consumedFactIds.add(id));
    item.datasetIds?.forEach((id) => consumedDatasetIds.add(id));
  }

  const criticalFacts = snapshot.facts.filter(
    (fact) => fact.critical || fact.confidence === "high",
  );
  const requiredSections = snapshot.sections.filter((section) => section.required);
  const requiredDatasets = snapshot.datasets.filter((dataset) => dataset.required);
  const missingCriticalFactIds = criticalFacts
    .filter((fact) => !consumedFactIds.has(fact.id))
    .map((fact) => fact.id);
  const missingRequiredSectionIds = requiredSections
    .filter((section) => !consumedSectionIds.has(section.id))
    .map((section) => section.id);
  const missingRequiredDatasetIds = requiredDatasets
    .filter((dataset) => !consumedDatasetIds.has(dataset.id))
    .map((dataset) => dataset.id);

  const allContentIds = new Set<string>([
    ...snapshot.sections.map((section) => `section:${section.id}`),
    ...snapshot.facts.map((fact) => `fact:${fact.id}`),
    ...snapshot.datasets.map((dataset) => `dataset:${dataset.id}`),
  ]);
  const consumedContentIds = new Set<string>([
    ...Array.from(consumedSectionIds, (id) => `section:${id}`),
    ...Array.from(consumedFactIds, (id) => `fact:${id}`),
    ...Array.from(consumedDatasetIds, (id) => `dataset:${id}`),
  ]);
  const criticalFactCoverage =
    criticalFacts.length === 0
      ? 1
      : (criticalFacts.length - missingCriticalFactIds.length) / criticalFacts.length;
  const generalCoverage =
    allContentIds.size === 0
      ? 1
      : Array.from(allContentIds).filter((id) => consumedContentIds.has(id)).length /
        allContentIds.size;
  const issues: string[] = [];
  if (missingCriticalFactIds.length > 0) {
    issues.push(`Missing critical facts: ${missingCriticalFactIds.join(", ")}.`);
  }
  if (missingRequiredSectionIds.length > 0) {
    issues.push(`Missing required sections: ${missingRequiredSectionIds.join(", ")}.`);
  }
  if (missingRequiredDatasetIds.length > 0) {
    issues.push(`Missing required datasets: ${missingRequiredDatasetIds.join(", ")}.`);
  }
  if (generalCoverage < 0.95) {
    issues.push(`General content coverage is ${(generalCoverage * 100).toFixed(1)}%; 95% is required.`);
  }
  return {
    snapshotId: snapshot.snapshotId,
    format,
    criticalFactCoverage,
    generalCoverage,
    consumedSectionIds: Array.from(consumedSectionIds),
    consumedFactIds: Array.from(consumedFactIds),
    consumedDatasetIds: Array.from(consumedDatasetIds),
    missingCriticalFactIds,
    missingRequiredSectionIds,
    missingRequiredDatasetIds,
    omissions,
    passed: issues.length === 0,
    issues,
  };
}

export function inspectOfficeContentConsistency(
  snapshot: CanonicalContentSnapshot,
  projections: FormatFactProjection[],
): OfficeContentConsistencyReport {
  validateCanonicalContentSnapshot(snapshot);
  const facts = new Map(snapshot.facts.map((fact) => [fact.id, fact]));
  const issues: string[] = [];
  for (const projection of projections) {
    const fact = facts.get(projection.factId);
    if (!fact) {
      issues.push(
        `${projection.format}:${projection.elementId} references unknown fact "${projection.factId}".`,
      );
      continue;
    }
    if (
      projection.value !== undefined &&
      fact.value !== undefined &&
      stableValue(projection.value) !== stableValue(fact.value)
    ) {
      issues.push(
        `${projection.format}:${projection.elementId} changes fact "${fact.id}" from "${String(fact.value)}" to "${String(projection.value)}".`,
      );
    }
    if (
      projection.unit !== undefined &&
      fact.unit !== undefined &&
      normalizedText(projection.unit).toLowerCase() !==
        normalizedText(fact.unit).toLowerCase()
    ) {
      issues.push(`${projection.format}:${projection.elementId} changes unit for fact "${fact.id}".`);
    }
    if (
      projection.asOf !== undefined &&
      fact.asOf !== undefined &&
      normalizedText(projection.asOf) !== normalizedText(fact.asOf)
    ) {
      issues.push(`${projection.format}:${projection.elementId} changes as-of date for fact "${fact.id}".`);
    }
  }
  return { snapshotId: snapshot.snapshotId, passed: issues.length === 0, issues };
}

export async function persistCanonicalContentSnapshot(
  workspacePath: string,
  snapshot: CanonicalContentSnapshot,
): Promise<string> {
  validateCanonicalContentSnapshot(snapshot);
  const directory = path.join(workspacePath, ".neoworker", "office-snapshots");
  const finalPath = path.join(directory, `${snapshot.snapshotId}.json`);
  const tempPath = path.join(directory, `${snapshot.snapshotId}.${randomUUID()}.tmp`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  try {
    await fs.link(tempPath, finalPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
    const existing = JSON.parse(await fs.readFile(finalPath, "utf8")) as CanonicalContentSnapshot;
    if (hashCanonicalContentSnapshot(existing) !== hashCanonicalContentSnapshot(snapshot)) {
      throw new Error(
        `Content snapshot "${snapshot.snapshotId}" already exists with different frozen facts. Create a new snapshotId.`,
      );
    }
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  return finalPath;
}
