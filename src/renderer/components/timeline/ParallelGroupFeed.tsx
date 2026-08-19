import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import type { TimelineEventStatus } from "../../../shared/types";
import { isBrowserToolName } from "../../utils/timeline-tool-labels";
import { StepFeed } from "./StepFeed";
import type { TimelineIndicatorSpec } from "./timeline-indicators";
import type { ParallelGroupProjection } from "./parallel-group-projection";
import { translate, useLanguage } from "../../i18n";
import { localizeProgressText } from "../../utils/localized-progress-text";

type ParallelGroupLane = ParallelGroupProjection["lanes"][number];

interface ParallelGroupFeedProps {
  group: ParallelGroupProjection;
  timeLabel: string;
  formatTime: (timestamp: number) => string;
  showConnectorAbove?: boolean;
  showConnectorBelow?: boolean;
  defaultExpanded?: boolean;
}

function buildIndicatorForStatus(
  status: TimelineEventStatus,
): TimelineIndicatorSpec {
  if (status === "failed" || status === "blocked" || status === "cancelled") {
    return {
      icon: AlertTriangle,
      tone: "error",
      label: translate("timeline.parallel.failed", "Parallel group failed"),
    };
  }
  if (status === "completed" || status === "skipped") {
    return {
      icon: Check,
      tone: "success",
      label: translate(
        "timeline.parallel.completed",
        "Parallel group completed",
      ),
    };
  }
  if (status === "in_progress" || status === "pending") {
    return {
      icon: Loader2,
      tone: "active",
      spin: true,
      label: translate("timeline.parallel.running", "Parallel group running"),
    };
  }
  return {
    icon: Circle,
    tone: "neutral",
    label: translate("timeline.parallel.group", "Parallel group"),
  };
}

function laneTone(
  status: TimelineEventStatus,
): "neutral" | "active" | "success" | "error" {
  if (status === "failed" || status === "blocked" || status === "cancelled")
    return "error";
  if (status === "completed") return "success";
  if (status === "skipped") return "neutral";
  if (status === "in_progress" || status === "pending") return "active";
  return "neutral";
}

function isActiveStatus(status: TimelineEventStatus): boolean {
  return status === "in_progress" || status === "pending";
}

function isActiveImageGenerationLane(lane: ParallelGroupLane): boolean {
  return lane.toolName === "generate_image" && isActiveStatus(lane.status);
}

function hasActiveImageGenerationLane(group: ParallelGroupProjection): boolean {
  return group.lanes.some(isActiveImageGenerationLane);
}

function isBrowserToolGroup(group: ParallelGroupProjection): boolean {
  return (
    group.lanes.length > 0 &&
    group.lanes.every((lane) => isBrowserToolName(lane.toolName))
  );
}

function ImageGenerationFramePreview() {
  useLanguage();
  return (
    <div
      className="parallel-group-feed-image-frame"
      role="status"
      aria-live="polite"
      aria-label={translate("timeline.generatingImage", "Generating image")}
    >
      <span
        className="parallel-group-feed-image-frame-core"
        aria-hidden="true"
      />
      <span
        className="parallel-group-feed-image-frame-sheen"
        aria-hidden="true"
      />
    </div>
  );
}

function buildParallelGroupTitle(
  group: ParallelGroupProjection,
  isActive: boolean,
): string {
  const count = group.lanes.length;
  if (isBrowserToolGroup(group)) {
    return isActive
      ? translate("timeline.parallel.usingBrowser", "Using the browser")
      : translate("timeline.parallel.usedBrowser", "Used the browser");
  }

  const singleLaneTitle =
    count === 1 && typeof group.lanes[0]?.title === "string"
      ? group.lanes[0].title.trim()
      : "";
  if (singleLaneTitle) {
    return singleLaneTitle;
  }
  const label = typeof group.label === "string" ? group.label.trim() : "";
  if (
    label &&
    !/^tool batch(?: \(\d+\))?$/i.test(label) &&
    !/^follow-up tool batch(?: \(\d+\))?$/i.test(label) &&
    !/^tools:/i.test(label)
  ) {
    return label;
  }
  const toolNames = Array.from(
    new Set(
      group.lanes
        .map((lane) =>
          typeof lane.toolName === "string" ? lane.toolName.trim() : "",
        )
        .filter((name) => name.length > 0),
    ),
  );

  if (toolNames.length === 1) {
    const tool = toolNames[0];
    if (tool === "web_fetch" || tool === "http_request") {
      return isActive
        ? translate(
            "timeline.parallel.fetchingPages",
            "Fetching {count} pages",
            { count },
          )
        : translate("timeline.parallel.fetchedPages", "Fetched {count} pages", {
            count,
          });
    }
    if (tool === "web_search") {
      return isActive
        ? translate("timeline.parallel.searchingWeb", "Searching the web")
        : translate("timeline.parallel.searchedWeb", "Searched the web");
    }
    if (tool === "read_file" || tool === "read_files") {
      return isActive
        ? translate("timeline.parallel.readingFiles", "Reading {count} files", {
            count,
          })
        : translate("timeline.parallel.readFiles", "Read {count} files", {
            count,
          });
    }
  }

  return isActive
    ? translate(
        "timeline.parallel.runningTasks",
        "Running {count} tasks in parallel",
        { count },
      )
    : translate(
        "timeline.parallel.tasksCompleted",
        "{count} parallel tasks completed",
        { count },
      );
}

export function ParallelGroupFeed({
  group,
  timeLabel,
  formatTime: _formatTime,
  showConnectorAbove = false,
  showConnectorBelow = false,
  defaultExpanded = false,
}: ParallelGroupFeedProps) {
  useLanguage();
  void _formatTime;
  const singleLane = group.lanes.length === 1 ? group.lanes[0] : null;
  const isBrowserGroup = isBrowserToolGroup(group);
  const isActive =
    isActiveStatus(group.status) ||
    group.lanes.some((lane) => isActiveStatus(lane.status));
  const showImageGenerationFrame = hasActiveImageGenerationLane(group);
  const hasExpandableDetails = group.lanes.length > 1 || isBrowserGroup;
  const [expanded, setExpanded] = useState(
    hasExpandableDetails && (isActive || defaultExpanded),
  );

  useEffect(() => {
    if (!hasExpandableDetails) {
      setExpanded(false);
      return;
    }
    if (isActive || defaultExpanded) {
      setExpanded(true);
    }
  }, [defaultExpanded, hasExpandableDetails, isActive]);

  const indicator = useMemo(
    () => buildIndicatorForStatus(group.status),
    [group.status],
  );
  const groupTitle = useMemo(
    () => buildParallelGroupTitle(group, isActive),
    [group, isActive],
  );
  const visibleGroupTitle =
    singleLane?.status === "skipped"
      ? localizeProgressText(groupTitle)
      : groupTitle;

  // Keep hooks unconditional. A streaming projection can mount the group
  // before its lanes arrive, then populate them in the next event batch.
  // Returning before useState/useEffect changed the hook order and crashed the
  // entire conversation surface, which looked like a blank transcript.
  if (group.lanes.length === 0) {
    return null;
  }

  if (singleLane && !isBrowserGroup) {
    return (
      <div className="timeline-event parallel-group-feed-single">
        <div className="parallel-group-feed-lane parallel-group-feed-single-lane">
          <span
            className={`parallel-group-feed-lane-dot tone-${laneTone(singleLane.status)}`}
            aria-hidden="true"
          />
          <div
            className="parallel-group-feed-lane-title"
            title={visibleGroupTitle}
          >
            {visibleGroupTitle}
          </div>
        </div>
        {showImageGenerationFrame ? <ImageGenerationFramePreview /> : null}
      </div>
    );
  }

  const title = (
    <span>
      {groupTitle}
      {hasExpandableDetails &&
        !(groupTitle.match(/\b\d+\b/) && group.lanes.length > 0) && (
          <span className="event-title-meta"> ({group.lanes.length})</span>
        )}
    </span>
  );

  return (
    <StepFeed
      title={title}
      titleTooltip={groupTitle}
      timeLabel={timeLabel}
      hideTime
      indicator={indicator}
      showConnectorAbove={showConnectorAbove}
      showConnectorBelow={showConnectorBelow}
      expandable={hasExpandableDetails}
      expanded={expanded}
      onToggle={
        hasExpandableDetails ? () => setExpanded((prev) => !prev) : undefined
      }
      details={
        hasExpandableDetails && expanded ? (
          <div className="parallel-group-feed-details">
            {group.lanes.map((lane) => (
              <div key={lane.laneKey} className="parallel-group-feed-lane">
                <span
                  className={`parallel-group-feed-lane-dot tone-${laneTone(lane.status)}`}
                  aria-hidden="true"
                />
                <div
                  className="parallel-group-feed-lane-title"
                  title={lane.title}
                >
                  {lane.status === "skipped"
                    ? localizeProgressText(lane.title)
                    : lane.title}
                </div>
              </div>
            ))}
            {showImageGenerationFrame ? <ImageGenerationFramePreview /> : null}
          </div>
        ) : undefined
      }
    />
  );
}
