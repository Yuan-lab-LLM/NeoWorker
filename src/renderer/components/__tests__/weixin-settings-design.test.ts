import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentPath = new URL("../WeixinSettings.tsx", import.meta.url);
const stylesPath = new URL("../weixin-settings.css", import.meta.url);

const componentSource = readFileSync(componentPath, "utf8");
const stylesSource = readFileSync(stylesPath, "utf8");

describe("WeixinSettings design", () => {
  it("imports every React hook used while opening the configuration panel", () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*useMemo[^}]*\}\s*from\s*["']react["']/s,
    );
    expect(componentSource).toContain(
      "const securityOptions = useMemo(getSecurityOptions, [language]);",
    );
  });

  it("uses the same guided two-column frame as the enterprise connectors", () => {
    expect(componentSource).toContain("guided-channel-shell");
    expect(componentSource).toContain("guided-channel-guide");
    expect(componentSource).toContain("guided-channel-form");
    expect(componentSource).toContain("Connect NeoWorker to personal WeChat");
    expect(componentSource).toContain("Scan with WeChat to complete the connection");
    expect(componentSource).toContain("Generate QR code");
    expect(componentSource).toContain("New contacts protected by default");
  });

  it("uses the shared custom menu for access control", () => {
    expect(componentSource).toContain("NeoWorkerSelectMenu");
    expect(componentSource).toContain("Choose WeChat access method");
    expect(componentSource).not.toContain("<select");
  });

  it("keeps the connected state inside the same guided management frame", () => {
    expect(componentSource).toContain("WeChat has connected to NeoWorker");
    expect(componentSource).toContain("weixin-management-surface");
    expect(componentSource).toContain("weixin-management-grid");
    expect(componentSource).toContain("weixin-connected-summary");
    expect(componentSource).toContain("weixin-invite-panel");
    expect(componentSource).toContain("weixin-contacts-panel");
    expect(componentSource).toContain("WeChat contacts");
  });

  it("groups related controls into one restrained management surface", () => {
    expect(stylesSource).toContain(".weixin-management-surface");
    expect(stylesSource).toContain(".weixin-management-grid");
    expect(stylesSource).toContain(
      ".weixin-management-grid > .weixin-management-block + .weixin-management-block",
    );
    expect(stylesSource).toContain(
      "border-top: 1px solid var(--color-border-subtle)",
    );
    expect(stylesSource).toMatch(
      /\.weixin-management-surface \.guided-channel-security\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/s,
    );
  });

  it("uses a restrained responsive layout and protects it from legacy overrides", () => {
    expect(stylesSource).toContain(
      "--guided-channel-accent: var(--weixin-green)",
    );
    expect(stylesSource).toContain(
      "grid-template-columns: minmax(235px, 0.82fr) minmax(0, 1.18fr)",
    );
    expect(stylesSource).toContain(
      ".channel-config-expanded-content .weixin-settings .weixin-qr-frame",
    );
    expect(stylesSource).toContain("@media (max-width: 760px)");
  });
});
