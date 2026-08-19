export type BrowserWorkbenchSize = {
  width: number;
  height: number;
};

const SIZE_JITTER_TOLERANCE = 1;

export function getStableBrowserWorkbenchSize(
  current: BrowserWorkbenchSize | null,
  measuredWidth: number,
  measuredHeight: number,
): BrowserWorkbenchSize | null {
  const width = Math.max(0, Math.round(measuredWidth));
  const height = Math.max(0, Math.round(measuredHeight));

  if (width === 0 || height === 0) return current;

  if (
    current &&
    Math.abs(current.width - width) <= SIZE_JITTER_TOLERANCE &&
    Math.abs(current.height - height) <= SIZE_JITTER_TOLERANCE
  ) {
    return current;
  }

  return { width, height };
}
