export type ProductModelCapability =
  | "text"
  | "image-understanding"
  | "image-generation"
  | "video-understanding"
  | "video-generation"
  | "audio-understanding"
  | "audio-generation"
  | "speech-generation";

/**
 * Capabilities that can currently be configured from Settings > AI & Models.
 * Keep this list conservative: catalog entries must not promise a specialist
 * media workflow until NeoWorker exposes a compatible model configuration.
 */
export const CURRENT_PRODUCT_MODEL_CAPABILITIES =
  new Set<ProductModelCapability>(["text", "image-understanding"]);

export interface SkillCapabilityCandidate {
  id?: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  metadata?: {
    tags?: string[];
    routing?: {
      useWhen?: string;
      outputs?: string;
      keywords?: string[];
    };
  };
}

const SKILL_CAPABILITY_OVERRIDES = new Map<string, ProductModelCapability>([
  ["agentic-image-loop", "image-generation"],
  ["imagegen-frontend-web", "image-generation"],
  ["openai-image-gen", "image-generation"],
  ["openai-whisper", "audio-understanding"],
  ["openai-whisper-api", "audio-understanding"],
  ["sag", "speech-generation"],
  ["voice-call", "speech-generation"],
]);

// These skills mention media, but operate through local tools, screenshots, or
// existing non-video files. They do not require a specialist media model.
const MODEL_INDEPENDENT_MEDIA_SKILL_IDS = new Set([
  "peekaboo",
  "ppt-master",
  "summarize",
  // This is a tool-orchestrated deck workflow. Its mention of an
  // "image-led" result describes the output style; it is not evidence that
  // the currently selected chat model needs native image-generation support.
  // Runtime tool eligibility is checked separately when the skill runs.
  "visual-presentation",
]);

function normalizeSkillId(value: string | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

function searchableSkillText(candidate: SkillCapabilityCandidate): string {
  return [
    candidate.id,
    candidate.name,
    candidate.description,
    candidate.category,
    ...(candidate.tags || []),
    ...(candidate.metadata?.tags || []),
    candidate.metadata?.routing?.useWhen,
    candidate.metadata?.routing?.outputs,
    ...(candidate.metadata?.routing?.keywords || []),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export function getRequiredUnsupportedModelCapability(
  candidate: SkillCapabilityCandidate,
): ProductModelCapability | null {
  const skillId = normalizeSkillId(candidate.id);
  const override = SKILL_CAPABILITY_OVERRIDES.get(skillId);
  if (override) return override;
  if (MODEL_INDEPENDENT_MEDIA_SKILL_IDS.has(skillId)) return null;

  const text = searchableSkillText(candidate);

  if (
    /\b(?:image[- ]generation|image[- ]generator|text[- ]to[- ]image|dall[- ]?e|stable diffusion|midjourney)\b/.test(
      text,
    ) ||
    /\b(?:generate|create|edit|inpaint|outpaint)(?:s|d|ing)?\b[^.\n]{0,64}\b(?:image|photo|illustration)s?\b/.test(
      text,
    )
  ) {
    return "image-generation";
  }

  if (
    /\b(?:video[- ]generation|video[- ]generator|ai video creator|text[- ]to[- ]video|image[- ]to[- ]video|sora|veo|kling)\b/.test(
      text,
    )
  ) {
    return "video-generation";
  }

  if (
    /\b(?:video understanding|video analysis|analy[sz]e video|understand video)\b/.test(
      text,
    )
  ) {
    return "video-understanding";
  }

  if (
    /\b(?:speech[- ]to[- ]text|audio transcription|whisper|stt)\b/.test(text) ||
    /\btranscrib(?:e|es|ed|ing|tion)\b[^.\n]{0,48}\b(?:audio|video|speech|recording)s?\b/.test(
      text,
    )
  ) {
    return "audio-understanding";
  }

  if (
    /\b(?:text[- ]to[- ]speech|voice cloning|speech synthesis|elevenlabs|tts)\b/.test(
      text,
    ) ||
    /\b(?:outbound|automated) phone calls?\b/.test(text)
  ) {
    return "speech-generation";
  }

  if (
    /\b(?:audio generation|music generation|sound effect generation|text[- ]to[- ]audio)\b/.test(
      text,
    )
  ) {
    return "audio-generation";
  }

  return null;
}

export function isSkillVisibleForCurrentModelSupport(
  candidate: SkillCapabilityCandidate,
): boolean {
  const requiredCapability = getRequiredUnsupportedModelCapability(candidate);
  return (
    requiredCapability === null ||
    CURRENT_PRODUCT_MODEL_CAPABILITIES.has(requiredCapability)
  );
}
