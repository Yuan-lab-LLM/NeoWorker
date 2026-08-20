export function capitalizeSidebarSessionTitle(value: string): string {
  const firstLowercaseLetterIndex = value.search(/\p{Ll}/u);
  if (firstLowercaseLetterIndex < 0) return value;

  const prefix = value.slice(0, firstLowercaseLetterIndex);
  if (/\p{L}/u.test(prefix)) return value;

  const letter = value[firstLowercaseLetterIndex];
  return `${prefix}${letter.toLocaleUpperCase()}${value.slice(firstLowercaseLetterIndex + 1)}`;
}
