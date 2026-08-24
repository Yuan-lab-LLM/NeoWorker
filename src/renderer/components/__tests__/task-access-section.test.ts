import { describe, expect, it } from "vitest";
import {
  getTaskAccessStateLabel,
  groupTaskAccessConnectors,
  isTaskAccessPolicyEditingEnabled,
} from "../TaskAccessSection";

describe("TaskAccessSection", () => {
  it("groups connectors in used, allowed, blocked, available, unavailable order", () => {
    const groups = groupTaskAccessConnectors([
      { id: "available", label: "Available", state: "available" },
      { id: "blocked", label: "Blocked", state: "blocked" },
      { id: "used", label: "Used", state: "used" },
      { id: "allowed", label: "Allowed", state: "allowed" },
    ]);
    expect(groups.map((group) => group.state)).toEqual([
      "used",
      "allowed",
      "blocked",
      "available",
    ]);
  });

  it("always returns a textual state label", () => {
    expect(getTaskAccessStateLabel("blocked").length).toBeGreaterThan(0);
  });

  it("keeps policy editing disabled unless its independent flag is explicitly enabled", () => {
    expect(isTaskAccessPolicyEditingEnabled()).toBe(false);
  });
});
