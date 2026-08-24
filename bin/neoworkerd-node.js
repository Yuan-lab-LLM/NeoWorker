#!/usr/bin/env node

// Apply NEOWORKER_TZ → TZ before any other code (systemd/Docker env support).
// Validate: invalid IANA timezone can cause silent date bugs.
if (process.env.NEOWORKER_TZ) {
  try {
    const test = new Date().toLocaleString("en-US", { timeZone: process.env.NEOWORKER_TZ });
    if (test && test !== "Invalid Date") {
      process.env.TZ = process.env.NEOWORKER_TZ;
    } else {
      console.warn(`[neoworkerd-node] Invalid NEOWORKER_TZ='${process.env.NEOWORKER_TZ}', using default`);
    }
  } catch {
    console.warn(`[neoworkerd-node] Invalid NEOWORKER_TZ='${process.env.NEOWORKER_TZ}', using default`);
  }
}

/**
 * neoworkerd-node: Node-only headless daemon entrypoint (no Electron/Xvfb).
 *
 * Defaults:
 * - headless (no UI)
 * - Control Plane enabled
 * - import env settings (so Linux deployments can configure providers via env vars)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts);
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function probeBetterSqlite3(packageDir) {
  try {
    // Require alone may not load the native binding; open an in-memory DB to force dlopen.
    await run(process.execPath, ['-e', "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close();"], { cwd: packageDir, stdio: 'ignore', shell: false });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const packageDir = path.resolve(__dirname, '..');
  const mainPath = path.join(packageDir, 'dist', 'daemon', 'daemon', 'main.js');

  const argv = process.argv.slice(2);
  if (hasFlag(argv, '-h') || hasFlag(argv, '--help')) {
    // eslint-disable-next-line no-console
    console.log([
      'NeoWorker daemon (Node-only, headless)',
      '',
      'Usage:',
      '  node bin/neoworkerd-node.js [daemonArgs...]',
      '',
      'Defaults (can be overridden by passing flags explicitly):',
      '  --headless',
      '  --enable-control-plane',
      '  --import-env-settings',
      '  --user-data-dir <path>',
      '',
      'Common env vars:',
      '  NEOWORKER_USER_DATA_DIR=/var/lib/neoworker',
      '  NEOWORKER_CONTROL_PLANE_HOST=127.0.0.1',
      '  NEOWORKER_CONTROL_PLANE_PORT=18789',
      '  NEOWORKER_LLM_PROVIDER=openai',
      '  OPENAI_API_KEY=...',
      '',
      'Examples:',
      '  node bin/neoworkerd-node.js --print-control-plane-token',
    ].join('\n'));
    return;
  }

  // Build daemon + connectors on source installs.
  if (!fs.existsSync(mainPath)) {
    // eslint-disable-next-line no-console
    console.log('NeoWorker: Building (daemon + connectors)...');
    try {
      await run('npm', ['run', 'build:daemon'], { cwd: packageDir, stdio: 'inherit', shell: true });
      await run('npm', ['run', 'build:connectors'], { cwd: packageDir, stdio: 'inherit', shell: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Build failed. Run "npm run build:daemon && npm run build:connectors" manually.');
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }
  }

  // Node-only daemon needs better-sqlite3 built for Node, but this repo also supports Electron
  // which may have rebuilt the native addon for Electron's ABI. If the probe fails, rebuild for Node.
  const ok = await probeBetterSqlite3(packageDir);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.log('NeoWorker: Rebuilding native deps for Node (better-sqlite3)...');
    try {
      await run('npm', ['rebuild', 'better-sqlite3'], { cwd: packageDir, stdio: 'inherit', shell: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to rebuild better-sqlite3 for Node. Ensure build tools are installed or use Docker.');
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }
  }

  const defaultArgs = ['--headless', '--enable-control-plane', '--import-env-settings'];
  const args = [...defaultArgs, ...argv];

  const node = spawn(process.execPath, [mainPath, ...args], {
    cwd: packageDir,
    stdio: 'inherit',
    env: { ...process.env },
  });

  node.on('close', (code) => {
    // eslint-disable-next-line no-process-exit
    process.exit(code);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err?.stack || String(err));
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
