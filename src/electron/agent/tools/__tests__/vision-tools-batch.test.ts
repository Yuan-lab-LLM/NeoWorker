import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { VisionTools } from "../vision-tools";
import { renderPdfPages } from "../../../utils/pdf-page-render";
import { downscaleImage } from "../image-utils";

vi.mock("../../../utils/pdf-page-render", () => ({ renderPdfPages: vi.fn() }));
vi.mock("../image-utils", () => ({ downscaleImage: vi.fn(async (buffer, mimeType) => ({ buffer, mimeType })) }));

describe("batched source images and slide PNGs", () => {
  it("checks all five images with three concurrent requests, keeps successful cache entries, and retries only the failed image", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-image-batch-"));
    try {
      const paths = Array.from({ length: 5 }, (_, i) => `slide-${i + 1}.png`);
      await Promise.all(paths.map((p, i) => fs.writeFile(path.join(root, p), `image ${i + 1}`)));
      const logEvent = vi.fn();
      const vision = new VisionTools({ path: root } as Any, { logEvent } as Any, "task") as Any;
      const gates = new Map<number, (value: Any) => void>();
      let active = 0, maximum = 0;
      vision.analyzeBuffer = vi.fn(async ({ base64 }: { base64: string }) => {
        const page = Number(Buffer.from(base64, "base64").toString().split(" ")[1]);
        maximum = Math.max(maximum, ++active);
        const result = await new Promise(resolve => gates.set(page, resolve));
        active--; return result;
      });
      const pending = vision.analyzeImage({ paths, prompt: "Review hierarchy, clipping, labels and contrast." });
      await vi.waitFor(() => expect(gates.size).toBe(3));
      const ok = (page: number) => ({ success: true, text: `review ${page}`, model: "configured", provider: "openai-compatible" });
      gates.get(3)!(ok(3)); await vi.waitFor(() => expect(gates.size).toBe(4));
      gates.get(2)!({ success: false, error: "vision deadline exceeded", retryable: false });
      await vi.waitFor(() => expect(gates.size).toBe(5));
      for (const n of [5, 1, 4]) gates.get(n)!(ok(n));
      const result = await pending;
      expect(maximum).toBe(3);
      expect(result.success).toBe(false);
      expect(result.images.map((image: Any) => image.source_path)).toEqual(paths);
      expect(result.images.map((image: Any) => image.success)).toEqual([true, false, true, true, true]);
      expect(vision.visionCache.size).toBe(4);
      // Tiny compressed image files still go through the pixel-dimension check.
      expect(downscaleImage).toHaveBeenCalledWith(Buffer.from("image 1"), "image/png", expect.objectContaining({ maxDimension: 1600 }));
      for (let i = 0; i < paths.length; i++) expect(await fs.readFile(path.join(root, paths[i]), "utf8")).toBe(`image ${i + 1}`);
      vision.analyzeBuffer = vi.fn(async () => ok(2));
      const resumed = await vision.analyzeImage({ paths, prompt: "Review hierarchy, clipping, labels and contrast." });
      expect(resumed.success).toBe(true);
      expect(vision.analyzeBuffer).toHaveBeenCalledTimes(1);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
  });
  it("rejects invalid batch input before sending images", async () => {
    const vision = new VisionTools({ path: "/tmp" } as Any, { logEvent: vi.fn() } as Any, "task") as Any;
    vision.analyzeSingleImage = vi.fn();
    for (const input of [{ paths: [] }, { path: "a.png", paths: ["b.png"] }, { paths: Array(6).fill("a.png") }, { paths: [null] }]) {
      expect((await vision.analyzeImage(input)).success).toBe(false);
    }
    expect(vision.analyzeSingleImage).not.toHaveBeenCalled();
  });
});

describe("batched PDF visual review", () => {
  it.each([false, true, "throws"])("checks every page with at most three requests, partial failure=%s", async (fail) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-vision-batch-"));
    try {
      await fs.writeFile(path.join(root, "deck.pdf"), "fixture");
      vi.mocked(renderPdfPages).mockImplementation(async (_source, outputDir) => {
        await fs.mkdir(outputDir, { recursive: true });
        const pages = await Promise.all(Array.from({ length: 5 }, async (_, i) => {
          const imagePath = path.join(outputDir, `page-${i + 1}.png`);
          await fs.writeFile(imagePath, `page ${i + 1}`);
          return { page: i + 1, imagePath };
        }));
        return { pages, totalPages: 5 } as Any;
      });
      const logEvent = vi.fn();
      const vision = new VisionTools({ path: root } as Any, { logEvent } as Any, "task") as Any;
      const gates = new Map<number, (value: Any) => void>();
      let active = 0;
      let maximumActive = 0;
      vision.analyzeBuffer = vi.fn(async ({ prompt }: { prompt: string }) => {
        const page = Number(prompt.match(/Page (\d+)/)?.[1]);
        active++;
        maximumActive = Math.max(maximumActive, active);
        const result = await new Promise(resolve => gates.set(page, resolve));
        active--;
        if (fail === "throws" && page === 2) throw new Error("page 2 unavailable");
        return result;
      });
      const pending = vision.readPdfVisual({ path: "deck.pdf", pages: "1-5" });
      await vi.waitFor(() => expect(gates.size).toBe(3));
      const ok = (page: number) => ({ success: true, text: `review ${page}` });
      // Finish out of order to prove bounded parallelism and deterministic output.
      gates.get(3)!(ok(3));
      await vi.waitFor(() => expect(gates.size).toBe(4));
      gates.get(2)!(fail ? { success: false, error: "page 2 unavailable", retryable: false } : ok(2));
      await vi.waitFor(() => expect(gates.size).toBe(5));
      for (const page of [5, 4, 1]) gates.get(page)!(ok(page));
      const result = await pending;
      expect(maximumActive).toBe(3);
      expect(vision.analyzeBuffer).toHaveBeenCalledTimes(5);
      expect(result.success).toBe(!fail);
      if (fail) {
        expect(result.error).toContain("p2: page 2 unavailable");
        expect(vision.visionCache.size).toBe(0);
      } else {
        expect(result.pages.map((page: Any) => page.page)).toEqual([1, 2, 3, 4, 5]);
        expect(vision.visionCache.size).toBe(1);
      }
      const counts = logEvent.mock.calls.filter(call => call[1] === "progress_update").map(call => call[2].completed);
      expect(counts).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
