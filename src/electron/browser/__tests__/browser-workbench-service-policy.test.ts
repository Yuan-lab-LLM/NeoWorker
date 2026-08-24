import { describe, expect, it } from "vitest";
import { BrowserWorkbenchService } from "../browser-workbench-service";

describe("BrowserWorkbenchService local preview URL policy", () => {
  it("allows only local HTML URLs explicitly opened by the workbench", () => {
    const service = new BrowserWorkbenchService({} as Any);
    const previewUrl = "file:///tmp/generated%20preview.html";

    expect(service.isAllowedLocalPreviewUrl(previewUrl)).toBe(false);

    service.allowLocalPreviewUrl(previewUrl);
    expect(service.isAllowedLocalPreviewUrl(previewUrl)).toBe(true);
    expect(service.isAllowedLocalPreviewUrl("file:///tmp/other.html")).toBe(false);
    expect(service.isAllowedLocalPreviewUrl("file:///tmp/generated%20preview.pdf")).toBe(false);
  });
});
