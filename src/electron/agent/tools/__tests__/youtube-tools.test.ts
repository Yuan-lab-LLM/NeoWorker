import { describe, expect, it, vi } from "vitest";
import { YouTubeTools } from "../youtube-tools";

function createTools(): YouTubeTools {
  return new YouTubeTools(
    {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace",
      permissions: {
        read: true,
        write: true,
        delete: true,
        network: false,
        shell: false,
      },
      createdAt: Date.now(),
    } as Any,
    {
      logEvent: vi.fn(),
    } as Any,
    "task-1",
  );
}

describe("YouTubeTools", () => {
  it("keeps youtube_ask_video read-only by rejecting URL ingestion", async () => {
    await expect(
      createTools().askVideo({
        question: "What is this about?",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      } as Any),
    ).rejects.toThrow("Use youtube_ask_or_ingest_video for URLs");
  });

  it("exposes separate cached and ingesting ask tools", () => {
    const names = YouTubeTools.getToolDefinitions().map((tool) => tool.name);

    expect(names).toContain("youtube_ask_video");
    expect(names).toContain("youtube_ask_or_ingest_video");
  });
});
