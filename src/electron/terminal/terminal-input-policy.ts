export function normalizeTerminalAttachInput(input: unknown): string {
  if (typeof input !== "string" || input.length === 0) {
    return "";
  }
  return input;
}
