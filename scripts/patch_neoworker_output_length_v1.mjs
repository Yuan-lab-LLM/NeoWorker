#!/usr/bin/env node

/**
 * Give tool-free finalization enough room to finish a user-facing answer.
 *
 * The normal tool loop has its own adaptive budgets.  This patch is deliberately
 * scoped to the post-tool finalization turn that previously used 1200 + 600
 * output tokens, and to the task result-summary cap that copied that answer.
 * It does not change tool-call budgets or renderer preview truncation rules.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const { Pickle } = require("@electron/asar/lib/pickle");

const sourceArchive = path.resolve(
  process.argv[2] ?? "/Applications/NeoWorker.app/Contents/Resources/app.asar",
);
const outputArchive = path.resolve(
  process.argv[3] ?? ".novaready/package-output/app.asar.output-length-v1",
);
const marker = "NW_OUTPUT_LENGTH_V1";
const runtimes = ["electron", "daemon", "cli"];

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

function collectPackedEntries(node, prefix = "", result = []) {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const archivePath = prefix ? `${prefix}/${name}` : name;
    if (entry.files) collectPackedEntries(entry, archivePath, result);
    else if (!entry.unpacked && entry.offset !== undefined) {
      result.push({
        archivePath,
        entry,
        oldOffset: Number(entry.offset),
        oldSize: Number(entry.size),
      });
    }
  }
  return result;
}

function updateIntegrity(entry, content) {
  if (!entry.integrity) return;
  if (entry.integrity.algorithm !== "SHA256") {
    throw new Error(`Unsupported ASAR integrity algorithm for ${entry.name ?? "entry"}`);
  }
  entry.integrity.hash = sha256(content);
  if (!Array.isArray(entry.integrity.blocks)) return;
  const blockSize = Number(entry.integrity.blockSize || content.length || 1);
  entry.integrity.blocks = [];
  for (let offset = 0; offset < content.length; offset += blockSize) {
    entry.integrity.blocks.push(
      sha256(content.subarray(offset, Math.min(content.length, offset + blockSize))),
    );
  }
  if (!entry.integrity.blocks.length) entry.integrity.blocks.push(sha256(content));
}

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one match, found ${first < 0 ? 0 : "multiple"}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function patchExecutor(original, archivePath) {
  let source = original.toString("utf8");
  if (source.includes(marker)) return original;

  source = replaceExactlyOnce(
    source,
    "initialMaxTokens: finalizationAttempt === 0 ? 1200 : 1600",
    "initialMaxTokens: finalizationAttempt === 0 ? 4000 : 4000",
    `${archivePath}: finalization initial budget`,
  );
  source = replaceExactlyOnce(
    source,
    "continuationMaxTokens: finalizationAttempt === 0 ? 600 : 800",
    "continuationMaxTokens: finalizationAttempt === 0 ? 4000 : 4000",
    `${archivePath}: finalization continuation budget`,
  );
  source = replaceExactlyOnce(
    source,
    "t.length>4000?`${t.slice(0,4000)}...`:t",
    "t.length>20000?`${t.slice(0,20000)}...`:t",
    `${archivePath}: follow-up result-summary cap`,
  );
  source = replaceExactlyOnce(
    source,
    'return languageSafe.length > 4000\n? `${languageSafe.slice(0, 4000)}...`\n: languageSafe;',
    'return languageSafe.length > 20000\n? `${languageSafe.slice(0, 20000)}...`\n: languageSafe;',
    `${archivePath}: regular result-summary cap`,
  );

  return Buffer.from(
    `${source}\n/* ${marker}: post-tool finalization has 4k + 4k output budget; final summaries retain up to 20k chars. */\n`,
    "utf8",
  );
}

function writeArchive(patches) {
  const rawHeader = asar.getRawHeader(sourceArchive);
  const entries = collectPackedEntries(rawHeader.header).sort((a, b) => a.oldOffset - b.oldOffset);
  const patchMap = new Map(patches.map((patch) => [patch.archivePath, patch.content]));
  const found = new Set();
  let nextOffset = 0;
  for (const item of entries) {
    item.entry.offset = String(nextOffset);
    const replacement = patchMap.get(item.archivePath);
    if (replacement) {
      found.add(item.archivePath);
      item.entry.size = replacement.length;
      updateIntegrity(item.entry, replacement);
    }
    nextOffset += Number(item.entry.size);
  }
  for (const patch of patches) {
    if (!found.has(patch.archivePath)) {
      throw new Error(`Patched entry is not packed: ${patch.archivePath}`);
    }
  }

  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(rawHeader.header));
  const headerBuffer = headerPickle.toBuffer();
  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(headerBuffer.length);
  const sizeBuffer = sizePickle.toBuffer();
  if (sizeBuffer.length !== 8) throw new Error("Unexpected ASAR size header length");

  fs.mkdirSync(path.dirname(outputArchive), { recursive: true });
  if (fs.existsSync(outputArchive)) fs.unlinkSync(outputArchive);
  const sourceFd = fs.openSync(sourceArchive, "r");
  const outputFd = fs.openSync(outputArchive, "wx");
  const sourceDataStart = rawHeader.headerSize + 8;
  const copyBuffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    fs.writeSync(outputFd, sizeBuffer);
    fs.writeSync(outputFd, headerBuffer);
    for (const item of entries) {
      const replacement = patchMap.get(item.archivePath);
      if (replacement) {
        fs.writeSync(outputFd, replacement);
        continue;
      }
      let remaining = item.oldSize;
      let sourcePosition = sourceDataStart + item.oldOffset;
      while (remaining > 0) {
        const count = Math.min(copyBuffer.length, remaining);
        const bytesRead = fs.readSync(sourceFd, copyBuffer, 0, count, sourcePosition);
        if (bytesRead !== count) throw new Error(`Short read for ${item.archivePath}`);
        fs.writeSync(outputFd, copyBuffer, 0, bytesRead);
        sourcePosition += bytesRead;
        remaining -= bytesRead;
      }
    }
    fs.fsyncSync(outputFd);
  } finally {
    fs.closeSync(sourceFd);
    fs.closeSync(outputFd);
  }
}

if (!fs.existsSync(sourceArchive)) throw new Error(`Source ASAR not found: ${sourceArchive}`);
if (sourceArchive === outputArchive) throw new Error("Refusing to patch source ASAR in place");

const rawHeader = asar.getRawHeader(sourceArchive);
const patches = [];
for (const runtime of runtimes) {
  const archivePath = `dist/${runtime}/electron/agent/executor.js`;
  patches.push({
    archivePath,
    content: patchExecutor(asar.extractFile(sourceArchive, archivePath), archivePath),
  });
}

writeArchive(patches);
asar.uncache(outputArchive);
for (const patch of patches) {
  const roundTrip = asar.extractFile(outputArchive, patch.archivePath);
  if (!roundTrip.equals(patch.content) || !roundTrip.toString("utf8").includes(marker)) {
    throw new Error(`Post-write verification failed: ${patch.archivePath}`);
  }
}

console.log(JSON.stringify({
  sourceArchive,
  outputArchive,
  marker,
  patchedEntries: patches.length,
  archiveSha256: sha256(fs.readFileSync(outputArchive)),
}, null, 2));
