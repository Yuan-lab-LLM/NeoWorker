import React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AttachmentImagePreview,
  isPreviewableImageAttachment,
  resolveImageMimeType,
} from "../AttachmentImagePreview";

const mainContentSource = readFileSync(
  fileURLToPath(new URL("../MainContent/MainContent.tsx", import.meta.url)),
  "utf8",
);
const unifiedComposerSource = readFileSync(
  fileURLToPath(new URL("../UnifiedTaskComposer.tsx", import.meta.url)),
  "utf8",
);

describe("AttachmentImagePreview", () => {
  it("recognizes image attachments from MIME type or file extension", () => {
    expect(isPreviewableImageAttachment("screen.PNG")).toBe(true);
    expect(isPreviewableImageAttachment("capture", "image/webp")).toBe(true);
    expect(resolveImageMimeType("photo.jpeg")).toBe("image/jpeg");
    expect(isPreviewableImageAttachment("report.xlsx")).toBe(false);
  });

  it("renders pasted image data as a real thumbnail instead of a file icon", () => {
    const markup = renderToStaticMarkup(
      React.createElement(AttachmentImagePreview, {
        name: "screenshot.png",
        mimeType: "image/png",
        dataBase64: "aGVsbG8=",
        sizeLabel: "5 B",
        onRemove: () => undefined,
      }),
    );

    expect(markup).toContain("attachment-image-preview--composer");
    expect(markup).toContain('src="data:image/png;base64,aGVsbG8="');
    expect(markup).toContain("Preview screenshot.png");
    expect(markup).toContain("Remove attachment screenshot.png");
  });

  it("routes image attachments through the preview in both composer entry points", () => {
    expect(mainContentSource).toContain("isPreviewableImageAttachment(");
    expect(mainContentSource).toContain("<AttachmentImagePreview");
    expect(mainContentSource).toContain('variant="message"');
    expect(unifiedComposerSource).toContain("isPreviewableImageAttachment(");
    expect(unifiedComposerSource).toContain("<AttachmentImagePreview");
  });
});
