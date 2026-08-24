import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appPath = fileURLToPath(new URL("../../App.tsx", import.meta.url));

describe("MainContent event source", () => {
  it("uses live task events outside replay mode", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toMatch(
      /events=\{\s*replayControls\.isReplayMode\s*\?\s*replayControls\.replayEvents\s*:\s*events\s*\}/s,
    );
    expect(source).toContain("events={events}");
    expect(source).toContain("prev.events === next.events");
  });
});
