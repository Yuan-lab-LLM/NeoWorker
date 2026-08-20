#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP_ICON = path.join(ROOT, "src/renderer/public/neoworker-app-icon.png");
const SIDEBAR_OUT = path.join(ROOT, "build/installerSidebar.bmp");
const HEADER_OUT = path.join(ROOT, "build/installerHeader.bmp");
const SCALE = 4;

const cjkFontCandidates = [
  "/System/Library/Fonts/STHeiti Medium.ttc",
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/simhei.ttf",
];
const cjkFont = cjkFontCandidates.find((candidate) => fs.existsSync(candidate));
if (cjkFont) {
  GlobalFonts.registerFromPath(cjkFont, "NeoWorker CJK");
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawTrackingText(ctx, text, x, y, tracking) {
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + tracking;
  }
}

function buildAtScale(width, height, draw) {
  const canvas = createCanvas(width * SCALE, height * SCALE);
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  draw(ctx, width, height);

  const output = createCanvas(width, height);
  const outputContext = output.getContext("2d");
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(canvas, 0, 0, width, height);
  return output;
}

function writeBmp24(canvas, outputPath) {
  const { width, height } = canvas;
  const rgba = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const rowBytes = width * 3;
  const paddedRowBytes = (rowBytes + 3) & ~3;
  const pixelBytes = paddedRowBytes * height;
  const headerBytes = 14 + 40;
  const buffer = Buffer.alloc(headerBytes + pixelBytes);

  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(headerBytes, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  buffer.writeInt32LE(3780, 38);
  buffer.writeInt32LE(3780, 42);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const targetRow = headerBytes + y * paddedRowBytes;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4;
      const target = targetRow + x * 3;
      const alpha = rgba[source + 3] / 255;
      buffer[target] = Math.round(rgba[source + 2] * alpha + 255 * (1 - alpha));
      buffer[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * (1 - alpha));
      buffer[target + 2] = Math.round(rgba[source] * alpha + 255 * (1 - alpha));
    }
  }

  fs.writeFileSync(outputPath, buffer);
}

const icon = await loadImage(APP_ICON);

const sidebar = buildAtScale(164, 314, (ctx, width, height) => {
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#f8fbff");
  background.addColorStop(0.55, "#eef8ff");
  background.addColorStop(1, "#e8fbff");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(122, 58, 2, 122, 58, 116);
  glow.addColorStop(0, "rgba(25, 214, 229, 0.34)");
  glow.addColorStop(0.48, "rgba(32, 137, 255, 0.16)");
  glow.addColorStop(1, "rgba(32, 137, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const accent = ctx.createLinearGradient(0, 0, 0, height);
  accent.addColorStop(0, "#0a7cff");
  accent.addColorStop(1, "#16d9d0");
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 4, height);

  ctx.save();
  ctx.shadowColor = "rgba(9, 54, 128, 0.22)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  roundedRect(ctx, 20, 24, 124, 124, 28);
  ctx.clip();
  ctx.drawImage(icon, 20, 24, 124, 124);
  ctx.restore();

  ctx.fillStyle = "#071b46";
  ctx.font = '700 23px "Helvetica Neue", "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("NeoWorker", width / 2, 187);

  ctx.fillStyle = "#5f6f89";
  ctx.font = '500 10px "NeoWorker CJK", "Microsoft YaHei", sans-serif';
  ctx.fillText("智能体工作空间", width / 2, 209);

  roundedRect(ctx, 22, 232, 120, 1, 0.5);
  const divider = ctx.createLinearGradient(22, 0, 142, 0);
  divider.addColorStop(0, "rgba(10, 124, 255, 0)");
  divider.addColorStop(0.5, "rgba(10, 124, 255, 0.42)");
  divider.addColorStop(1, "rgba(22, 217, 208, 0)");
  ctx.fillStyle = divider;
  ctx.fill();

  ctx.fillStyle = "#17325f";
  ctx.font = '700 7px "Helvetica Neue", "Segoe UI", sans-serif';
  ctx.textAlign = "left";
  drawTrackingText(ctx, "AI  •  WORK  •  READY", 27, 258, 0.55);

  ctx.fillStyle = "#738198";
  ctx.font = '500 9px "NeoWorker CJK", "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("连接工具与知识", width / 2, 283);
  ctx.fillText("高效完成更多工作", width / 2, 298);
});

const header = buildAtScale(150, 57, (ctx, width, height) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createLinearGradient(0, 0, width, 0);
  glow.addColorStop(0, "rgba(10, 124, 255, 0)");
  glow.addColorStop(1, "rgba(22, 217, 208, 0.16)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  roundedRect(ctx, 7, 7, 43, 43, 11);
  ctx.save();
  ctx.clip();
  ctx.drawImage(icon, 7, 7, 43, 43);
  ctx.restore();

  ctx.fillStyle = "#071b46";
  ctx.font = '700 15px "Helvetica Neue", "Segoe UI", sans-serif';
  ctx.fillText("NeoWorker", 57, 25);

  ctx.fillStyle = "#5f6f89";
  ctx.font = '700 6px "Helvetica Neue", "Segoe UI", sans-serif';
  drawTrackingText(ctx, "AI  •  WORK  •  READY", 58, 39, 0.35);

  const line = ctx.createLinearGradient(0, 0, width, 0);
  line.addColorStop(0, "#0a7cff");
  line.addColorStop(1, "#16d9d0");
  ctx.fillStyle = line;
  ctx.fillRect(0, height - 2, width, 2);
});

writeBmp24(sidebar, SIDEBAR_OUT);
writeBmp24(header, HEADER_OUT);

process.stdout.write(`Generated ${path.relative(ROOT, SIDEBAR_OUT)} (164x314, 24-bit BMP)\n`);
process.stdout.write(`Generated ${path.relative(ROOT, HEADER_OUT)} (150x57, 24-bit BMP)\n`);
