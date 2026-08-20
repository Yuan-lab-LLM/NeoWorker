export function getVirtualScrollRequestIdentity(
  enabled: boolean,
  scrollToIndex: number | null,
  itemCount: number,
  scrollRequestKey?: string | number | null,
): string | null {
  if (
    !enabled ||
    scrollToIndex === null ||
    scrollToIndex < 0 ||
    scrollToIndex >= itemCount
  ) {
    return null;
  }

  return scrollRequestKey === null || scrollRequestKey === undefined
    ? `index:${scrollToIndex}`
    : `key:${String(scrollRequestKey)}`;
}
