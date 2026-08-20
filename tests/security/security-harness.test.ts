import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const harness = require("../../scripts/qa/security-harness.cjs");

describe("security harness", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-security-harness-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("targets changed files that touch high-risk NeoWorker boundaries", () => {
    expect(harness.classifyHighRiskFile("src/electron/security/policy-manager.ts")).toMatchObject({
      highRisk: true,
      reasons: ["tool-policy"],
    });
    expect(harness.classifyHighRiskFile("docs/security/security-model.md")).toMatchObject({
      highRisk: false,
    });
  });

  it("requires a verifier/debater validation pass before confirming scanner findings", () => {
    const candidates = harness.scanTextForCandidates(
      "src/electron/security/example.ts",
      "const child = spawn('sh', ['-c', command]);",
      ["tool-policy"],
    );

    expect(candidates).toHaveLength(1);
    const validated = harness.validateCandidate(candidates[0]);

    expect(validated.status).toBe("confirmed");
    expect(validated.validation).toMatchObject({
      verifierRequired: true,
      verifierVerdict: "pass",
      debaterRequired: true,
      proofRequired: true,
    });
  });

  it("dedupes confirmed findings for Mission Control cards", () => {
    const candidates = harness.scanTextForCandidates(
      "src/electron/security/example.ts",
      [
        "const child = spawn('sh', ['-c', command]);",
        "const child = spawn('sh', ['-c', command]);",
      ].join("\n"),
      ["tool-policy"],
    );
    const findings = harness.dedupeFindings(candidates.map(harness.validateCandidate));
    const payload = harness.buildMissionControlPayload({
      generatedAt: "2026-05-14T00:00:00.000Z",
      scope: { highRiskFileCount: 1 },
      findings,
    });

    expect(findings).toHaveLength(1);
    expect(payload).toMatchObject({
      surface: "mission_control_core_harness",
      traceKind: "regression_eval",
    });
    expect(payload.cards[0]).toMatchObject({
      status: "confirmed",
      severity: "critical",
      category: "tool_policy_bypass",
    });
  });

  it("does not scan rule-definition prose as a finding", () => {
    const candidates = harness.scanTextForCandidates(
      "scripts/qa/security-harness.cjs",
      "    summary: 'Browser permission rule changes should cover tool-specific and prefix-scoped rules',",
      ["regression-policy"],
    );

    expect(candidates).toHaveLength(0);
  });

  it("keeps explicit file reads inside the workspace root", () => {
    const root = path.join(tempDir, "workspace");
    const outside = path.join(tempDir, "outside.txt");
    fs.mkdirSync(root);
    fs.writeFileSync(outside, "secret", "utf8");

    expect(harness.isPathInside(root, path.join(root, "src/index.ts"))).toBe(true);
    expect(harness.isPathInside(root, outside)).toBe(false);
  });

  it("is advisory by default and only fails on findings when explicitly requested", () => {
    expect(harness.parseArgs(["node", "security-harness.cjs"]).failOnFindings).toBe(false);
    expect(harness.parseArgs(["node", "security-harness.cjs", "--fail-on-findings"]).failOnFindings)
      .toBe(true);
  });

  it("creates eval coverage for confirmed security or production-policy fixes", () => {
    const evalPath = path.join(tempDir, "security-harness-regressions.json");
    const result = harness.syncConfirmedFixEvalFile({
      args: {
        confirmedFix: true,
        fixId: "ipc-path-boundary-fix",
        fixSummary: "IPC path boundary fix",
        evalCasePath: evalPath,
      },
      findings: [
        {
          fingerprint: "abc123",
          ruleId: "unsafe-ipc-path",
          category: "ipc_input_validation",
          summary: "Renderer-controlled IPC path may need workspace validation",
        },
      ],
    });

    const written = JSON.parse(fs.readFileSync(evalPath, "utf8"));
    expect(result.updated).toBe(true);
    expect(written.categories).toHaveLength(1);
    expect(written.categories[0]).toMatchObject({
      id: "ipc-path-boundary-fix-unsafe-ipc-path",
      assertions: {
        securityHarnessRule: "unsafe-ipc-path",
        expectedNoSilentBypass: true,
        requiresProofArtifact: true,
      },
    });
  });
});
