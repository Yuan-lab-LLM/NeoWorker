import { describe, expect, it } from "vitest";
import {
  CalendarSearch,
  Handshake,
  Headphones,
  Radar,
  ShieldCheck,
  Telescope,
} from "lucide-react";
import { getSemanticIconVisual } from "../semantic-icon-map";

describe("semantic icon mapping", () => {
  it.each([
    ["Codex Security", ShieldCheck, "rose"],
    ["Commercial Legal", Handshake, "amber"],
    ["Customer Support Pack", Headphones, "cyan"],
    ["最近 N 天研究", CalendarSearch, "blue"],
    ["竞品研究", Telescope, "violet"],
    ["竞品动态扫描", Radar, "orange"],
  ] as const)("maps %s to a distinct visual", (name, Icon, tone) => {
    expect(getSemanticIconVisual({ name })).toEqual({ Icon, tone });
  });
});
