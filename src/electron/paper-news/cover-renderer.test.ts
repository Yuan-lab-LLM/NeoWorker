import { describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
vi.mock("electron", () => ({ nativeImage: { createFromBuffer: () => ({ isEmpty: () => true }) } }));
import { resizeNewsCover } from "./cover-renderer";

describe("WebP cover decoding on macOS", () => {
  it("decodes CDN WebP bytes to a bounded JPEG when nativeImage cannot", async () => {
    const canvas = createCanvas(2400, 1600);
    canvas.getContext("2d").fillRect(0, 0, 2400, 1600);
    const result = await resizeNewsCover(canvas.toBuffer("image/webp"));
    expect(result?.subarray(0, 2).toString("hex")).toBe("ffd8");
    const decoded = await loadImage(result!);
    expect([decoded.width, decoded.height]).toEqual([1600, 1067]);
  });
  it("rejects broken media and tracking pixels", async () => {
    expect(await resizeNewsCover(Buffer.from("not an image"))).toBeNull();
    expect(await resizeNewsCover(createCanvas(1, 1).toBuffer("image/webp"))).toBeNull();
  });
});
