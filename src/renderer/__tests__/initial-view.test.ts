import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appPath = fileURLToPath(new URL("../App.tsx", import.meta.url));

describe("initial workspace view", () => {
  it("opens the workspace dashboard on a fresh renderer session", () => {
    const source = readFileSync(appPath, "utf8");

    expect(source).toContain(
      'const [currentView, setCurrentView] = useState<AppView>("home")',
    );
    expect(source).toContain(
      'const currentViewRef = useRef<AppView>("home")',
    );
    expect(source).toContain('{ view: "home", taskId: null }');
  });
});
