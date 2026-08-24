import * as fs from "fs";
import * as path from "path";
import type {
  FileProvenanceRecord,
  FileProvenanceSourceKind,
  FileTrustLevel,
} from "../../shared/types";
import { getUserDataDir } from "../utils/user-data-dir";

const REGISTRY_DIR = path.join(getUserDataDir(), "security");
const REGISTRY_PATH = path.join(REGISTRY_DIR, "file-provenance.json");
const MAX_RECORDS = 5000;

type FileProvenanceRegistryState = {
  records: Record<string, FileProvenanceRecord>;
};

let cache: FileProvenanceRegistryState | null = null;

function normalizePath(filePath: string): string {
  return path.resolve(String(filePath || "").trim());
}

function loadState(): FileProvenanceRegistryState {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw) as FileProvenanceRegistryState;
    cache = {
      records: parsed?.records && typeof parsed.records === "object" ? parsed.records : {},
    };
  } catch {
    cache = { records: {} };
  }
  return cache;
}

function persistState(state: FileProvenanceRegistryState): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(state, null, 2), "utf8");
}

function pruneRecords(state: FileProvenanceRegistryState): void {
  const entries = Object.entries(state.records);
  if (entries.length <= MAX_RECORDS) return;
  entries
    .sort((left, right) => (left[1].recordedAt || 0) - (right[1].recordedAt || 0))
    .slice(0, entries.length - MAX_RECORDS)
    .forEach(([key]) => {
      delete state.records[key];
    });
}

export class FileProvenanceRegistry {
  static record(input: {
    path: string;
    workspaceId?: string;
    sourceKind: FileProvenanceSourceKind;
    trustLevel: FileTrustLevel;
    sourceLabel?: string;
    metadata?: Record<string, unknown>;
  }): FileProvenanceRecord {
    const state = loadState();
    const normalizedPath = normalizePath(input.path);
    const record: FileProvenanceRecord = {
      path: normalizedPath,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      sourceKind: input.sourceKind,
      trustLevel: input.trustLevel,
      ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      recordedAt: Date.now(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    state.records[normalizedPath] = record;
    pruneRecords(state);
    persistState(state);
    return record;
  }

  static recordMany(
    filePaths: string[],
    input: {
      workspaceId?: string;
      sourceKind: FileProvenanceSourceKind;
      trustLevel: FileTrustLevel;
      sourceLabel?: string;
      metadata?: Record<string, unknown>;
    },
  ): FileProvenanceRecord[] {
    const records: FileProvenanceRecord[] = [];
    for (const filePath of filePaths) {
      if (typeof filePath !== "string" || filePath.trim().length === 0) continue;
      records.push(
        this.record({
          path: filePath,
          ...input,
        }),
      );
    }
    return records;
  }

  static get(filePath: string): FileProvenanceRecord | null {
    const normalizedPath = normalizePath(filePath);
    const state = loadState();
    return state.records[normalizedPath] || null;
  }
}
