import fs from "node:fs";
import path from "node:path";
import { LEGACY_PLUGIN_MANIFEST_FILENAMES } from "../migrations/legacy-brand-compat";

export const PLUGIN_MANIFEST_FILENAME = "neoworker.plugin.json";

export function findPluginManifestPath(rootDir: string): string | null {
  for (const fileName of [PLUGIN_MANIFEST_FILENAME, ...LEGACY_PLUGIN_MANIFEST_FILENAMES]) {
    const candidate = path.join(rootDir, fileName);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}
