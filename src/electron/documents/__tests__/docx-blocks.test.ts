import { describe, expect, it } from "vitest";
import { parseDocxBlocksFromXml } from "../docx-blocks";

describe("parseDocxBlocksFromXml", () => {
  it("extracts headings, paragraphs, and tables in order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Overview</w:t></w:r></w:p>
          <w:p><w:r><w:t>First paragraph.</w:t></w:r></w:p>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc>
            </w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Revenue</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>42</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`;

    const blocks = parseDocxBlocksFromXml(xml);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ id: "p-1", type: "heading", level: 1, text: "Overview" });
    expect(blocks[1]).toMatchObject({ id: "p-2", type: "paragraph", text: "First paragraph." });
    expect(blocks[2]).toMatchObject({
      id: "tbl-3",
      type: "table",
      rows: [
        ["Metric", "Value"],
        ["Revenue", "42"],
      ],
    });
  });
});
