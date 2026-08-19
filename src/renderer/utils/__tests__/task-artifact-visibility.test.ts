import { describe, expect, it } from "vitest";
import { isUserVisibleTaskArtifactPath } from "../task-artifact-visibility";

describe("isUserVisibleTaskArtifactPath", () => {
  it("hides Office staging, quality, and manifest internals", () => {
    expect(
      isUserVisibleTaskArtifactPath(
        ".neoworker/office-staging/job/job.pptx",
      ),
    ).toBe(false);
    expect(
      isUserVisibleTaskArtifactPath(
        ".neoworker/office-quality/artifact/slide-1.png",
      ),
    ).toBe(false);
    expect(
      isUserVisibleTaskArtifactPath(
        ".neoworker/office-manifests/artifact.json",
      ),
    ).toBe(false);
    expect(
      isUserVisibleTaskArtifactPath(
        ".neoworker/office-snapshots/snapshot-1.json",
      ),
    ).toBe(false);
  });

  it("hides presentation sources while keeping the published deck", () => {
    expect(isUserVisibleTaskArtifactPath("slide-15.mjs")).toBe(false);
    expect(isUserVisibleTaskArtifactPath("presentation-plan.json")).toBe(false);
    expect(isUserVisibleTaskArtifactPath("narrative.md")).toBe(false);
    expect(isUserVisibleTaskArtifactPath("ppt-master/scripts/build_ppt.py")).toBe(false);
    expect(isUserVisibleTaskArtifactPath("ppt-master/review/report.json")).toBe(false);
    expect(isUserVisibleTaskArtifactPath("融资分析报告.pptx")).toBe(true);
  });

  it("does not hide ordinary user-requested documents", () => {
    expect(isUserVisibleTaskArtifactPath("research/report.md")).toBe(true);
    expect(isUserVisibleTaskArtifactPath("data/metrics.json")).toBe(true);
  });
});
