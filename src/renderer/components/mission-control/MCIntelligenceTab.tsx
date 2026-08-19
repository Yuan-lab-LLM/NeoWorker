import type {
  MissionControlCategory,
  MissionControlItem,
} from "../../../shared/types";
import { translate, useLanguage } from "../../i18n";
import type { MissionControlData } from "./useMissionControlData";

interface MCIntelligenceTabProps {
  data: MissionControlData;
}

const INTELLIGENCE_GROUPS: Array<{
  category: MissionControlCategory;
  titleKey: string;
  title: string;
  emptyKey: string;
  empty: string;
}> = [
  {
    category: "learnings",
    titleKey: "missionControl.intelligence.learnings",
    title: "Learnings",
    emptyKey: "missionControl.intelligence.empty.learnings",
    empty: "No grouped learnings yet.",
  },
  {
    category: "awareness",
    titleKey: "missionControl.intelligence.awareness",
    title: "Awareness",
    emptyKey: "missionControl.intelligence.empty.awareness",
    empty: "No awareness clusters yet.",
  },
  {
    category: "reviews",
    titleKey: "missionControl.intelligence.reviews",
    title: "Reviews",
    emptyKey: "missionControl.intelligence.empty.reviews",
    empty: "No review decisions yet.",
  },
];

function severityLabel(severity: MissionControlItem["severity"]): string {
  if (severity === "failed")
    return translate("missionControl.severity.failed", "failed");
  if (severity === "action_needed")
    return translate("missionControl.severity.actionNeeded", "action needed");
  if (severity === "successful")
    return translate("missionControl.severity.successful", "successful");
  return severity.replace(/_/g, " ");
}

function IntelligenceItem({
  item,
  formatRelativeTime,
}: {
  item: MissionControlItem;
  formatRelativeTime: MissionControlData["formatRelativeTime"];
}) {
  useLanguage();
  return (
    <article className="mc-v2-intelligence-row">
      <div className="mc-v2-intelligence-row-main">
        <div className="mc-v2-brief-item-top">
          <span
            className={`mc-v2-status-pill ${item.severity === "failed" ? "danger" : item.severity === "action_needed" ? "attention" : item.severity === "successful" ? "healthy" : ""}`}
          >
            {severityLabel(item.severity)}
          </span>
          <span className="mc-v2-feed-time">
            {formatRelativeTime(item.timestamp)}
          </span>
        </div>
        <h3>{item.title}</h3>
        <p>{item.summary}</p>
      </div>
      {(item.decision || item.nextStep) && (
        <div className="mc-v2-intelligence-row-side">
          {item.decision && <span>{item.decision}</span>}
          {item.nextStep && <strong>{item.nextStep}</strong>}
        </div>
      )}
    </article>
  );
}

export function MCIntelligenceTab({ data }: MCIntelligenceTabProps) {
  useLanguage();
  const t = translate;
  const { missionControlItems, formatRelativeTime } = data;

  return (
    <div className="mc-v2-intelligence">
      <div className="mc-v2-intelligence-header">
        <div>
          <h1>{t("missionControl.intelligence.title", "Intelligence")}</h1>
        </div>
      </div>

      <div className="mc-v2-intelligence-grid">
        {INTELLIGENCE_GROUPS.map((group) => {
          const items = missionControlItems
            .filter((item) => item.category === group.category)
            .slice(0, 12);
          return (
            <section
              key={group.category}
              className="mc-v2-intelligence-section"
            >
              <div className="mc-v2-brief-section-header">
                <h2>{t(group.titleKey, group.title)}</h2>
                <span>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div className="mc-v2-empty mc-v2-empty-compact">
                  {t(group.emptyKey, group.empty)}
                </div>
              ) : (
                <div className="mc-v2-intelligence-list">
                  {items.map((item) => (
                    <IntelligenceItem
                      key={item.id}
                      item={item}
                      formatRelativeTime={formatRelativeTime}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
