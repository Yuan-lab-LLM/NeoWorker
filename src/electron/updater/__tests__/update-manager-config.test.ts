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

  it("uses a bounded, verified manual asset path for packaged updates", () => {
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toContain("isTrustedReleaseAssetUrl");
    expect(source).toContain("pickReleaseAsset");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("Update download stalled for 30 seconds.");
    expect(source).toContain("Update integrity check failed");
    expect(source).toContain("this.manualUpdatePath");
    expect(source).toContain("shell.openPath(this.manualUpdatePath)");
  });

  it("keeps Linux server packaging commands wired to the release workflow", () => {
    const packageJson = readFileSync(
      fileURLToPath(new URL("../../../../package.json", import.meta.url)),
      "utf8",
    );
    const scripts = JSON.parse(packageJson).scripts;
    expect(scripts["build:connectors"]).toBe("node scripts/build-connectors.mjs");
    expect(scripts["package:linux:server"]).toContain("scripts/package-linux-server.mjs");
    expect(scripts["package:linux:server:smoke"]).toBe(
      "node scripts/smoke-linux-server-package.mjs",
    );
  });
});
