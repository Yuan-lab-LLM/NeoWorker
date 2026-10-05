import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPresentationRuntime } from "./verify-presentation-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function verifyBundledConnectors(resourcesPath) {
  const source = path.join(root, "connectors");
  let count = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !fs.existsSync(path.join(source, entry.name, "tsconfig.json")))
      continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(source, entry.name, "package.json"), "utf8"));
    const bundled = path.join(resourcesPath, "connectors", entry.name, pkg.main || "dist/index.js");
    if (!fs.existsSync(bundled) || fs.statSync(bundled).size === 0) {
      throw new Error(
        `Missing bundled MCP connector: ${bundled}. Run npm run build:connectors before packaging.`,
      );
    }
    count++;
  }
  console.log(`[connectors] Verified ${count} packaged connector entry points.`);
  return count;
}

// electron-builder calls this after copying resources, before signing the app.
export default function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");
  verifyBundledConnectors(resources);
  const targetArch = ["ia32", "x64", "armv7l", "arm64", "universal"][context.arch];
  verifyPresentationRuntime(resources, {
    loadNative: context.electronPlatformName === process.platform && targetArch === process.arch,
  });
}
