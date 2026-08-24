const PRESENTATION_PROJECT_SEGMENT =
  /(^|\/)(?:presentation-studio|visual-presentation|ppt-master)(?:\/|$)/i;
const PRESENTATION_SLIDE_SOURCE =
  /(^|\/)(?:slide-\d+|s\d+)(?:-[^/]*)?\.(?:mjs|cjs|js|ts)$/i;
const INTERNAL_OFFICE_PATH =
  /(^|\/)\.neoworker\/(?:tmp|office-staging|office-quality|office-manifests|office-snapshots)(?:\/|$)/i;
const PRESENTATION_WORKING_FILE =
  /(^|\/)(?:presentation-plan\.json|theme\.json|narrative\.md|render-report\.json|qa-report\.json)$/i;
const INTERNAL_VALIDATION_ARTIFACT_FILE =
  /(^|\/)(?:[^/]*[-_.])?(?:preview|render|quality|visual|qa)[-_.]?(?:check|evidence|inspection)(?:[-_.][^/]*)?\.(?:html?|md|txt|json|pdf)$/i;
const INTERNAL_AGENT_CONTEXT_PATH =
  /(^|\/)agent\.md(?:\/(?:soul\.md)(?:\/user\.md)?)?(?:\/|$)/i;
const INTERNAL_DIAGNOSTIC_ARTIFACT_FILE =
  /(^|\/)_{1,2}(?:diag|diagnostic|partial|verify|verification)(?:[-_.]|$)/i;

/**
 * Source-first presentation workflows intentionally create a project tree
 * containing slide modules, prompts, previews, theme data, and QA reports.
 * Those files remain available in the workspace, but they are implementation
 * details rather than deliverables and must not flood task artifact surfaces.
 */
export function isUserVisibleTaskArtifactPath(rawPath: unknown): boolean {
  if (typeof rawPath !== "string") return false;
  const normalized = rawPath.trim().replace(/\\/g, "/");
  if (!normalized) return false;

  if (INTERNAL_OFFICE_PATH.test(normalized)) return false;
  if (INTERNAL_VALIDATION_ARTIFACT_FILE.test(normalized)) return false;
  if (INTERNAL_AGENT_CONTEXT_PATH.test(normalized)) return false;
  if (INTERNAL_DIAGNOSTIC_ARTIFACT_FILE.test(normalized)) return false;
  if (/\.pptx$/i.test(normalized)) return true;
  if (PRESENTATION_PROJECT_SEGMENT.test(normalized)) return false;
  if (PRESENTATION_SLIDE_SOURCE.test(normalized)) return false;
  if (PRESENTATION_WORKING_FILE.test(normalized)) return false;

  return true;
}
