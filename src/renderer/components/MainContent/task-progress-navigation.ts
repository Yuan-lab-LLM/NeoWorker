export type TaskProgressRevealResult = "popover" | "timeline" | "none";

export function revealTaskProgressInView({
  root,
  scrollContainer,
  reduceMotion = false,
}: {
  root: ParentNode | null;
  scrollContainer: HTMLElement | null;
  reduceMotion?: boolean;
}): TaskProgressRevealResult {
  const progressTrigger =
    root?.querySelector<HTMLButtonElement>(".composer-progress-trigger") ??
    null;

  if (progressTrigger) {
    if (progressTrigger.getAttribute("aria-expanded") !== "true") {
      progressTrigger.click();
    }
    progressTrigger.focus({ preventScroll: true });
    return "popover";
  }

  if (!scrollContainer) return "none";

  scrollContainer.scrollTo({
    top: scrollContainer.scrollHeight,
    behavior: reduceMotion ? "auto" : "smooth",
  });
  return "timeline";
}
