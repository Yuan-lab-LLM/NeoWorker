import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NeoWorkerSelectMenu } from "../NeoWorkerSelectMenu";
import { getMissionControlScopeName } from "../../utils/mission-control-copy";

describe("NeoWorkerSelectMenu", () => {
  it("keeps its portaled popover above application modal layers", () => {
    const styles = readFileSync(
      new URL("../neo-worker-select-menu.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.neoworker-select-popover\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*10050;/s,
    );
  });

  it("renders an application-owned listbox trigger instead of a native select", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NeoWorkerSelectMenu, {
        ariaLabel: "工作区",
        value: "all",
        onValueChange: () => undefined,
        options: [
          { value: "all", label: "全部关联工作区" },
          { value: "primary", label: "深圳农业基因所", badge: "主要" },
        ],
      }),
    );

    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain("全部关联工作区");
    expect(markup).not.toContain("<select");
  });

  it("localizes generated company workspace prefixes", () => {
    expect(getMissionControlScopeName("Company: C-1")).toBe("公司：C-1");
    expect(getMissionControlScopeName("Company: Local Company")).toBe(
      "公司：本地公司",
    );
  });
});
