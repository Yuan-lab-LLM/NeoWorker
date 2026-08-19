#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");
const fs = require("fs");

const packageDir = path.resolve(__dirname, "..");
const mainPath = path.join(packageDir, "dist", "cli", "cli", "main.js");

if (!fs.existsSync(mainPath)) {
  console.log("[neoworker] CLI build artifacts are missing, running npm run build:cli...");
  const res = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:cli"], {
    cwd: packageDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (res.status !== 0) {
    process.exit(res.status || 1);
  }
}

const cli = require(mainPath);
Promise.resolve(cli.main(process.argv.slice(2)))
  .then((code) => {
    process.exitCode = typeof code === "number" ? code : 0;
  })
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
