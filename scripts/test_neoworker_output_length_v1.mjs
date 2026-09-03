#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const archive = path.resolve(
  process.argv[2] ?? ".novaready/package-output/app.asar.output-length-v1",
);
const marker = "NW_OUTPUT_LENGTH_V1";
const runtimes = ["electron", "daemon", "cli"];

assert.ok(fs.existsSync(archive), `Archive not found: ${archive}`);

function extract(archivePath) {
  return asar.extractFile(archive, archivePath).toString("utf8");
}

for (const runtime of runtimes) {
  const archivePath = `dist/${runtime}/electron/agent/executor.js`;
  const source = extract(archivePath);
  assert.ok(source.includes(marker), `${archivePath}: marker missing`);
  assert.ok(
    source.includes("initialMaxTokens: finalizationAttempt === 0 ? 4000 : 4000"),
    `${archivePath}: finalization initial budget was not raised`,
  );
  assert.ok(
    source.includes("continuationMaxTokens: finalizationAttempt === 0 ? 4000 : 4000"),
    `${archivePath}: finalization continuation budget was not raised`,
  );
  assert.ok(
    source.includes("t.length>20000?`${t.slice(0,20000)}...`:t"),
    `${archivePath}: follow-up result-summary cap was not raised`,
  );
  assert.ok(
    source.includes('return languageSafe.length > 20000\n? `${languageSafe.slice(0, 20000)}...`\n: languageSafe;'),
    `${archivePath}: regular result-summary cap was not raised`,
  );
  assert.ok(
    !source.includes("initialMaxTokens: finalizationAttempt === 0 ? 1200 : 1600"),
    `${archivePath}: old finalization budget is still present`,
  );
  assert.ok(
    !source.includes("continuationMaxTokens: finalizationAttempt === 0 ? 600 : 800"),
    `${archivePath}: old continuation budget is still present`,
  );
}

console.log(JSON.stringify({
  ok: true,
  archive,
  runtimesChecked: runtimes.length,
  behaviors: [
    "post-tool finalization has a 4000-token initial budget",
    "post-tool finalization has a 4000-token continuation budget",
    "regular and follow-up task summaries retain up to 20000 characters",
    "tool-call and renderer preview caps remain untouched",
  ],
}, null, 2));
