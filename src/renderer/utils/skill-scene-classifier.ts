export type SkillSceneTaxonomy<SceneId extends string> = {
  id: SceneId;
  terms: string[];
  categoryTerms?: string[];
};

export type SkillSceneSearchInput = {
  id?: string;
  name?: string;
  localizedName?: string;
  category?: string;
  localizedCategory?: string;
  description?: string;
  localizedDescription?: string;
  tags?: string[];
};

const normalise = (value: string | undefined) =>
  value?.trim().toLocaleLowerCase() || "";

const containsTerm = (text: string, rawTerm: string) => {
  const term = normalise(rawTerm);
  if (!term) return false;

  // Short Latin labels such as "law" and "data" need token boundaries so
  // they do not accidentally match words such as "flaw" or "metadata".
  if (/^[a-z0-9+#.-]+$/i.test(term) && term.length <= 4) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  }

  return text.includes(term);
};

export const classifySkillScene = <SceneId extends string>(
  skill: SkillSceneSearchInput,
  scenes: Array<SkillSceneTaxonomy<SceneId>>,
  fallbackScene: SceneId,
): SceneId => {
  const categories = [skill.category, skill.localizedCategory]
    .map(normalise)
    .filter(Boolean);
  const identity = [
    skill.id,
    skill.name,
    skill.localizedName,
    skill.category,
    skill.localizedCategory,
    ...(skill.tags || []),
  ]
    .map(normalise)
    .filter(Boolean)
    .join(" ");
  const description = [skill.description, skill.localizedDescription]
    .map(normalise)
    .filter(Boolean)
    .join(" ");

  let bestScene = fallbackScene;
  let bestScore = 0;

  scenes.forEach((scene) => {
    let score = 0;
    if (
      (scene.categoryTerms || []).some((term) =>
        categories.includes(normalise(term)),
      )
    ) {
      score += 40;
    }
    scene.terms.forEach((term) => {
      if (containsTerm(identity, term)) score += 8;
      if (containsTerm(description, term)) score += 2;
    });
    if (score > bestScore) {
      bestScore = score;
      bestScene = scene.id;
    }
  });

  return bestScene;
};
