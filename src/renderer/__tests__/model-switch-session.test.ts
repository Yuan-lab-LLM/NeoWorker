import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  fileURLToPath(new URL("../App.tsx", import.meta.url)),
  "utf8",
);

describe("model switching inside an active session", () => {
  it("updates the model without clearing or navigating away from the task", () => {
    const handlerStart = appSource.indexOf("const handleModelChange = async");
    const handlerEnd = appSource.indexOf(
      "const handleTransparencyEffectsEnabledChange",
      handlerStart,
    );
    const handlerSource = appSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handlerSource).toContain("setSelectedModel(modelKey)");
    expect(handlerSource).toContain("setLLMModel");
    expect(handlerSource).not.toContain("setSelectedTaskId(null)");
    expect(handlerSource).not.toContain("setEvents([])");
    expect(handlerSource).not.toContain("clearRemoteTaskView()");
    expect(handlerSource).not.toContain('setCurrentView("main")');
  });
});
