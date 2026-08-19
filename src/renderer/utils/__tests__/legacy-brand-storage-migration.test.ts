import { describe, expect, it } from "vitest";
import { migrateLegacyBrandStorage } from "../legacy-brand-storage-migration";

function createStorage(initial: Record<string, string>): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, String(value)),
  } as Storage;
}

describe("migrateLegacyBrandStorage", () => {
  it("copies NovaReady preferences into the NeoWorker namespace", () => {
    const storage = createStorage({
      "novaready:left-sidebar-collapsed": "true",
    });

    expect(migrateLegacyBrandStorage(storage)).toBe(1);
    expect(storage.getItem("neoworker:left-sidebar-collapsed")).toBe("true");
    expect(storage.getItem("novaready:left-sidebar-collapsed")).toBe("true");
  });

  it("does not overwrite an existing NeoWorker preference", () => {
    const storage = createStorage({
      "novaready:left-sidebar-collapsed": "true",
      "neoworker:left-sidebar-collapsed": "false",
    });

    expect(migrateLegacyBrandStorage(storage)).toBe(0);
    expect(storage.getItem("neoworker:left-sidebar-collapsed")).toBe("false");
  });
});
