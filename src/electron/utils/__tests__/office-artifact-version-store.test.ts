import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { reserveOfficeArtifactVersion } from "../office-artifact-version-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("reserveOfficeArtifactVersion", () => {
  it("reserves stable versions from the transaction index", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-version-"));
    temporaryDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "分析报告.docx");

    const first = await reserveOfficeArtifactVersion(workspacePath, requestedPath);
    const second = await reserveOfficeArtifactVersion(workspacePath, requestedPath);

    expect(first).toMatchObject({ version: 1, path: requestedPath });
    expect(second).toMatchObject({
      version: 2,
      path: path.join(workspacePath, "分析报告-v2.docx"),
    });
  });

  it("serializes concurrent reservations without duplicate versions", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-version-"));
    temporaryDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "deck.pptx");

    const reservations = await Promise.all(
      Array.from({ length: 8 }, () =>
        reserveOfficeArtifactVersion(workspacePath, requestedPath),
      ),
    );

    expect(reservations.map(({ version }) => version).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(new Set(reservations.map(({ path: filePath }) => filePath)).size).toBe(8);
  });

  it("reconciles files and published manifests created before the index", async () => {
    const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), "office-version-"));
    temporaryDirectories.push(workspacePath);
    const requestedPath = path.join(workspacePath, "model.xlsx");
    await fs.writeFile(requestedPath, "legacy");
    await fs.mkdir(path.join(workspacePath, ".neoworker", "office-manifests"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(workspacePath, ".neoworker", "office-manifests", "old.json"),
      JSON.stringify({
        status: "published",
        finalPath: "model-v4.xlsx",
        version: 4,
      }),
    );

    const reservation = await reserveOfficeArtifactVersion(
      workspacePath,
      requestedPath,
    );

    expect(reservation.version).toBe(5);
    expect(reservation.path).toBe(path.join(workspacePath, "model-v5.xlsx"));
  });
});

