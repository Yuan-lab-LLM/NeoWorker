import { describe, expect, it } from "vitest";

import {
  clampDocumentZoom,
  DOCUMENT_ZOOM_MAX,
  DOCUMENT_ZOOM_MIN,
  getWheelZoomDelta,
} from "../useDocumentZoom";

describe("document zoom helpers", () => {
  it("keeps zoom inside the document viewer range", () => {
    expect(clampDocumentZoom(10)).toBe(DOCUMENT_ZOOM_MIN);
    expect(clampDocumentZoom(137.4)).toBe(137);
    expect(clampDocumentZoom(900)).toBe(DOCUMENT_ZOOM_MAX);
  });

  it("converts wheel and trackpad movement into bounded zoom changes", () => {
    expect(getWheelZoomDelta(-100)).toBe(12);
    expect(getWheelZoomDelta(100)).toBe(-12);
    expect(getWheelZoomDelta(-0.2)).toBe(1);
    expect(getWheelZoomDelta(0)).toBe(0);
  });
});
