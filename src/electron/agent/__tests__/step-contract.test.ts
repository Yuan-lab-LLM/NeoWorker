import { describe, expect, it } from "vitest";
import {
  descriptionHasChecklistReportCue,
  descriptionHasCopyIntent,
  descriptionHasDiscoveryIntent,
  descriptionHasReadOnlyIntent,
  descriptionHasStrongWriteIntent,
  descriptionHasWriteIntent,
  extractArtifactPathCandidates,
  isArtifactPathLikeToken,
  isLikelyCommandSnippet,
} from "../step-contract";

describe("step-contract path extraction", () => {
  it("does not treat command snippets as artifact paths", () => {
    const text =
      "Verification: run the app via local server (`python3 -m http.server` or equivalent), then validate interactions.";
    const candidates = extractArtifactPathCandidates(text);
    expect(candidates).toEqual([]);
  });

  it("anchors extraction to path-like tokens while ignoring command-like backticks", () => {
    const text =
      "Create project scaffold under `./win95-ui/` with files `index.html` and `scripts/main.js`, then run `python win95-ui/scripts/validate.py`.";
    const candidates = extractArtifactPathCandidates(text);
    expect(candidates).toEqual(
      expect.arrayContaining(["./win95-ui/", "index.html", "scripts/main.js"]),
    );
    expect(candidates).not.toEqual(expect.arrayContaining(["win95-ui/scripts/validate.py"]));
  });
});

describe("step-contract token classification", () => {
  it("flags CLI snippets as commands", () => {
    expect(isLikelyCommandSnippet("python3 -m http.server")).toBe(true);
    expect(isLikelyCommandSnippet("npm run build")).toBe(true);
  });

  it("recognizes source file paths as artifact-like tokens", () => {
    expect(isArtifactPathLikeToken("scripts/main.js")).toBe(true);
    expect(isArtifactPathLikeToken("index.html")).toBe(true);
    expect(isArtifactPathLikeToken("python3 -m http.server")).toBe(false);
  });
});

describe("step-contract write intent", () => {
  it("does not treat generic make phrasing as write intent without artifact cues", () => {
    expect(
      descriptionHasWriteIntent(
        "Make a recommendation for the rollout approach and explain tradeoffs.",
      ),
    ).toBe(false);
  });

  it("treats lock/define/set style artifact directives as write intent", () => {
    expect(
      descriptionHasWriteIntent(
        "Lock requirements in /tmp/linux/neoworker/requirements.md with distro defaults.",
      ),
    ).toBe(true);
  });

  it("treats passive saved-as artifact phrasing as write intent", () => {
    expect(
      descriptionHasWriteIntent(
        "Synthesize the findings into a report saved as `/tmp/new/ai-agent-trends-2026-03-08.md`.",
      ),
    ).toBe(true);
    expect(
      descriptionHasStrongWriteIntent(
        "Synthesize the findings into a report saved as `/tmp/new/ai-agent-trends-2026-03-08.md`.",
      ),
    ).toBe(true);
  });

  it("does not treat output naming-only phrasing as write intent", () => {
    expect(
      descriptionHasWriteIntent(
        "Set research window and define output file name daily-ai-agent-trends-2026-03-03.md.",
      ),
    ).toBe(false);
  });

  it("does not treat prepare-summary phrasing as strong write intent by itself", () => {
    expect(
      descriptionHasStrongWriteIntent("Prepare final summary document for KARU_Whitepaper.md"),
    ).toBe(false);
  });

  it("recognizes checklist/report phrasing cues for verification-mode policy decisions", () => {
    expect(
      descriptionHasChecklistReportCue(
        "Verification step: run final editorial checklist in newsletter/weekly/YYYY-WW/final-checklist.md",
      ),
    ).toBe(true);
  });

  it("recognizes Chinese HTML artifact generation as a write step", () => {
    const description =
      "报告撰写与HTML生成：按摘要、六大板块和来源清单组织内容，生成自包含HTML文件。";

    expect(descriptionHasStrongWriteIntent(description)).toBe(true);
    expect(descriptionHasWriteIntent(description)).toBe(true);
  });

  it("recognizes copying or saving an artifact as a new version as write intent", () => {
    for (const description of [
      "Copy the source workbook to a new version.",
      "Save the spreadsheet as a new version.",
      "复制源文件为新版本（AI软件部门版）",
      "将工作簿另存为新版本",
    ]) {
      expect(descriptionHasCopyIntent(description)).toBe(true);
      expect(descriptionHasStrongWriteIntent(description)).toBe(true);
      expect(descriptionHasWriteIntent(description)).toBe(true);
    }
  });
});

describe("step-contract read-only intent", () => {
  it("treats remote source fetch steps that mention README.md as read-only discovery", () => {
    const description =
      'Search for "Hermes Agent" and "OpenClaw" to pin down the exact GitHub repositories. Fetch their `README.md` and stats pages.';

    expect(descriptionHasReadOnlyIntent(description)).toBe(true);
    expect(descriptionHasDiscoveryIntent(description)).toBe(true);
    expect(descriptionHasWriteIntent(description)).toBe(false);
    expect(extractArtifactPathCandidates(description)).toEqual(["README.md"]);
  });

  it("recognizes Chinese research steps as read-only discovery", () => {
    const description = "信息收集：搜索近期动态，抓取并核实权威来源。";

    expect(descriptionHasReadOnlyIntent(description)).toBe(true);
    expect(descriptionHasDiscoveryIntent(description)).toBe(true);
    expect(descriptionHasWriteIntent(description)).toBe(false);
  });
});
