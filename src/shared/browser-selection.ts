/** Runs entirely inside the guest. Anchor to a visible selected line, not the
 * bounding box of the whole range (which may include offscreen ads/paragraphs). */
export function browserSelectionProbe() {
  if (document.activeElement?.closest("input,textarea,[contenteditable]:not([contenteditable='false'])")) return null;
  const selection = window.getSelection();
  const text = selection?.toString().trim();
  if (!text || !selection?.rangeCount || text.length > 12000) return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const rects = Array.from(selection.getRangeAt(0).getClientRects()).filter(rect =>
    rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < height && rect.right > 0 && rect.left < width);
  const rect = rects.at(-1);
  if (!rect) return null;
  const left = Math.max(0, rect.left);
  const right = Math.min(width, rect.right);
  return { text, x: left + Math.min((right - left) / 2, 160), y: Math.min(height, rect.bottom) };
}
