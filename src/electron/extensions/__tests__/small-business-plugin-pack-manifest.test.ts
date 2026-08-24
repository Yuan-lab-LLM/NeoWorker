import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn().mockReturnValue("/mock/user/data"),
  },
}));

import { validateManifest } from "../loader";

const MANIFEST_PATH = path.resolve(
  process.cwd(),
  "resources",
  "plugin-packs",
  "smb-complete",
  "neoworker.plugin.json",
);

function readManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

describe("SMB Complete plugin pack", () => {
  it("validates the bundled small-business manifest", () => {
    const manifest = readManifest();

    expect(validateManifest(manifest)).toBe(true);
    expect(manifest.name).toBe("smb-complete");
    expect(manifest.category).toBe("Small Business");
    expect(manifest.recommendedConnectors).toEqual(
      expect.arrayContaining(["QuickBooks", "PayPal", "HubSpot", "Canva"]),
    );
    expect(manifest.skills.some((skill: { id: string }) => skill.id === "smb-guardrails")).toBe(
      true,
    );
  });

  it("preserves the public small-business slash workflows", () => {
    const manifest = readManifest();
    const commands = new Map(
      manifest.slashCommands.map((command: { name: string; skillId: string }) => [
        command.name,
        command.skillId,
      ]),
    );

    expect(commands.get("plan-payroll")).toBe("smb-plan-payroll");
    expect(commands.get("monday-brief")).toBe("smb-monday-brief");
    expect(commands.get("run-campaign")).toBe("smb-run-campaign");
    expect(commands.get("review-contract")).toBe("smb-review-contract");
    expect(commands.get("smb-onboard")).toBe("smb-onboard");
  });
});
