import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createPackageWithOptions } from "@electron/asar";
import { verifyPresentationRuntime } from "../verify-presentation-runtime.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("plain Node builds a deck from the shipped asar layout, outside the repository", async () => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-packaged-ppt-"));
  try {
    const resources = path.join(fixture, "NeoWorker.app/Contents/Resources");
    const staging = path.join(fixture, "staging");
    await fs.mkdir(resources, { recursive: true });
    await fs.mkdir(staging);
    const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    // Use the production unpack configuration, including platform-native canvas.
    for (const pattern of pkg.build.asarUnpack) {
      const directory = pattern.replace(/\/\*\*\/\*$/, "");
      const parent = path.dirname(directory);
      const basename = path.basename(directory);
      const names = basename.endsWith("*")
        ? (await fs.readdir(path.join(root, parent))).filter(name => name.startsWith(basename.slice(0, -1)))
        : [basename];
      for (const name of names) {
        const source = path.join(root, parent, name);
        try { await fs.access(source); } catch { continue; }
        await fs.cp(source, path.join(staging, parent, name), { recursive: true });
      }
    }
    await fs.writeFile(path.join(staging, "package.json"), '{"name":"packaged-runtime-fixture"}');
    await createPackageWithOptions(staging, path.join(resources, "app.asar"), {
      unpack: `{${pkg.build.asarUnpack.map(pattern => `**/${pattern}`).join(",")}}`,
    });
    const skill = path.join(resources, "skills/presentation-studio");
    await fs.cp(path.join(root, "resources/skills/presentation-studio"), skill, { recursive: true });
    // Remove staging so no development dependencies can rescue module resolution.
    await fs.rm(staging, { recursive: true, force: true });
    assert.throws(() => execFileSync(process.execPath, ["-e", "require('pptxgenjs')"], { cwd: fixture, stdio: "pipe" }));
    verifyPresentationRuntime(resources);
    const project = path.join(fixture, "output-project");
    const run = (script, args = []) => execFileSync(process.execPath, [path.join(skill, "scripts", script), ...args], {
      cwd: fixture, encoding: "utf8", timeout: 120_000, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
    });
    run("bootstrap_project.mjs", ["--project-dir", project, "--title", "Installed runtime QA", "--language", "chinese"]);
    // The scaffold is intentionally incomplete; use the catalog's own plan fixture
    // for package compilation, then leave visual aesthetics to the separate QA.
    const planPath = path.join(project, "presentation-plan.json");
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    assert.equal(plan.layoutEngine, "catalog-v1");
    // Preflight exercises native geometry imports; loadPresentationRuntime must
    // also construct and serialize native editable shapes, not just resolve files.
    const output = path.join(project, "runtime-test.pptx");
    const runner = path.join(fixture, "build.mjs");
    await fs.writeFile(runner, `import { loadPresentationRuntime } from ${JSON.stringify(new URL(`file://${path.join(skill, "scripts/runtime-utils.mjs")}`).href)};\nconst { PptxGenJS, JSZip } = loadPresentationRuntime(${JSON.stringify(new URL(`file://${path.join(skill, "scripts/build_and_qa.mjs")}`).href)});\nconst ppt = new PptxGenJS(); ppt.addSlide().addText('安装包依赖验证', { x: 1, y: 1, w: 6, h: 1 }); await ppt.writeFile({fileName: ${JSON.stringify(output)}});\n`);
    execFileSync(process.execPath, [runner], { cwd: fixture, encoding: "utf8" });
    assert.ok((await fs.stat(output)).size > 1000);
    // Deliberately remove a required module: a packaged smoke check must fail.
    await fs.rm(path.join(resources, "app.asar.unpacked/node_modules/jszip"), { recursive: true, force: true });
    assert.throws(() => verifyPresentationRuntime(resources));
  } finally {
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
