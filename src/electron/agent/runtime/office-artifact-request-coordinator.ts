import {
  hashCanonicalContentSnapshot,
  validateCanonicalContentSnapshot,
  type CanonicalContentSnapshot,
} from "../../utils/office-content-model";

export type CoordinatedOfficeArtifactFormat = "docx" | "pptx" | "xlsx";

type OfficeArtifactResult = {
  success?: boolean;
  path?: string;
  [key: string]: unknown;
};

type CoordinatedJob = {
  promise: Promise<OfficeArtifactResult>;
};

const DEFAULT_REQUEST_IDENTITY = "default";

const OFFICE_FILE_EXTENSION_REGEX = /\.(?:docx|pptx|xlsx)$/i;
const OFFICE_REVISION_SUFFIX_REGEX =
  /(?:[\s._-]*(?:v(?:er(?:sion)?)?|rev(?:ision)?)\s*\d+(?:\.\d+)*|[\s._-]*(?:copy|副本)\s*\d*|[\s._-]*(?:新版|修订版|第[一二三四五六七八九十百0-9]+版))$/iu;

function normalizeArtifactFamilyName(value: unknown): string {
  const raw = String(value || "")
    .trim()
    .normalize("NFC")
    .replace(/\\/g, "/");
  const basename = raw.split("/").pop() || raw;
  let family = basename.replace(OFFICE_FILE_EXTENSION_REGEX, "").trim();

  // Models frequently append v2/rev2 after deciding to "improve" an already
  // valid artifact. Treat that as the same delivery family inside one explicit
  // user request. A new user follow-up resets the coordinator, so an explicitly
  // requested later revision is still allowed.
  let previous = "";
  while (family && family !== previous) {
    previous = family;
    family = family.replace(OFFICE_REVISION_SUFFIX_REGEX, "").trim();
  }

  return family.toLocaleLowerCase("en-US").replace(/\s+/g, " ") || "default";
}

function normalizeVariantToken(value: unknown): string {
  return String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

/**
 * Presentation workflows can intentionally generate visually different files
 * from the same source content. Keep those variants in separate coordinator
 * slots so an advanced request can never reuse an earlier standard deck.
 */
function buildPresentationVariantIdentity(
  format: CoordinatedOfficeArtifactFormat,
  input: Record<string, unknown> | null | undefined,
): string {
  if (format !== "pptx") return "";

  const variant = [
    ["mode", input?.generationMode],
    ["workflow", input?.presentationWorkflow],
    ["visual", input?.visualMode],
    ["profile", input?.officeProfile],
  ]
    .map(([key, value]) => {
      const normalized = normalizeVariantToken(value);
      return normalized ? `${key}=${normalized}` : "";
    })
    .filter(Boolean)
    .join("|");

  return variant ? `:variant:${variant}` : "";
}

/**
 * Build a stable identity for one requested Office deliverable.
 *
 * Content is deliberately excluded. Using the whole payload made a later,
 * lossy rewrite (for example fewer spreadsheet rows plus a `v2` filename)
 * look like a second user request and caused both files to be published.
 * Distinct semantic filenames remain distinct, while automatic v2/copy
 * suffixes share the first successful writer result for this request boundary.
 */
export function buildOfficeArtifactRequestIdentity(
  format: CoordinatedOfficeArtifactFormat,
  input: Record<string, unknown> | null | undefined,
): string {
  const presentationVariant = buildPresentationVariantIdentity(format, input);
  const explicitIdentity = String(
    input?.artifactRequestKey || input?.deliveryKey || "",
  ).trim();
  if (explicitIdentity) {
    return `explicit:${format}:${explicitIdentity.normalize("NFC")}${presentationVariant}`;
  }

  const family = normalizeArtifactFamilyName(
    input?.filename || input?.outputPath || input?.path || input?.title,
  );
  return `family:${format}:${family}${presentationVariant}`;
}

/**
 * A ToolRegistry may survive several explicit follow-ups. Only calls with the
 * same format and the same normalized request identity are idempotent. Format
 * alone is not sufficient: a task may legitimately create two different DOCX
 * files, and returning the first file for the second request is data loss.
 */
export class OfficeArtifactRequestCoordinator {
  private readonly jobs = new Map<string, CoordinatedJob>();
  private contentMode: "snapshot" | "legacy" | null = null;
  private snapshotId: string | null = null;
  private snapshotHash: string | null = null;

  private bindContentSnapshot(
    format: CoordinatedOfficeArtifactFormat,
    snapshot?: CanonicalContentSnapshot,
  ): void {
    const isExistingFormat = Array.from(this.jobs.keys()).some((key) =>
      key.startsWith(`${format}:`),
    );
    if (snapshot) {
      validateCanonicalContentSnapshot(snapshot);
      const incomingHash = hashCanonicalContentSnapshot(snapshot);
      if (this.contentMode === "legacy" && !isExistingFormat) {
        throw new Error(
          "Multi-format Office requests must start with one shared contentSnapshot. The earlier format was created without one; restart the request with the same snapshot for DOCX, PPTX, and XLSX.",
        );
      }
      if (
        this.snapshotId &&
        !isExistingFormat &&
        (this.snapshotId !== snapshot.snapshotId || this.snapshotHash !== incomingHash)
      ) {
        throw new Error(
          `Office formats in one request must reuse the identical frozen contentSnapshot. Expected "${this.snapshotId}", received "${snapshot.snapshotId}" or different facts.`,
        );
      }
      this.contentMode = "snapshot";
      this.snapshotId = snapshot.snapshotId;
      this.snapshotHash = incomingHash;
      return;
    }

    if (this.contentMode === "snapshot" && !isExistingFormat) {
      throw new Error(
        `contentSnapshot "${this.snapshotId}" is required for every Office format in this request.`,
      );
    }
    if (this.contentMode === null) this.contentMode = "legacy";
    if (this.contentMode === "legacy" && this.jobs.size > 0 && !isExistingFormat) {
      throw new Error(
        "Multi-format Office requests require one shared contentSnapshot before generating DOCX, PPTX, or XLSX.",
      );
    }
  }

  async run(
    format: CoordinatedOfficeArtifactFormat,
    operation: () => Promise<OfficeArtifactResult>,
    contentSnapshot?: CanonicalContentSnapshot,
    requestIdentity = DEFAULT_REQUEST_IDENTITY,
  ): Promise<OfficeArtifactResult> {
    this.bindContentSnapshot(format, contentSnapshot);
    const normalizedIdentity = String(requestIdentity || DEFAULT_REQUEST_IDENTITY).trim();
    const jobKey = `${format}:${normalizedIdentity || DEFAULT_REQUEST_IDENTITY}`;
    const existing = this.jobs.get(jobKey);
    if (existing) {
      const result = await existing.promise;
      return {
        ...result,
        reusedExistingArtifact: true,
        message:
          typeof result.message === "string" && result.message.trim()
            ? result.message
            : "沿用本轮已生成的 Office 文件，未重复创建。",
      };
    }

    const promise = operation();
    this.jobs.set(jobKey, { promise });
    try {
      const result = await promise;
      if (result?.success === false) {
        this.jobs.delete(jobKey);
        if (this.jobs.size === 0) this.resetContentBinding();
      }
      return result;
    } catch (error) {
      this.jobs.delete(jobKey);
      if (this.jobs.size === 0) this.resetContentBinding();
      throw error;
    }
  }

  private resetContentBinding(): void {
    this.contentMode = null;
    this.snapshotId = null;
    this.snapshotHash = null;
  }

  clear(format?: CoordinatedOfficeArtifactFormat): void {
    if (format) {
      for (const key of this.jobs.keys()) {
        if (key.startsWith(`${format}:`)) this.jobs.delete(key);
      }
      if (this.jobs.size === 0) this.resetContentBinding();
      return;
    }
    this.jobs.clear();
    this.resetContentBinding();
  }
}
