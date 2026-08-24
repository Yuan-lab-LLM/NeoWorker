import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readComponent(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${name}.tsx`, import.meta.url)),
    "utf8",
  );
}

const pluginStoreSource = readComponent("PluginStore");
const designSystemStyles = readFileSync(
  fileURLToPath(
    new URL("../../styles/neoworker-design-system.css", import.meta.url),
  ),
  "utf8",
);

describe("dismissible dialogs and panels", () => {
  it("gives the plugin store three clear dismissal paths", () => {
    expect(pluginStoreSource).toContain('role="dialog"');
    expect(pluginStoreSource).toContain('aria-modal="true"');
    expect(pluginStoreSource).toContain('event.key === "Escape"');
    expect(pluginStoreSource).toContain(
      "event.target === event.currentTarget",
    );
    expect(pluginStoreSource).toMatch(
      /className="ps-close"[\s\S]{0,240}<X size=\{18\}/,
    );
  });

  it.each([
    ["RemoteFilePicker", "remote-file-picker-close"],
    ["TaskPauseBanner", "modal-close"],
    ["ConnectorsSettings", "mcp-modal-close"],
    ["ConnectorProfileView", "mcp-modal-close"],
    ["PromptMemoryImportWizard", "mcp-modal-close"],
    ["CollaborativeThoughtsPanel", "thoughts-close-btn"],
    ["SpawnedAgentSidebar", "spawned-agent-sidebar-close"],
  ])("renders an icon for the %s close control", (component, className) => {
    const source = readComponent(component);
    const closeControl = new RegExp(
      `className="${className}"[\\s\\S]{0,300}<X\\s`,
    );

    expect(source).toMatch(closeControl);
  });

  it("does not collapse text or glyph fallbacks in shared close controls", () => {
    expect(designSystemStyles).toContain(
      "/* Keep text/glyph fallbacks visible; flex centering already fixes SVG baselines. */\n  line-height: 1;",
    );
  });
});
