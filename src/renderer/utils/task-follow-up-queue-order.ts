export type QueueDropPosition = "before" | "after";

export function reorderQueueItems<T extends { id: string }>(
  items: readonly T[],
  draggedId: string,
  targetId: string,
  position: QueueDropPosition,
): T[] {
  if (draggedId === targetId) return [...items];

  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  if (draggedIndex < 0 || !items.some((item) => item.id === targetId)) {
    return [...items];
  }

  const next = [...items];
  const [dragged] = next.splice(draggedIndex, 1);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, dragged);
  return next;
}

export function moveQueueItemByOffset<T extends { id: string }>(
  items: readonly T[],
  itemId: string,
  offset: -1 | 1,
): T[] {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const nextIndex = currentIndex + offset;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= items.length) {
    return [...items];
  }

  const next = [...items];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return next;
}
