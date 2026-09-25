/** Anonymous public metadata feeds; model weights and dataset files are never fetched here. */
export const HF_HUB_SOURCES = ["hf-models", "hf-datasets"] as const;
export type HfHubSource = (typeof HF_HUB_SOURCES)[number];
export type HfHubSort = "trendingScore" | "lastModified" | "downloads";
export function isHfHubSource(source: string): source is HfHubSource {
  return source === "hf-models" || source === "hf-datasets";
}
export function hfHubUrl(source: HfHubSource, id: string): string | undefined {
  if (!/^[\w-]+\/[\w.-]+$/.test(id) || id.includes("..")) return;
  return `https://huggingface.co/${source === "hf-datasets" ? "datasets/" : ""}${id}`;
}
