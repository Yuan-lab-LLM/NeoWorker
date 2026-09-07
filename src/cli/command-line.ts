/**
 * Split a command line while preserving quoted arguments.
 *
 * On POSIX shells a backslash escapes the following character.  On Windows,
 * however, an unquoted backslash is normally a path separator.  Treating
 * every Windows backslash as an escape turns `C:\\Users\\alice\\tool.exe`
 * into `C:Usersalicetool.exe`, which makes MCP stdio commands and other CLI
 * paths impossible to launch.  Keep the platform-specific rule here so the
 * interactive and direct CLI entry points stay in sync.
 */
export function splitCommandLine(input: string, platform = process.platform): string[] {
  const result: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const windows = platform === "win32";

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && !windows) {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        result.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  // Preserve a trailing POSIX escape as a literal backslash.  Windows paths
  // already take this branch because their backslashes were never escapes.
  if (escaped) current += "\\";
  if (current) result.push(current);
  return result;
}

