import { describe, expect, it } from "vitest";
import {
  extractPreferredNameFromMessage,
  sanitizeInferredPreferredName,
  sanitizeStoredPreferredName,
  sanitizePreferredNameMemoryLine,
} from "../preferred-name";

describe("preferred-name utils", () => {
  it("extracts explicit preferred name intros", () => {
    expect(extractPreferredNameFromMessage("My name is Alice.")).toBe("Alice");
    expect(extractPreferredNameFromMessage("Call me Jane Doe")).toBe("Jane Doe");
    expect(extractPreferredNameFromMessage("I'm Bob")).toBe("Bob");
    expect(extractPreferredNameFromMessage("My name is Çağrı")).toBe("Çağrı");
  });

  it("rejects task fragments as preferred names", () => {
    expect(extractPreferredNameFromMessage("I'm from Turkey")).toBeNull();
    expect(
      extractPreferredNameFromMessage("I am now authenticated but I cannot open the view"),
    ).toBeNull();
  });

  it("sanitizes stale preferred-name memory lines", () => {
    expect(sanitizePreferredNameMemoryLine("Preferred name: Alice")).toBe("Preferred name: Alice");
  });

  it("sanitizes inferred names safely", () => {
    expect(sanitizeInferredPreferredName("building a neoworker assistant")).toBeUndefined();
    expect(sanitizeInferredPreferredName("Alice")).toBe("Alice");
  });

  it("keeps explicit multi-part stored names but clears sentence-like values", () => {
    expect(sanitizeStoredPreferredName("Mary Jane Watson Parker")).toBe("Mary Jane Watson Parker");
  });
});
