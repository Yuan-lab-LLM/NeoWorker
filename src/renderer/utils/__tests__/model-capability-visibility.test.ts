import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getRequiredUnsupportedModelCapability,
  isSkillVisibleForCurrentModelSupport,
  type SkillCapabilityCandidate,
} from "../model-capability-visibility";

const EXPECTED_HIDDEN_BUNDLED_SKILLS = [
  "agentic-image-loop",
  "imagegen-frontend-web",
  "openai-image-gen",
  "openai-whisper",
  "openai-whisper-api",
  "sag",
  "voice-call",
];

function readSkillDirectory(
  relativeDirectory: string,
): SkillCapabilityCandidate[] {
  const directory = path.resolve(process.cwd(), relativeDirectory);
  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) =>
      JSON.parse(fs.readFileSync(path.join(directory, fileName), "utf8")),
    ) as SkillCapabilityCandidate[];
}

describe("model capability visibility", () => {
  it.each([
    ["agentic-image-loop", "image-generation"],
    ["imagegen-frontend-web", "image-generation"],
    ["openai-image-gen", "image-generation"],
    ["openai-whisper", "audio-understanding"],
    ["openai-whisper-api", "audio-understanding"],
    ["sag", "speech-generation"],
    ["voice-call", "speech-generation"],
  ])("hides unsupported bundled skill %s", (id, capability) => {
    const candidate = { id };
    expect(getRequiredUnsupportedModelCapability(candidate)).toBe(capability);
    expect(isSkillVisibleForCurrentModelSupport(candidate)).toBe(false);
  });

  it.each([
    ["peekaboo", "Capture and describe screenshots with local UI automation"],
    ["summarize", "Summarize an existing podcast transcript"],
    [
      "visual-presentation",
      "Create image-led, visually distinctive PowerPoint decks",
    ],
    [
      "ppt-master",
      "An opt-in advanced PowerPoint workflow for native enhancement",
    ],
  ])("keeps model-independent media skill %s", (id, description) => {
    expect(isSkillVisibleForCurrentModelSupport({ id, description })).toBe(
      true,
    );
  });

  it("hides unsupported specialist media skills returned by an external registry", () => {
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "cinematic-sora",
        name: "Sora video generator",
        description: "Create text-to-video clips from a prompt.",
      }),
    ).toBe(false);
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "studio-voice",
        name: "Studio Voice",
        description: "ElevenLabs text-to-speech and voice cloning.",
      }),
    ).toBe(false);
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "video-inspector",
        name: "Video understanding",
        description:
          "Analyze video content directly with a specialist vision model.",
      }),
    ).toBe(false);
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "music-studio",
        name: "Music Studio",
        description: "Text-to-audio music generation.",
      }),
    ).toBe(false);
  });

  it("keeps text and image-understanding workflows visible", () => {
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "screenshot-audit",
        name: "Screenshot audit",
        description:
          "Analyze screenshots and explain visible interface problems.",
      }),
    ).toBe(true);
    expect(
      isSkillVisibleForCurrentModelSupport({
        id: "research-brief",
        name: "Research brief",
        description: "Research sources and write a structured brief.",
      }),
    ).toBe(true);
  });

  it.each(["registry/skills", "resources/skills"])(
    "audits the complete bundled inventory in %s",
    (directory) => {
      const hiddenSkillIds = readSkillDirectory(directory)
        .filter((skill) => !isSkillVisibleForCurrentModelSupport(skill))
        .map((skill) => skill.id)
        .filter((id): id is string => Boolean(id))
        .sort();

      expect(hiddenSkillIds).toEqual(EXPECTED_HIDDEN_BUNDLED_SKILLS);
    },
  );
});
