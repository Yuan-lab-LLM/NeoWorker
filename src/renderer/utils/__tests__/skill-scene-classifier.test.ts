import { describe, expect, it } from "vitest";
import {
  classifySkillScene,
  type SkillSceneTaxonomy,
} from "../skill-scene-classifier";

type SceneId = "research" | "data" | "content" | "engineering" | "teamwork";

const scenes: Array<SkillSceneTaxonomy<SceneId>> = [
  { id: "research", terms: ["research", "搜索"], categoryTerms: ["Research"] },
  { id: "data", terms: ["data", "csv"], categoryTerms: ["Data"] },
  { id: "content", terms: ["video", "写作"], categoryTerms: ["Creative"] },
  {
    id: "engineering",
    terms: ["code", "cloud", "kubernetes"],
    categoryTerms: ["Development", "DevOps"],
  },
  { id: "teamwork", terms: ["meeting", "协作"], categoryTerms: ["Project"] },
];

describe("skill scene classifier", () => {
  it("assigns each skill to one strongest scene instead of every keyword match", () => {
    expect(
      classifySkillScene(
        {
          id: "cloud-migration",
          name: "Cloud Migration",
          category: "DevOps",
          description:
            "Assessment, database migration and multi-cloud planning.",
        },
        scenes,
        "research",
      ),
    ).toBe("engineering");

    expect(
      classifySkillScene(
        {
          id: "copy-editor",
          name: "Copy Editor",
          category: "Creative",
          description: "Improve product writing and narrative structure.",
        },
        scenes,
        "research",
      ),
    ).toBe("content");
  });

  it("uses short English terms as whole tokens", () => {
    expect(
      classifySkillScene(
        {
          id: "metadata-cleaner",
          name: "Metadata Cleaner",
          category: "Development",
        },
        scenes,
        "research",
      ),
    ).toBe("engineering");
  });

  it("preserves the source category when a localized label is broader", () => {
    expect(
      classifySkillScene(
        {
          id: "decision-prep",
          name: "Decision Prep",
          category: "Project",
          localizedCategory: "数据",
          description: "Prepare data and options for a team decision.",
        },
        scenes,
        "research",
      ),
    ).toBe("teamwork");
  });
});
