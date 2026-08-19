import fs from "fs";
import path from "path";
import { app, nativeImage, type NativeImage } from "electron";
import {
  PRODUCT_DISPLAY_VERSION,
  PRODUCT_NAME,
} from "../shared/product-brand";

export const APP_DISPLAY_NAME = PRODUCT_NAME;
export const APP_DISPLAY_VERSION = PRODUCT_DISPLAY_VERSION;
export const APP_BUNDLE_ID = "com.neoworker.app";

function iconCandidates(): string[] {
  if (process.platform === "win32") {
    return ["build/icon.ico", "build/icon.png"];
  }
  return ["build/icon.png", "build/icon.icns"];
}

function appResourceRoots(): string[] {
  const roots = [app.getAppPath()];
  if (process.resourcesPath) {
    roots.push(process.resourcesPath);
  }
  return [...new Set(roots.map((root) => path.resolve(root)))];
}

export function applyApplicationIdentity(): void {
  // Keep the Electron development keychain identity stable on macOS. The dev
  // bundle's visible display name and icon are branded separately before
  // launch, while packaged builds use the NeoWorker builder metadata.
  if (!(process.platform === "darwin" && !app.isPackaged)) {
    app.setName(APP_DISPLAY_NAME);
  }
  if (process.platform === "win32") {
    app.setAppUserModelId(APP_BUNDLE_ID);
  }
}

export function getDesktopIconPath(): string | undefined {
  for (const root of appResourceRoots()) {
    for (const candidate of iconCandidates()) {
      const resolved = path.join(root, candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }
  return undefined;
}

export function getDesktopIconImage(): NativeImage | undefined {
  const iconPath = getDesktopIconPath();
  if (!iconPath) {
    return undefined;
  }

  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}
