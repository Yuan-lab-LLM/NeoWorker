/** Anchor near the end of a selection, flipping above it at the viewport edge. */
export function readingToolbarPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const margin = 12;
  const toolbarWidth = Math.min(320, Math.max(0, width - margin * 2));
  const toolbarHeight = 44;
  return {
    x: Math.max(
      margin,
      Math.min(x - toolbarWidth / 2, width - toolbarWidth - margin),
    ),
    y: Math.max(
      margin,
      Math.min(
        y + margin + toolbarHeight <= height - margin
          ? y + margin
          : y - toolbarHeight - margin,
        height - toolbarHeight - margin,
      ),
    ),
  };
}
