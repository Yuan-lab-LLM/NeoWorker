import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("../update-manager.ts", import.meta.url));

describe("packaged updater configuration", () => {
  it("uses the public NeoWorker release repository consistently", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain('UPDATE_REPOSITORY_OWNER = "Yuan-lab-LLM"');
    expect(source).toContain('UPDATE_REPOSITORY_NAME = "NeoWorker"');
    expect(source).toContain("api.github.com/repos/${UPDATE_REPOSITORY_OWNER}/${UPDATE_REPOSITORY_NAME}");
    expect(source).toContain('owner: UPDATE_REPOSITORY_OWNER');
    expect(source).toContain('repo: UPDATE_REPOSITORY_NAME');
  });

  it("checks the electron-updater feed before starting the download", () => {
    const source = readFileSync(sourcePath, "utf8");
    const checkIndex = source.indexOf("await autoUpdater.checkForUpdates()");
    const downloadIndex = source.indexOf("await autoUpdater.downloadUpdate()");

    expect(checkIndex).toBeGreaterThan(-1);
    expect(source).toContain("result?.isUpdateAvailable");
    expect(downloadIndex).toBeGreaterThan(checkIndex);
  });
});
