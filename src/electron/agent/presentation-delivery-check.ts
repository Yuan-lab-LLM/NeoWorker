import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";

/** A copied private build candidate must not become a deliverable after QA failed. */
export function getStudioApprovedHashes(root: string): Set<string> {
  const approved = new Set<string>();
  let realRoot: string;
  try { realRoot = fs.realpathSync(root); } catch { return approved; }
  const containedFile = (file: string): string | null => {
    const realFile = fs.realpathSync(file);
    const relative = path.relative(realRoot, realFile);
    return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      ? realFile : null;
  };
  const visit = (directory: string, depth: number) => {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") visit(file, depth + 1);
      if (!entry.isFile() || !["qa-report.json", "edit-qa.json"].includes(entry.name)) continue;
      try {
        const report = JSON.parse(fs.readFileSync(file, "utf8"));
        if (entry.name === "edit-qa.json") {
          if (report.status !== "requires-visual-review" || !Array.isArray(report.errors) || report.errors.length || report.inspection?.errors?.length) continue;
          if (!(report.write?.slideCount > 0) || report.renderedSlideCount !== report.write.slideCount) continue;
          const candidate = containedFile(path.join(directory, "candidate.pptx"));
          if (!candidate) continue;
          const hash = createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
          if (hash === report.write.candidateSha256) approved.add(hash);
          continue;
        }
        if (!["passed", "warning"].includes(report.status) || !Array.isArray(report.errors) || report.errors.length || !(report.slideCount > 0)) continue;
        // macOS reports can use /private/var while the workspace uses /var.
        // Compare real locations, also rejecting symlinks that escape the root.
        const output = containedFile(path.resolve(directory, report.outputPath || ""));
        if (!output || !/\.pptx$/i.test(output) || output.split(path.sep).includes(".build")) continue;
        const hash = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
        // New builds bind QA to the exact bytes. Older reports are accepted only
        // while their actual published output predates the report.
        if (report.outputSha256 ? report.outputSha256 !== hash : fs.statSync(output).mtimeMs > fs.statSync(file).mtimeMs) continue;
        approved.add(hash);
      } catch { /* Missing or malformed evidence never approves a candidate. */ }
    }
  };
  visit(root, 0);
  return approved;
}

export function isStudioCandidateApproved(candidate: string, approved: Set<string> | null): boolean {
  if (candidate.split(path.sep).includes(".build")) return false;
  try {
    const realCandidate = fs.realpathSync(candidate);
    if (realCandidate.split(path.sep).includes(".build")) return false;
    if (approved === null) return false;
    return approved.has(createHash("sha256").update(fs.readFileSync(realCandidate)).digest("hex"));
  }
  catch { return false; }
}
