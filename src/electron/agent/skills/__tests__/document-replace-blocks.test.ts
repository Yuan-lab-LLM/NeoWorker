import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { DocumentBuilder } from "../document";
import { parseDocxBlocksFromBuffer } from "../../../documents/docx-blocks";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("DocumentBuilder.replaceBlocksById", () => {
  it("replaces only the selected contiguous blocks", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-docx-replace-"));
    tempDirs.push(dir);
    const workspace = {
      id: "ws-1",
      name: "Workspace",
      path: dir,
      createdAt: Date.now(),
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: false,
        shell: false,
        allowedPaths: [],
      },
    };

    const builder = new DocumentBuilder(workspace as Any);
    const sourcePath = path.join(dir, "spec.docx");
    const destPath = path.join(dir, "spec-v2.docx");
    await builder.create(sourcePath, "docx", [
      { type: "heading", text: "Overview", level: 1 },
      { type: "paragraph", text: "Original body." },
      { type: "paragraph", text: "Keep me." },
    ]);

    const originalBlocks = await parseDocxBlocksFromBuffer(fs.readFileSync(sourcePath));
    const bodyBlock = originalBlocks.find((block) => block.text === "Original body.");
    expect(bodyBlock).toBeTruthy();

    await builder.replaceBlocksById(
      sourcePath,
      destPath,
      [bodyBlock!.id],
      [{ type: "paragraph", text: "Updated body." }],
    );

    const result = await builder.readDocument(destPath);
    expect(result.text).toContain("Updated body.");
    expect(result.text).toContain("Keep me.");
    expect(result.text).not.toContain("Original body.");
  });
});
