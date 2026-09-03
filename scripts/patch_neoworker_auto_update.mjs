import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const { Pickle } = require('@electron/asar/lib/pickle');

const sourceArchive = path.resolve(
  process.argv[2] ?? '/Applications/NeoWorker.app/Contents/Resources/app.asar',
);
const outputArchive = path.resolve(
  process.argv[3] ?? '.novaready/package-output/app.auto-update.asar',
);

const mainBundlePath = 'dist/electron/electron/main.js';
const updateManagerPath = 'dist/electron/electron/updater/update-manager.js';
const rendererBundlePath = 'dist/renderer/assets/index-BTC5MTVk.js';
const rendererCssPath = 'dist/renderer/assets/index-DuUtsx0I.css';

let updateManagerSource = String.raw`"use strict";
Object.defineProperty(exports,"__esModule",{value:true});
exports.updateManager=exports.UpdateManager=void 0;
const electron=require("electron");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const types=require("../../shared/types");
class UpdateManager{
mainWindow=null;
repoOwner="Yuan-lab-LLM";
repoName="NeoWorker";
isUpdating=false;
latestUpdate=null;
manualDownloadPath=null;
autoUpdater=null;
setMainWindow(window){this.mainWindow=window}
send(channel,payload){if(this.mainWindow&&!this.mainWindow.isDestroyed())this.mainWindow.webContents.send(channel,payload)}
sendProgress(progress){this.send(types.IPC_CHANNELS.APP_UPDATE_PROGRESS,progress)}
sendError(error){this.send(types.IPC_CHANNELS.APP_UPDATE_ERROR,{error:String(error||"更新失败")})}
currentVersion(){return process.env.NEOWORKER_UPDATE_TEST_VERSION||electron.app.getVersion()}
async getVersionInfo(){return{version:electron.app.getVersion(),isDev:!electron.app.isPackaged,isGitRepo:false,isNpmGlobal:false}}
isNewerVersion(latest,current){const parse=value=>String(value||"").replace(/^v/,"").split(/[.+-]/).slice(0,3).map(part=>Number.parseInt(part,10)||0),a=parse(latest),b=parse(current);for(let i=0;i<3;i++){if(a[i]>b[i])return true;if(a[i]<b[i])return false}return false}
releaseApiUrl(){return \`https://api.github.com/repos/\${this.repoOwner}/\${this.repoName}/releases/latest\`}
assetUrlPrefix(){return \`https://github.com/\${this.repoOwner}/\${this.repoName}/releases/download/\`}
normalizeRelease(release,currentVersion){if(!release||release.draft||release.prerelease)throw new Error("没有可用的正式版本");const latestVersion=String(release.tag_name||"").replace(/^v/,"");if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(latestVersion))throw new Error("GitHub Release 版本号格式无效");const prefix=this.assetUrlPrefix();const assets=Array.isArray(release.assets)?release.assets.filter(asset=>asset&&typeof asset.name==="string"&&typeof asset.browser_download_url==="string"&&asset.browser_download_url.startsWith(prefix)).map(asset=>({name:path.basename(asset.name),url:asset.browser_download_url,size:Number(asset.size)||0,digest:typeof asset.digest==="string"?asset.digest:null})):[];return{available:this.isNewerVersion(latestVersion,currentVersion),currentVersion,latestVersion,releaseNotes:typeof release.body==="string"?release.body:"",releaseUrl:typeof release.html_url==="string"?release.html_url:\`https://github.com/\${this.repoOwner}/\${this.repoName}/releases\`,publishedAt:release.published_at||null,updateMode:"electron-updater",assets}}
async checkForUpdates(){const currentVersion=this.currentVersion();this.sendProgress({phase:"checking",message:"正在检查更新…"});try{const response=await electron.net.fetch(this.releaseApiUrl(),{headers:{Accept:"application/vnd.github+json","User-Agent":"NeoWorker-Updater"}});if(response.status===404){this.latestUpdate=null;return{available:false,currentVersion,latestVersion:currentVersion,updateMode:"electron-updater"}}if(!response.ok)throw new Error(\`GitHub 更新检查失败（\${response.status}）\`);const info=this.normalizeRelease(await response.json(),currentVersion);this.latestUpdate=info.available?info:null;return info}catch(error){this.sendError(error instanceof Error?error.message:String(error));throw error}}
hasUpdaterMetadata(info){const pattern=process.platform==="darwin"?/^latest-mac\.yml$/i:process.platform==="win32"?/^latest\.yml$/i:/^latest-linux\.yml$/i;return info.assets.some(asset=>pattern.test(asset.name))}
pickManualAsset(info){const arch=process.arch;const assets=info.assets;const patterns=process.platform==="darwin"?[arch==="arm64"?/arm64.*\.dmg$/i:/x64.*\.dmg$/i,/\.dmg$/i]:process.platform==="win32"?[arch==="arm64"?/arm64.*(?:setup)?\.exe$/i:/x64.*(?:setup)?\.exe$/i,/(?:setup|installer).*\.exe$/i,/\.exe$/i]:[/\.AppImage$/i,/\.deb$/i,/\.rpm$/i];for(const pattern of patterns){const asset=assets.find(candidate=>pattern.test(candidate.name));if(asset)return asset}return null}
configureAutoUpdater(){if(this.autoUpdater)return this.autoUpdater;const updater=require("electron-updater").autoUpdater;updater.autoDownload=false;updater.autoInstallOnAppQuit=true;updater.allowPrerelease=false;updater.setFeedURL({provider:"github",owner:this.repoOwner,repo:this.repoName});updater.on("checking-for-update",()=>this.sendProgress({phase:"checking",message:"正在准备更新…"}));updater.on("download-progress",progress=>this.sendProgress({phase:"downloading",percent:Math.round(progress.percent),message:\`正在下载更新 \${Math.round(progress.percent)}%\`,bytesDownloaded:progress.transferred,bytesTotal:progress.total}));updater.on("update-downloaded",info=>{this.sendProgress({phase:"complete",percent:100,message:"更新已下载，可以重启安装"});this.send(types.IPC_CHANNELS.APP_UPDATE_DOWNLOADED,{requiresRestart:true,manual:false,version:info.version})});updater.on("error",error=>this.sendError(error.message));this.autoUpdater=updater;return updater}
async downloadWithElectronUpdater(){const updater=this.configureAutoUpdater();const result=await updater.checkForUpdates();if(!result?.updateInfo||!this.isNewerVersion(result.updateInfo.version,electron.app.getVersion()))throw new Error("更新元数据与最新版本不匹配");await updater.downloadUpdate()}
async downloadManualAsset(info){const asset=this.pickManualAsset(info);if(!asset)throw new Error("这个版本没有适用于当前系统的安装包");if(!asset.url.startsWith(this.assetUrlPrefix()))throw new Error("拒绝不受信任的更新地址");const downloads=electron.app.getPath("downloads");await fs.promises.mkdir(downloads,{recursive:true});const destination=path.join(downloads,asset.name);const temporary=\`\${destination}.download\`;await fs.promises.rm(temporary,{force:true});const response=await electron.net.fetch(asset.url,{headers:{"User-Agent":"NeoWorker-Updater"}});if(!response.ok||!response.body)throw new Error(\`更新下载失败（\${response.status}）\`);const total=Number(response.headers.get("content-length"))||asset.size||0;const handle=await fs.promises.open(temporary,"w");const hash=crypto.createHash("sha256");let transferred=0;try{const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;const chunk=Buffer.from(value);await handle.write(chunk);hash.update(chunk);transferred+=chunk.length;const percent=total?Math.min(99,Math.round(transferred/total*100)):0;this.sendProgress({phase:"downloading",percent,message:percent?\`正在下载更新 \${percent}%\`:"正在下载更新…",bytesDownloaded:transferred,bytesTotal:total})}}finally{await handle.close()}const actual=hash.digest("hex");const expected=asset.digest?.match(/^sha256:([a-f0-9]{64})$/i)?.[1]?.toLowerCase();if(expected&&actual!==expected){await fs.promises.rm(temporary,{force:true});throw new Error("更新包校验失败，文件已删除")}await fs.promises.rm(destination,{force:true});await fs.promises.rename(temporary,destination);this.manualDownloadPath=destination;this.sendProgress({phase:"complete",percent:100,message:"安装包已下载"});this.send(types.IPC_CHANNELS.APP_UPDATE_DOWNLOADED,{requiresRestart:false,manual:true,path:destination,version:info.latestVersion})}
async downloadAndInstallUpdate(){if(this.isUpdating)throw new Error("更新正在下载中");this.isUpdating=true;try{const info=this.latestUpdate||await this.checkForUpdates();if(!info?.available)throw new Error("当前已经是最新版本");if(this.hasUpdaterMetadata(info))await this.downloadWithElectronUpdater();else await this.downloadManualAsset(info)}catch(error){const message=error instanceof Error?error.message:String(error);this.sendProgress({phase:"error",message});this.sendError(message);throw error}finally{this.isUpdating=false}}
async installUpdateAndRestart(){if(this.manualDownloadPath){const error=await electron.shell.openPath(this.manualDownloadPath);if(error)throw new Error(error);return{manual:true,path:this.manualDownloadPath}}if(this.autoUpdater){this.autoUpdater.quitAndInstall(false,true);return{manual:false}}throw new Error("还没有下载可安装的更新")}
}
exports.UpdateManager=UpdateManager;
exports.updateManager=new UpdateManager();
`.replaceAll('\\`', '`').replaceAll('\\${', '${');

// GitHub's release metadata is available before the large CDN asset is ready.
// Always use the streaming downloader here so the sidebar receives real byte
// progress instead of electron-updater's initial 0% event hanging indefinitely.
updateManagerSource = updateManagerSource
  .replace(
    'url:asset.browser_download_url,size:Number(asset.size)||0,digest:',
    'url:asset.browser_download_url,apiUrl:typeof asset.url==="string"?asset.url:null,size:Number(asset.size)||0,digest:',
  )
  .replace(
    'const response=await electron.net.fetch(asset.url,{headers:{"User-Agent":"NeoWorker-Updater"}});',
    'const response=await electron.net.fetch(asset.apiUrl||asset.url,{headers:{"User-Agent":"NeoWorker-Updater",...(asset.apiUrl?{Accept:"application/octet-stream"}:{})}});',
  )
  .replace(
    'const response=await electron.net.fetch(asset.apiUrl||asset.url,{headers:{"User-Agent":"NeoWorker-Updater",...(asset.apiUrl?{Accept:"application/octet-stream"}:{})}});',
    'const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let response;try{response=await electron.net.fetch(asset.apiUrl||asset.url,{headers:{"User-Agent":"NeoWorker-Updater",...(asset.apiUrl?{Accept:"application/octet-stream"}:{})},signal:controller.signal})}finally{clearTimeout(timer)}',
  )
  .replace(
    'if(this.hasUpdaterMetadata(info))await this.downloadWithElectronUpdater();else await this.downloadManualAsset(info)',
    'await this.downloadManualAsset(info)',
  )
  .replace(
    'const reader=response.body.getReader();for(;;){const {done,value}=await reader.read();',
    'const reader=response.body.getReader(),readChunk=()=>new Promise((resolve,reject)=>{const idleTimer=setTimeout(()=>reject(new Error("更新下载超时（45秒无数据）")),45000);reader.read().then(value=>{clearTimeout(idleTimer);resolve(value)},error=>{clearTimeout(idleTimer);reject(error)})});for(;;){const {done,value}=await readChunk();',
  );

const mainWindowAnchor = `            if (shouldStartMaximized) {`;
const mainWindowWiring = `            require("./updater").updateManager.setMainWindow(mainWindow);\n            if (shouldStartMaximized) {`;
const sidebarStateAnchor = `sn=Je.length>0;w.useEffect(()=>{window.electronAPI.getAgentRoles`;
let sidebarState = `sn=Je.length>0;const[NWUpdate,NWSetUpdate]=w.useState(null),[NWProgressState,NWSetProgress]=w.useState(null),[NWReady,NWSetReady]=w.useState(null);w.useEffect(()=>{let F=!0,pe=()=>window.electronAPI?.checkForUpdates?.().then(xe=>{F&&(NWSetUpdate(xe?.available?xe:null),NWSetProgress(state=>state?.phase==="checking"?null:state))}).catch(()=>{F&&NWSetProgress(state=>state?.phase==="checking"?null:state)}),xe=setTimeout(pe,8e3),Ie=setInterval(pe,216e5),we=window.electronAPI?.onUpdateProgress?.(Qe=>{F&&NWSetProgress(Qe)}),Qe=window.electronAPI?.onUpdateDownloaded?.(qe=>{F&&(NWSetReady(qe),NWSetProgress({phase:"complete",percent:100}))}),et=window.electronAPI?.onUpdateError?.(()=>{F&&(NWSetProgress(null),NWSetReady(null))});return()=>{F=!1,clearTimeout(xe),clearInterval(Ie),we?.(),Qe?.(),et?.()}},[]);const NWBusy=NWProgressState?.phase==="downloading"||NWProgressState?.phase==="checking",NWPercent=Math.round(NWProgressState?.percent||0),NWLabel=NWReady?O(NWReady.manual?"sidebar.update.openInstaller":"sidebar.update.restart",NWReady.manual?"打开安装包":"重启更新"):NWProgressState?.phase==="checking"?O("sidebar.update.checking","正在检查更新…"):NWBusy?O("sidebar.update.downloading",\`正在下载 \${NWPercent}%\`,{percent:NWPercent}):O("sidebar.update.download",\`下载 v\${NWUpdate?.latestVersion||""}\`,{version:NWUpdate?.latestVersion||""}),NWTitle=NWReady?O("sidebar.update.readyTitle","更新已下载，点击安装"):NWProgressState?.phase==="checking"?O("sidebar.update.checking","正在检查更新…"):NWBusy?O("sidebar.update.progressTitle",\`正在下载 NeoWorker v\${NWUpdate?.latestVersion||""}：\${NWPercent}%\`,{version:NWUpdate?.latestVersion||"",percent:NWPercent}):O("sidebar.update.availableTitle",\`发现 NeoWorker v\${NWUpdate?.latestVersion||""}\`,{version:NWUpdate?.latestVersion||""}),NWClick=()=>{if(!NWUpdate){I?.();return}if(NWReady){window.electronAPI.installUpdate().catch(()=>{});return}NWSetProgress({phase:"downloading",percent:0}),window.electronAPI.downloadUpdate(NWUpdate).catch(()=>NWSetProgress(null))};w.useEffect(()=>{window.electronAPI.getAgentRoles`;

// Do not call the checking phase "downloading 0%"; that misleading label was
// the visible symptom reported by users while the release request was pending.
sidebarState = sidebarState.replace(
  'NWBusy?O("sidebar.update.downloading",`正在下载 ${NWPercent}%`,{percent:NWPercent})',
  'NWProgressState?.phase==="checking"?O("sidebar.update.checking","正在检查更新…"):NWBusy?O("sidebar.update.downloading",`正在下载 ${NWPercent}%`,{percent:NWPercent})',
);

const oldGuideButton = `I&&h.jsxs("button",{className:"settings-btn cli-settings-btn cli-onboarding-btn",onClick:I,title:O("sidebar.setupWizard.title","Open setup guide"),"aria-label":O("sidebar.setupWizard.aria","Open setup guide"),children:[h.jsx("span",{className:"terminal-only",children:"[guide]"}),h.jsxs("span",{className:"modern-only",children:[h.jsx(Pc,{size:15,strokeWidth:2}),O("sidebar.setupWizard","Setup Guide")]})]})`;
const newGuideButton = `(I||NWUpdate)&&h.jsxs("button",{className:\`settings-btn cli-settings-btn cli-onboarding-btn \${NWUpdate?"nw-update-btn":""}\`,onClick:NWClick,disabled:!!NWUpdate&&NWBusy,title:NWUpdate?NWTitle:O("sidebar.setupWizard.title","Open setup guide"),"aria-label":NWUpdate?NWTitle:O("sidebar.setupWizard.aria","Open setup guide"),children:[h.jsx("span",{className:"terminal-only",children:NWUpdate?"[update]":"[guide]"}),h.jsxs("span",{className:"modern-only",children:[NWUpdate?h.jsx("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:h.jsx("path",{d:"M12 3v12m-5-5 5 5 5-5M5 21h14"})}):h.jsx(Pc,{size:15,strokeWidth:2}),NWUpdate?NWLabel:O("sidebar.setupWizard","Setup Guide")]})]})`;

const oldUpdateTranslations = `"updates.loading":"正在加载版本信息...","updates.currentVersion":"当前版本","updates.unknown":"未知","updates.developmentMode":"开发模式","updates.installedViaNpm":"通过 npm 安装","updates.check.title":"检查更新","updates.check.npm":"更新将通过 npm 安装。","updates.check.git":"更新将从 GitHub 拉取并自动重新构建。","updates.check.auto":"更新将自动下载并安装。","updates.checking":"正在检查...","updates.check.action":"检查更新","updates.available":"有可用更新！","updates.current":"当前","updates.latest":"最新","updates.released":"发布时间","updates.releaseNotes":"发行说明","updates.viewOnGithub":"在 GitHub 查看","updates.method":"更新方式","updates.upToDate":"已经是最新版本！","updates.updateNowNpm":"立即更新（npm install）","updates.updateNowGit":"立即更新（Git Pull + 重新构建）","updates.downloadInstall":"下载并安装更新","updates.restart":"重启以应用更新","updates.manual.title":"手动更新","updates.manual.description.command":"你也可以在终端运行这条命令手动更新：","updates.manual.description.commands":"你也可以在终端运行这些命令手动更新：","updates.manual.restartHint":"更新完成后，请重启应用以应用更改。",`;
const newUpdateTranslations = ``;

const updateCss = `.nw-update-btn{width:auto!important;max-width:170px!important;color:#fff!important;background:color-mix(in srgb,var(--color-brand-blue,#1e8df6) 78%,#000)!important;border-radius:999px!important;padding:0 11px!important;box-shadow:0 4px 12px color-mix(in srgb,var(--color-brand-blue,#1e8df6) 22%,transparent)!important}.nw-update-btn:hover{color:#fff!important;background:color-mix(in srgb,var(--color-brand-blue,#1e8df6) 70%,#000)!important}.nw-update-btn:disabled{cursor:progress!important;opacity:.82}.nw-update-btn .modern-only{gap:6px!important;white-space:nowrap;font-size:12px!important;line-height:1.2!important}.nw-update-btn .modern-only svg{width:15px;height:15px}`;

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

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  const last = source.lastIndexOf(from);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one match, found ${first < 0 ? 0 : 'multiple'}`);
  }
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function fitToOriginalSize(source, original, label) {
  const patched = Buffer.from(source.trimEnd(), 'utf8');
  if (patched.length > original.length) {
    throw new Error(`${label}: patch grew by ${patched.length - original.length} bytes`);
  }
  return Buffer.concat([patched, Buffer.alloc(original.length - patched.length, 0x20)]);
}

function patchMainBundle(original) {
  let source = original.toString('utf8').trimEnd();
  if (!source.includes('updateManager.setMainWindow(mainWindow)')) {
    source = replaceExactlyOnce(source, mainWindowAnchor, mainWindowWiring, 'updater window wiring');
  }
  return fitToOriginalSize(source, original, mainBundlePath);
}

function patchUpdateManager(original) {
  if (Buffer.byteLength(updateManagerSource) > original.length) {
    throw new Error(`${updateManagerPath}: replacement is too large`);
  }
  return fitToOriginalSize(updateManagerSource, original, updateManagerPath);
}

function removeLegacyUpdateBanner(source) {
  const startNeedle = `q?.available&&!ie&&h.jsxs("div",{className:"sidebar-update-slot"`;
  const endNeedle = `,h.jsxs("div",{className:"sidebar-brand-row"`;
  const start = source.indexOf(startNeedle);
  if (start < 0) return source;
  const end = source.indexOf(endNeedle, start);
  if (end < 0) throw new Error('legacy update banner end anchor was not found');
  return source.slice(0, start) + `h.jsxs("div",{className:"sidebar-brand-row"` + source.slice(end + endNeedle.length);
}

function patchRendererBundle(original) {
  let source = original.toString('utf8').trimEnd();
  if (source.includes('const[NWUpdate,NWSetUpdate]')) {
    let patched = source.replace(
      'pe=()=>window.electronAPI?.checkForUpdates?.().then(xe=>{F&&NWSetUpdate(xe?.available?xe:null)}).catch(()=>{})',
      'pe=()=>window.electronAPI?.checkForUpdates?.().then(xe=>{F&&(NWSetUpdate(xe?.available?xe:null),NWSetProgress(state=>state?.phase==="checking"?null:state))}).catch(()=>{F&&NWSetProgress(state=>state?.phase==="checking"?null:state)})',
    );
    patched = patched.replace(
      'NWTitle=NWReady?O("sidebar.update.readyTitle","更新已下载，点击安装"):NWBusy?',
      'NWTitle=NWReady?O("sidebar.update.readyTitle","更新已下载，点击安装"):NWProgressState?.phase==="checking"?O("sidebar.update.checking","正在检查更新…"):NWBusy?',
    );
    const checkingLabel = 'NWProgressState?.phase==="checking"?O("sidebar.update.checking","正在检查更新…"):';
    while (patched.includes(`${checkingLabel}${checkingLabel}`)) {
      patched = patched.replace(`${checkingLabel}${checkingLabel}`, checkingLabel);
    }
    return fitToOriginalSize(patched, original, rendererBundlePath);
  }
  source = removeLegacyUpdateBanner(source);
  source = replaceExactlyOnce(
    source,
    `Bo();const[ie,Fe]=w.useState(!1),[ke`,
    `Bo();const[ke`,
    'remove dismissed legacy update state',
  );
  source = source.replace(
    `&&(e.updateInfo?.latestVersion===n.updateInfo?.latestVersion)`,
    '',
  );
  source = source.replace(
    `,updateInfo:q,onViewUpdate:ge})`,
    `})`,
  );
  source = source.replace(
    `,updateInfo:null,onViewUpdate:()=>{qt("updates"),A("settings")}`,
    ``,
  );
  source = replaceExactlyOnce(source, sidebarStateAnchor, sidebarState, 'sidebar updater state');
  source = replaceExactlyOnce(source, oldGuideButton, newGuideButton, 'setup guide update button');
  source = replaceExactlyOnce(
    source,
    oldUpdateTranslations,
    newUpdateTranslations,
    'update translations',
  );
  return fitToOriginalSize(source, original, rendererBundlePath);
}

function patchRendererCss(original) {
  let source = original.toString('utf8').trimEnd();
  if (source.includes('.nw-update-btn{')) return original;
  const legacyStart = source.indexOf('.sidebar-update-actions{');
  const legacyEnd = source.indexOf('button,input,select,textarea,a,', legacyStart);
  if (legacyStart >= 0 && legacyEnd > legacyStart) {
    source = source.slice(0, legacyStart) + source.slice(legacyEnd);
  }
  return fitToOriginalSize(source + updateCss, original, rendererCssPath);
}

if (!fs.existsSync(sourceArchive)) throw new Error(`Source ASAR not found: ${sourceArchive}`);
if (sourceArchive === outputArchive) throw new Error('Refusing to patch the source archive in place');

const rawHeader = asar.getRawHeader(sourceArchive);
const patchSpecs = [
  { archivePath: mainBundlePath, build: patchMainBundle },
  { archivePath: updateManagerPath, build: patchUpdateManager },
  { archivePath: rendererBundlePath, build: patchRendererBundle },
  { archivePath: rendererCssPath, build: patchRendererCss },
];
const patches = patchSpecs.map(({ archivePath, build }) => {
  const entry = archiveEntry(rawHeader, archivePath);
  const original = asar.extractFile(sourceArchive, archivePath);
  const patched = build(original);
  if (Number(entry.size) !== original.length || patched.length !== original.length) {
    throw new Error(`${archivePath}: ASAR entry size mismatch`);
  }
  const oldHash = entry.integrity?.hash;
  if (!oldHash || entry.integrity?.algorithm !== 'SHA256') {
    throw new Error(`${archivePath}: unsupported ASAR integrity metadata`);
  }
  if (!Array.isArray(entry.integrity.blocks) || entry.integrity.blocks.length !== 1) {
    throw new Error(`${archivePath}: unsupported ASAR integrity block layout`);
  }
  return { archivePath, entry, original, patched, newHash: sha256(patched) };
});

fs.mkdirSync(path.dirname(outputArchive), { recursive: true });
fs.copyFileSync(sourceArchive, outputArchive);
const fd = fs.openSync(outputArchive, 'r+');
try {
  for (const patch of patches) {
    const absoluteOffset = rawHeader.headerSize + 8 + Number(patch.entry.offset);
    const current = Buffer.alloc(patch.original.length);
    fs.readSync(fd, current, 0, current.length, absoluteOffset);
    if (!current.equals(patch.original)) {
      throw new Error(`${patch.archivePath}: source bytes do not match ASAR offset`);
    }
    fs.writeSync(fd, patch.patched, 0, patch.patched.length, absoluteOffset);
    patch.entry.integrity.hash = patch.newHash;
    patch.entry.integrity.blocks = [patch.newHash];
  }
  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(rawHeader.header));
  const headerBuffer = headerPickle.toBuffer();
  if (headerBuffer.length !== rawHeader.headerSize) {
    throw new Error(`ASAR header size changed from ${rawHeader.headerSize} to ${headerBuffer.length}`);
  }
  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(headerBuffer.length);
  const sizeBuffer = sizePickle.toBuffer();
  fs.writeSync(fd, sizeBuffer, 0, sizeBuffer.length, 0);
  fs.writeSync(fd, headerBuffer, 0, headerBuffer.length, sizeBuffer.length);
  fs.fsyncSync(fd);
} finally {
  fs.closeSync(fd);
}

asar.uncache(outputArchive);
const verifiedHeader = asar.getRawHeader(outputArchive);
for (const patch of patches) {
  const verified = asar.extractFile(outputArchive, patch.archivePath);
  const verifiedEntry = archiveEntry(verifiedHeader, patch.archivePath);
  const digest = sha256(verified);
  if (!verified.equals(patch.patched)) throw new Error(`${patch.archivePath}: verification failed`);
  if (verifiedEntry.integrity?.hash !== digest || verifiedEntry.integrity?.blocks?.[0] !== digest) {
    throw new Error(`${patch.archivePath}: integrity metadata mismatch`);
  }
}

console.log(JSON.stringify({
  sourceArchive,
  outputArchive,
  archiveBytes: fs.statSync(outputArchive).size,
  patchedEntries: patches.map((patch) => ({
    path: patch.archivePath,
    bytes: patch.patched.length,
    sha256: patch.newHash,
  })),
}, null, 2));
