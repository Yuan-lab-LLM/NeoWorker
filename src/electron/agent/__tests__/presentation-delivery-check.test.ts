import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createHash } from "crypto";
import { getStudioApprovedHashes, isStudioCandidateApproved } from "../presentation-delivery-check";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-delivery-")); dirs.push(root);
  fs.mkdirSync(path.join(root, "output")); fs.mkdirSync(path.join(root, ".build"));
  const output = path.join(root, "output/presentation.pptx"), candidate = path.join(root, ".build/presentation.pptx");
  fs.writeFileSync(candidate, "unverified-pptx"); fs.copyFileSync(candidate, output);
  const report = (value: object) => fs.writeFileSync(path.join(root, "qa-report.json"), JSON.stringify(value));
  return { root, output, candidate, report };
}
describe("Studio delivery QA", () => {
  it.each([false, true])("accepts the same workspace through canonical and aliased paths, report uses alias=%s", (reportUsesAlias) => {
    const { root, output, report } = setup();
    const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), "studio-alias-")); dirs.push(aliasParent);
    const alias = path.join(aliasParent, "workspace");
    fs.symlinkSync(fs.realpathSync(root), alias, "junction");
    const aliasedOutput = path.join(alias, "output/presentation.pptx");
    const outputSha256 = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
    report({ status: "warning", slideCount: 19, renderedSlideCount: 19, errors: [],
      outputPath: reportUsesAlias ? aliasedOutput : fs.realpathSync(output), outputSha256 });
    const hashes = getStudioApprovedHashes(reportUsesAlias ? fs.realpathSync(root) : alias);
    expect(isStudioCandidateApproved(output, hashes)).toBe(true);
    expect(isStudioCandidateApproved(aliasedOutput, hashes)).toBe(true);
  });
  it("rejects an output symlink that escapes the workspace despite matching QA bytes", () => {
    const { root, report } = setup();
    const outside = setup();
    const link = path.join(root, "external");
    fs.symlinkSync(outside.root, link, "junction");
    const output = path.join(link, "output/presentation.pptx");
    const outputSha256 = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
    report({ status: "passed", slideCount: 19, errors: [], outputPath: output, outputSha256 });
    expect(isStudioCandidateApproved(output, getStudioApprovedHashes(root))).toBe(false);
  });
  it("does not publish a private build through a directory alias", () => {
    const { root, candidate, report } = setup();
    const alias = path.join(root, "aliased-build");
    fs.symlinkSync(path.join(root, ".build"), alias, "junction");
    const output = path.join(alias, "presentation.pptx");
    const outputSha256 = createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
    report({ status: "passed", slideCount: 19, errors: [], outputPath: output, outputSha256 });
    expect(isStudioCandidateApproved(output, getStudioApprovedHashes(root))).toBe(false);
    expect(isStudioCandidateApproved(output, new Set([outputSha256]))).toBe(false);
  });
  it("rejects failed candidates even when the model copies them into the public output directory", () => {
    const { root, output, candidate, report } = setup();
    report({ status: "failed", slideCount: 12, errors: ["Slide 6 overflows"], outputPath: output, candidatePath: candidate });
    const hashes = getStudioApprovedHashes(root);
    expect(isStudioCandidateApproved(output, hashes)).toBe(false);
    expect(isStudioCandidateApproved(candidate, hashes)).toBe(false);
  });
  it("binds successful QA to exact PPTX bytes, accepts renamed copies and rejects subsequent mutation", () => {
    const { root, output, candidate, report } = setup();
    const outputSha256 = createHash("sha256").update(fs.readFileSync(output)).digest("hex");
    report({ status: "passed", slideCount: 12, errors: [], outputPath: output, outputSha256 });
    const copy = path.join(root, "演示文稿.pptx"); fs.copyFileSync(output, copy);
    expect(isStudioCandidateApproved(copy, getStudioApprovedHashes(root))).toBe(true);
    expect(isStudioCandidateApproved(candidate, getStudioApprovedHashes(root))).toBe(false);
    fs.appendFileSync(output, "changed after QA");
    expect(isStudioCandidateApproved(output, getStudioApprovedHashes(root))).toBe(false);
  });
  it("rejects outputs without a build report, even before a plan exists", () => {
    const { root, output } = setup();
    expect(getStudioApprovedHashes(root)).toEqual(new Set());
    expect(isStudioCandidateApproved(output, null)).toBe(false);
    expect(isStudioCandidateApproved(output, getStudioApprovedHashes(root))).toBe(false);
    fs.writeFileSync(path.join(root, "presentation-plan.json"), "{}");
    expect(isStudioCandidateApproved(output, getStudioApprovedHashes(root))).toBe(false);
  });
  it("accepts the native edit builder's byte-bound report without accepting an older failed build", () => {
    const { root, report } = setup();
    report({ status: "failed", slideCount: 12, errors: ["Earlier generation failed"] });
    const edit = path.join(root, "revision-1"); fs.mkdirSync(edit);
    const candidate = path.join(edit, "candidate.pptx"); fs.writeFileSync(candidate, "edited-native-file");
    const candidateSha256 = createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
    fs.writeFileSync(path.join(edit, "edit-qa.json"), JSON.stringify({ status: "requires-visual-review", errors: [], write: { slideCount: 12, candidateSha256 }, renderedSlideCount: 12 }));
    expect(isStudioCandidateApproved(candidate, getStudioApprovedHashes(root))).toBe(true);
    fs.appendFileSync(candidate, "unverified change");
    expect(isStudioCandidateApproved(candidate, getStudioApprovedHashes(root))).toBe(false);
  });
});
