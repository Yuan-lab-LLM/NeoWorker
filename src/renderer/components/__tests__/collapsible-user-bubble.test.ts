import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentPath = fileURLToPath(
  new URL("../MainContent/message-ui.tsx", import.meta.url),
);

describe("CollapsibleUserBubble resize safety", () => {
  it("observes intrinsic content without feeding the constrained bubble size back into state", () => {
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("ref={bubbleRef}");
    expect(source).toContain(
      '<div ref={contentRef} className="user-bubble-content">',
    );
    expect(source).toContain("observer.observe(contentNode)");
    expect(source).not.toContain("observer.observe(bubbleNode)");
    expect(source).toContain("window.requestAnimationFrame");
    expect(source).toContain("needsCollapseRef.current !== shouldCollapse");
    expect(source).toContain(
      "collapsedHeightRef.current !== nextCollapsedHeight",
    );
  });
});
