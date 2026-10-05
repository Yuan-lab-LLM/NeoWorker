import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

/** Validate from the shipped tree, never the repository's node_modules. */
export function verifyPresentationRuntime(resources, { loadNative = true } = {}) {
  const root = path.join(resources, "app.asar.unpacked");
  const realRoot = fs.realpathSync(root);
  const require = createRequire(path.join(root, "presentation-runtime.cjs"));
  for (const module of ["pptxgenjs", "jszip", "image-size", "@xmldom/xmldom", "@napi-rs/canvas", "pdfjs-dist/legacy/build/pdf.mjs"]) {
    const resolved = require.resolve(module);
    if (!resolved.startsWith(realRoot + path.sep) || !fs.existsSync(resolved)) {
      throw new Error(`Presentation dependency is not shipped outside asar: ${module}`);
    }
  }
  // Loading these also verifies their transitive JS dependencies. Native canvas
  // loading is only possible when the package target matches the build host.
  require("pptxgenjs");
  require("jszip");
  require("@xmldom/xmldom");
  if (loadNative) {
    execFileSync(process.execPath, [path.join(resources, "skills/presentation-studio/scripts/preflight.mjs")], {
      cwd: resources,
      env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
      encoding: "utf8",
      timeout: 30_000,
      stdio: "pipe",
    });
  }
  console.log("[presentation-studio] Verified packaged Node runtime dependencies.");
}
