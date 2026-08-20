import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export function scriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}

export function createAppRequire(importMetaUrl) {
  const dir = scriptDir(importMetaUrl);
  const candidates = [
    path.resolve(dir, "../../../../package.json"),
    path.resolve(dir, "../../../app.asar/package.json"),
    path.resolve(dir, "../../../app.asar.unpacked/package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return createRequire(candidate);
  }
  return createRequire(importMetaUrl);
}

export function loadPresentationRuntime(importMetaUrl) {
  const requireFromApp = createAppRequire(importMetaUrl);
  const pptxgenjsModule = requireFromApp("pptxgenjs");
  const jszipModule = requireFromApp("jszip");
  return {
    PptxGenJS: pptxgenjsModule.default || pptxgenjsModule,
    JSZip: jszipModule.default || jszipModule,
  };
}

export function which(command) {
  if (process.platform === "win32") {
    try {
      return execFileSync("where", [command], { encoding: "utf-8" })
        .split(/\r?\n/)
        .map((value) => value.trim())
        .find(Boolean) || null;
    } catch {
      return null;
    }
  }
  try {
    return execFileSync("which", [command], { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

export function resolveLibreOffice() {
  const candidates = [
    process.env.LIBREOFFICE_PATH,
    which("soffice"),
    process.platform === "darwin"
      ? "/Applications/LibreOffice.app/Contents/MacOS/soffice"
      : null,
    process.platform === "win32"
      ? "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
      : null,
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

export function resolvePlatformFonts(language = "auto") {
  const normalizedLanguage = String(language || "auto").toLowerCase();
  const needsCjk = ["auto", "chinese", "mixed", "zh", "zh-cn"].includes(
    normalizedLanguage,
  );
  if (!needsCjk) {
    return {
      heading: process.platform === "win32" ? "Aptos Display" : "Avenir Next",
      body: process.platform === "win32" ? "Aptos" : "Arial",
      mono: process.platform === "win32" ? "Cascadia Mono" : "Menlo",
    };
  }

  if (process.platform === "darwin") {
    return { heading: "PingFang SC", body: "PingFang SC", mono: "Menlo" };
  }
  if (process.platform === "win32") {
    return {
      heading: "Microsoft YaHei",
      body: "Microsoft YaHei",
      mono: "Cascadia Mono",
    };
  }
  return {
    heading: "Noto Sans CJK SC",
    body: "Noto Sans CJK SC",
    mono: "Noto Sans Mono CJK SC",
  };
}

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    parsed[key] =
      argv[index + 1] && !argv[index + 1].startsWith("--")
        ? argv[++index]
        : "true";
  }
  return parsed;
}

export function presentationPalette(name = "auto") {
  const palettes = {
    authority: {
      primary: "2B2D42",
      secondary: "8D99AE",
      accent: "EF233C",
      light: "EDF2F4",
      bg: "F8FAFC",
      text: "161B2B",
    },
    technology: {
      primary: "03045E",
      secondary: "0077B6",
      accent: "00B4D8",
      light: "CAF0F8",
      bg: "F7FBFF",
      text: "07112B",
    },
    editorial: {
      primary: "335C67",
      secondary: "9E2A2B",
      accent: "E09F3E",
      light: "FFF3B0",
      bg: "FFFDF7",
      text: "2A2020",
    },
    premium: {
      primary: "0A0A0A",
      secondary: "4A5759",
      accent: "D4AF37",
      light: "F5F5F5",
      bg: "FFFFFF",
      text: "0A0A0A",
    },
    analysis: {
      primary: "264653",
      secondary: "2A9D8F",
      accent: "E76F51",
      light: "E9C46A",
      bg: "FBFAF4",
      text: "18313A",
    },
  };
  const key = String(name || "auto").trim().toLowerCase();
  return palettes[key] || palettes.analysis;
}

function escapeFontconfigXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function createPresentationFontEnvironment(cacheRoot) {
  const configDir = path.join(cacheRoot, "fontconfig");
  const cacheDir = path.join(configDir, "cache");
  const configPath = path.join(configDir, "fonts.conf");
  await fsp.mkdir(cacheDir, { recursive: true });

  const candidates =
    process.platform === "darwin"
      ? [
          "/System/Library/Fonts",
          "/System/Library/Fonts/Supplemental",
          "/System/Library/AssetsV2/com_apple_MobileAsset_Font7",
          "/Library/Fonts",
          path.join(os.homedir(), "Library", "Fonts"),
        ]
      : process.platform === "win32"
        ? [
            path.join(process.env.WINDIR || "C:\\Windows", "Fonts"),
            process.env.LOCALAPPDATA
              ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Windows", "Fonts")
              : "",
          ]
        : [
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            path.join(os.homedir(), ".fonts"),
            path.join(os.homedir(), ".local", "share", "fonts"),
          ];
  const fontDirs = candidates.filter((candidate) => {
    try {
      return Boolean(candidate) && fs.statSync(candidate).isDirectory();
    } catch {
      return false;
    }
  });

  const sansFallbacks = [
    "PingFang SC",
    "Hiragino Sans GB",
    "Heiti SC",
    "Microsoft YaHei",
    "Noto Sans CJK SC",
    "Arial Unicode MS",
  ];
  const aliases = [
    "PingFang SC",
    "Microsoft YaHei",
    "Microsoft JhengHei",
    "SimHei",
    "SimSun",
    "Aptos",
    "Calibri",
    "Arial",
    "sans-serif",
  ];
  const config = [
    '<?xml version="1.0"?>',
    '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
    "<fontconfig>",
    ...fontDirs.map((fontDir) => `  <dir>${escapeFontconfigXml(fontDir)}</dir>`),
    `  <cachedir>${escapeFontconfigXml(cacheDir)}</cachedir>`,
    ...aliases.flatMap((family) => [
      `  <alias><family>${escapeFontconfigXml(family)}</family><prefer>`,
      ...sansFallbacks.map(
        (fallback) => `    <family>${escapeFontconfigXml(fallback)}</family>`,
      ),
      "  </prefer></alias>",
    ]),
    "  <alias><family>serif</family><prefer><family>Songti SC</family><family>STSong</family><family>Arial Unicode MS</family></prefer></alias>",
    "</fontconfig>",
    "",
  ].join("\n");
  await fsp.writeFile(configPath, config, "utf-8");
  return {
    ...process.env,
    FONTCONFIG_FILE: configPath,
    FONTCONFIG_PATH: configDir,
  };
}
