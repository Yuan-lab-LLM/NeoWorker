import { describe, expect, it } from "vitest";
import {
  getArtifactPathIdentityKey,
  isCanonicalTaskArtifactOutputPath,
  normalizeArtifactPathForWorkspace,
} from "../artifact-path-identity";

describe("artifact path identity", () => {
  it("projects durable temporary-workspace mirrors back to one workspace path", () => {
    const relative =
      "artifacts/skills/task-1/ppt-master/output/presentation.pptx";
    const durable =
      "/Users/test/Library/Application Support/neoworker/artifacts/temporary-workspaces/ui-session-abc-deadbeef/artifacts/skills/task-1/ppt-master/output/presentation.pptx";

    expect(normalizeArtifactPathForWorkspace(durable)).toBe(relative);
    expect(getArtifactPathIdentityKey(durable)).toBe(
      getArtifactPathIdentityKey(relative),
    );
  });

  it("keeps unrelated absolute paths intact", () => {
    expect(normalizeArtifactPathForWorkspace("/outside/report.pptx")).toBe(
      "/outside/report.pptx",
    );
  });

  it("identifies task-scoped canonical delivery outputs", () => {
    expect(
      isCanonicalTaskArtifactOutputPath(
        "artifacts/skills/task-1/ppt-master/output/presentation.pptx",
      ),
    ).toBe(true);
    expect(isCanonicalTaskArtifactOutputPath("presentation.pptx")).toBe(false);
  });
});
