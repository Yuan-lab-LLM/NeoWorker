import type { ThemeMode } from "../shared/types";

export function resolveOpaqueWindowBackground(
  themeMode: ThemeMode,
  shouldUseDarkColors: boolean,
): string {
  const useLightBackground =
    themeMode === "light" ||
    (themeMode === "system" && shouldUseDarkColors === false);
  return useLightBackground ? "#f0f0f2" : "#1a1a1c";
}
