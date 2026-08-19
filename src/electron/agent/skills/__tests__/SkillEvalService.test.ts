import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillEvalService } from "../SkillEvalService";
import type { SkillProposalRecord } from "../SkillProposalService";

describe("SkillEvalService", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-skill-eval-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("scores proposal drafts against expected signals and writes a report", async () => {
    const proposal: SkillProposalRecord = {
      id: "proposal-1",
      version: 1,
      status: "pending",
      problemStatement: "Recurring release smoke test workflow",
      evidence: ["Used vitest and type-check successfully"],
      requiredTools: ["shell"],
      riskNote: "",
      draftSkill: {
        id: "release_smoke",
        name: "Release Smoke",
        description: "Run focused release smoke checks",
        prompt: "Run vitest, type-check, and summarize failures.",
      },
      signature: "sig",
      createdAt: 1,
      updatedAt: 1,
    };

    const report = await new SkillEvalService(tmpDir).runProposalEval(proposal, [
      {
        id: "case-1",
        prompt: "Validate the release",
        expectedSignals: ["vitest", "type-check"],
        requiredTools: ["shell"],
      },
    ]);

    expect(report.passed).toBe(true);
    expect(report.score).toBe(1);
    await expect(
      fs.readFile(path.join(tmpDir, ".neoworker", "skills", "evals", "proposal-1.json"), "utf8"),
    ).resolves.toContain("release_smoke");
  });
});
