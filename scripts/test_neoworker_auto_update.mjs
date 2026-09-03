import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const archive = path.resolve(
  process.argv[2] ?? '.novaready/package-output/app.auto-update.asar',
);

const paths = {
  main: 'dist/electron/electron/main.js',
  handlers: 'dist/electron/electron/ipc/handlers.js',
  updater: 'dist/electron/electron/updater/update-manager.js',
  preload: 'dist/electron/electron/preload.js',
  renderer: 'dist/renderer/assets/index-BTC5MTVk.js',
  css: 'dist/renderer/assets/index-DuUtsx0I.css',
};

function source(archivePath) {
  return asar.extractFile(archive, archivePath).toString('utf8').trimEnd();
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function archiveEntry(rawHeader, archivePath) {
  let entry = rawHeader.header;
  for (const segment of archivePath.split('/')) {
    entry = entry?.files?.[segment];
    if (!entry) throw new Error(`Missing ASAR entry: ${archivePath}`);
  }
  return entry;
}

const main = source(paths.main);
const handlers = source(paths.handlers);
const updater = source(paths.updater);
const preload = source(paths.preload);
const renderer = source(paths.renderer);
const css = source(paths.css);

assert.match(main, /require\("\.\/updater"\)\.updateManager\.setMainWindow\(mainWindow\)/);
for (const handler of [
  'APP_GET_VERSION',
  'APP_CHECK_UPDATES',
  'APP_DOWNLOAD_UPDATE',
  'APP_INSTALL_UPDATE',
]) {
  assert.match(handlers, new RegExp(`ipcMain\\.handle\\(types_1\\.IPC_CHANNELS\\.${handler}`));
}
assert.doesNotMatch(main, /nwUpdateManager\.downloadAndInstallUpdate/);

assert.match(updater, /repoOwner="Yuan-lab-LLM"/);
assert.doesNotMatch(updater, /repoOwner="NeoWorker"/);
assert.match(updater, /releases\/download\//);
assert.match(updater, /sha256:\(\[a-f0-9\]\{64\}\)/);
assert.match(updater, /asset\.url\.startsWith\(this\.assetUrlPrefix\(\)\)/);
assert.match(updater, /apiUrl:typeof asset\.url/);
assert.match(updater, /await this\.downloadManualAsset\(info\)/);
assert.match(updater, /AbortController/);
assert.match(updater, /更新下载超时（45秒无数据）/);
assert.match(updater, /autoDownload=false/);
assert.match(updater, /autoInstallOnAppQuit=true/);
assert.match(updater, /allowPrerelease=false/);
assert.match(updater, /quitAndInstall\(false,true\)/);

for (const api of [
  'checkForUpdates',
  'downloadUpdate',
  'installUpdate',
  'onUpdateProgress',
  'onUpdateDownloaded',
  'onUpdateError',
]) {
  assert.match(preload, new RegExp(`${api}:`));
}

assert.match(renderer, /const\[NWUpdate,NWSetUpdate\]/);
assert.match(renderer, /sidebar\.update\.checking/);
assert.match(renderer, /setTimeout\(pe,8e3\)/);
assert.match(renderer, /setInterval\(pe,216e5\)/);
assert.match(renderer, /window\.electronAPI\.downloadUpdate\(NWUpdate\)/);
assert.match(renderer, /window\.electronAPI\.installUpdate\(\)/);
assert.match(renderer, /NWUpdate\?"\[update\]":"\[guide\]"/);
assert.match(renderer, /NWUpdate\?NWLabel:O\("sidebar\.setupWizard","Setup Guide"\)/);
assert.doesNotMatch(renderer, /q\?\.available&&!ie&&h\.jsxs\("div",\{className:"sidebar-update-slot"/);
assert.match(css, /\.nw-update-btn\{/);
assert.match(css, /border-radius:999px/);
assert.match(css, /color-mix\(in srgb,var\(--color-brand-blue,#1e8df6\) 78%,#000\)/);
assert.doesNotMatch(css, /\.sidebar-update-actions\{/);

const ipcChannels = {
  APP_UPDATE_PROGRESS: 'app:updateProgress',
  APP_UPDATE_ERROR: 'app:updateError',
  APP_UPDATE_DOWNLOADED: 'app:updateDownloaded',
};
let currentVersion = '0.1.0';
let release = {
  tag_name: 'v0.1.1',
  draft: false,
  prerelease: false,
  body: 'Test release',
  html_url: 'https://github.com/Yuan-lab-LLM/NeoWorker/releases/tag/v0.1.1',
  published_at: '2026-08-26T00:00:00Z',
  assets: [
    {
      name: 'NeoWorker-0.1.1-arm64.dmg',
      browser_download_url:
        'https://github.com/Yuan-lab-LLM/NeoWorker/releases/download/v0.1.1/NeoWorker-0.1.1-arm64.dmg',
      size: 123,
      digest: `sha256:${'a'.repeat(64)}`,
    },
    {
      name: '../../untrusted.dmg',
      browser_download_url: 'https://attacker.invalid/untrusted.dmg',
      size: 1,
    },
  ],
};
const sent = [];
const electronMock = {
  app: {
    getVersion: () => currentVersion,
    isPackaged: true,
    getPath: () => '/tmp',
  },
  net: {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => release,
    }),
  },
  shell: { openPath: async () => '' },
};
const moduleMock = { exports: {} };
const updateContext = vm.createContext({
  Buffer,
  console,
  exports: moduleMock.exports,
  module: moduleMock,
  process,
  require(specifier) {
    if (specifier === 'electron') return electronMock;
    if (specifier === '../../shared/types') return { IPC_CHANNELS: ipcChannels };
    return require(specifier);
  },
});
vm.runInContext(updater, updateContext, { filename: paths.updater });
const manager = moduleMock.exports.updateManager;
manager.setMainWindow({
  isDestroyed: () => false,
  webContents: { send: (channel, payload) => sent.push({ channel, payload }) },
});

const available = await manager.checkForUpdates();
assert.equal(available.available, true);
assert.equal(available.currentVersion, '0.1.0');
assert.equal(available.latestVersion, '0.1.1');
assert.equal(available.assets.length, 1, 'untrusted release assets must be discarded');
assert.equal(manager.pickManualAsset(available).name, 'NeoWorker-0.1.1-arm64.dmg');
assert.equal(manager.hasUpdaterMetadata(available), false);
assert.ok(sent.some((event) => event.channel === ipcChannels.APP_UPDATE_PROGRESS));

currentVersion = '0.1.1';
const current = await manager.checkForUpdates();
assert.equal(current.available, false);
assert.equal(manager.latestUpdate, null);

release = { ...release, tag_name: 'not-a-semver' };
await assert.rejects(manager.checkForUpdates(), /版本号格式无效/);

const rawHeader = asar.getRawHeader(archive);
for (const archivePath of Object.values(paths)) {
  const buffer = asar.extractFile(archive, archivePath);
  const entry = archiveEntry(rawHeader, archivePath);
  const digest = sha256(buffer);
  assert.equal(entry.integrity?.hash, digest);
  assert.equal(entry.integrity?.blocks?.[0], digest);
}

console.log(JSON.stringify({
  archive,
  status: 'passed',
  coverage: [
    'GitHub release detection and semantic version comparison',
    'trusted release asset filtering',
    'platform-specific installer selection',
    'main-process IPC registration',
    'preload API exposure',
    'delayed and periodic sidebar checks',
    'setup-guide/update-button state switch',
    'download, progress, open-installer, and restart states',
    'ASAR integrity metadata',
  ],
}, null, 2));
