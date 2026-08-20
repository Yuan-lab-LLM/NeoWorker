import fs from "fs";
import path from "path";
import { createHash } from "crypto";

export interface KitRevisionMeta {
  file: string;
  changedBy: "user" | "agent" | "system";
  reason?: string;
  sha256: string;
  createdAt: string;
}

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function getKitSnapshotRoot(absPath: string): string {
  return path.join(path.dirname(absPath), ".history", path.basename(absPath));
}

export function getKitRevisionCount(absPath: string): number {
  const snapshotRoot = getKitSnapshotRoot(absPath);
  const revisionsPath = path.join(snapshotRoot, "revisions.jsonl");
  if (!fs.existsSync(revisionsPath)) return 0;
  try {
    const raw = fs.readFileSync(revisionsPath, "utf8").trim();
    if (!raw) return 0;
    return raw.split(/\r?\n/).filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function writeKitFileWithSnapshot(
  absPath: string,
  content: string,
  changedBy: KitRevisionMeta["changedBy"],
  reason?: string,
): void {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });

  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf8") : null;
  const nextSha = sha(content);
  const prevSha = existing ? sha(existing) : null;

  if (existing !== null && prevSha === nextSha) {
    return;
  }

  const snapshotRoot = getKitSnapshotRoot(absPath);
  fs.mkdirSync(snapshotRoot, { recursive: true });

  if (existing !== null) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotPath = path.join(snapshotRoot, `${stamp}.md`);
    fs.writeFileSync(snapshotPath, existing, "utf8");

    const meta: KitRevisionMeta = {
      file: path.basename(absPath),
      changedBy,
      reason,
      sha256: prevSha!,
      createdAt: new Date().toISOString(),
    };

    fs.appendFileSync(path.join(snapshotRoot, "revisions.jsonl"), JSON.stringify(meta) + "\n", "utf8");
  }

  fs.writeFileSync(absPath, content, "utf8");
}
