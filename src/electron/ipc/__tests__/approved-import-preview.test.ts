import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const handlersSource = readFileSync(
  fileURLToPath(new URL("../handlers.ts", import.meta.url)),
  "utf8",
);

describe("selected attachment preview access", () => {
  it("allows a file chosen in the native picker to be previewed before import", () => {
    const resolverStart = handlersSource.indexOf("const resolveExistingPathForViewer");
    const resolverEnd = handlersSource.indexOf(
      "const requireViewerWorkspaceContainment",
      resolverStart,
    );
    const resolverSource = handlersSource.slice(resolverStart, resolverEnd);

    expect(resolverStart).toBeGreaterThan(-1);
    expect(resolverSource).toContain(
      "const isApprovedExternalImport = isApprovedImportFile(candidate)",
    );
    expect(resolverSource).toContain("!isApprovedExternalImport");
    expect(resolverSource).toContain("await fs.realpath(candidate)");
  });
});
