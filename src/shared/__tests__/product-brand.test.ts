import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_DISPLAY_VERSION, PRODUCT_SEMVER } from "../product-brand";

describe("product branding", () => {
  it("stays synchronized with the package version used for releases", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { version?: unknown };

    expect(packageJson.version).toBe(PRODUCT_SEMVER);
    expect(PRODUCT_DISPLAY_VERSION).toBe(`V${packageJson.version}`);
  });
});
