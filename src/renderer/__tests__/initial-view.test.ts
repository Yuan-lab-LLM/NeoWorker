import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appPath = fileURLToPath(new URL("../App.tsx", import.meta.url));

describe("initial workspace view", () => {
  it("opens the focused task-first welcome surface on a fresh renderer session", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain(
      'const [currentView, setCurrentView] = useState<AppView>("main")',
    );
    expect(source).toContain(
      'const currentViewRef = useRef<AppView>("main")',
    );
    expect(source).toContain('{ view: "main", taskId: null }');
  });
});
