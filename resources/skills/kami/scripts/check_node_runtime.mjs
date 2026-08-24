#!/usr/bin/env node

import { createAppRequire, loadNodeRuntime, resolveBrowserExecutable } from "./runtime-utils.mjs";

function main() {
  const status = {
    node: true,
    pptxgenjs: false,
    playwright: false,
    browserExecutable: null,
  };

  try {
    const requireFromApp = createAppRequire(import.meta.url);
    status.pptxgenjs = Boolean(requireFromApp.resolve("pptxgenjs"));
    status.playwright = Boolean(requireFromApp.resolve("playwright"));
  } catch {
    // Keep false values.
  }

  try {
    const runtime = loadNodeRuntime(import.meta.url);
    status.pptxgenjs = status.pptxgenjs || Boolean(runtime.PptxGenJS);
    status.playwright = status.playwright || Boolean(runtime.chromium);
  } catch {
    // Keep false values.
  }

  status.browserExecutable = resolveBrowserExecutable();

  console.log("[kami] node: ok");
  console.log(`[kami] node module pptxgenjs: ${status.pptxgenjs ? "ok" : "missing"}`);
  console.log(`[kami] node module playwright: ${status.playwright ? "ok" : "missing"}`);
  console.log(
    `[kami] browser executable: ${status.browserExecutable ? `ok (${status.browserExecutable})` : "missing"}`,
  );

  if (!status.pptxgenjs || !status.playwright) {
    process.exitCode = 1;
  }
}

main();
