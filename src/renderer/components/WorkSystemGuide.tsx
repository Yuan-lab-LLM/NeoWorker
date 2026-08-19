import {
  ArrowRight,
  Bot,
  LayoutDashboard,
  UsersRound,
  Workflow,
} from "lucide-react";
import "./work-system-guide.css";
import { translate } from "../i18n/index";

export type WorkSystemView = "team" | "automation" | "assistant" | "mission";

interface WorkSystemGuideProps {
  current: WorkSystemView;
  onOpenTeam?: () => void;
  onOpenAutomation?: () => void;
  onOpenAssistant?: () => void;
  onOpenMission?: () => void;
}

interface GuideLinkProps {
  current: WorkSystemView;
  view: WorkSystemView;
  label: string;
  description: string;
  icon: typeof UsersRound;
  onClick?: () => void;
}

function GuideLink({
  current,
  view,
  label,
  description,
  icon: Icon,
  onClick,
}: GuideLinkProps) {
  const isCurrent = current === view;
  return (
    <button
      type="button"
      className={`work-system-link ${isCurrent ? "is-current" : ""}`}
      onClick={onClick}
      disabled={isCurrent || !onClick}
      aria-current={isCurrent ? "page" : undefined}
    >
      <span className="work-system-link-icon">
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <span className="work-system-link-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

export function WorkSystemGuide({
  current,
  onOpenTeam,
  onOpenAutomation,
  onOpenAssistant,
  onOpenMission,
}: WorkSystemGuideProps) {
  return (
    <nav
      className="work-system-guide"
      aria-label={translate(
        "generated.components.worksystemguide.52.0",
        "NeoWorker working link",
      )}
    >
      <div className="work-system-guide-label">
        <strong>
          {translate(
            "generated.components.worksystemguide.54.1",
            "working link",
          )}
        </strong>
        <span>
          {translate(
            "generated.components.worksystemguide.55.2",
            "Four modules, one set of work",
          )}
        </span>
      </div>

      <div className="work-system-zone work-system-zone-team">
        <span className="work-system-zone-label">
          {translate(
            "generated.components.worksystemguide.59.3",
            "Configure the executor",
          )}
        </span>
        <GuideLink
          current={current}
          view="team"
          label={translate(
            "generated.components.worksystemguide.63.4",
            "Agent team",
          )}
          description={translate(
            "generated.components.worksystemguide.64.5",
            "Configure roles and division of labor",
          )}
          icon={UsersRound}
          onClick={onOpenTeam}
        />
      </div>

      <span className="work-system-connector" aria-hidden="true">
        <ArrowRight className="work-system-arrow" size={17} strokeWidth={1.8} />
      </span>

      <div className="work-system-zone work-system-zone-sources">
        <span className="work-system-zone-label">
          <span>
            {translate(
              "generated.components.worksystemguide.76.6",
              "Initiate work",
            )}
          </span>
          <small>
            {translate(
              "generated.components.worksystemguide.77.7",
              "You can also directly assign a job",
            )}
          </small>
        </span>
        <div className="work-system-source-links">
          <GuideLink
            current={current}
            view="automation"
            label={translate(
              "generated.components.worksystemguide.83.8",
              "Automation",
            )}
            description={translate(
              "generated.components.worksystemguide.84.9",
              "Conditionally repeated start",
            )}
            icon={Workflow}
            onClick={onOpenAutomation}
          />
          <GuideLink
            current={current}
            view="assistant"
            label={translate(
              "generated.components.worksystemguide.91.10",
              "daily assistant",
            )}
            description={translate(
              "generated.components.worksystemguide.92.11",
              "Organize today and remind",
            )}
            icon={Bot}
            onClick={onOpenAssistant}
          />
        </div>
      </div>

      <span className="work-system-connector" aria-hidden="true">
        <ArrowRight className="work-system-arrow" size={17} strokeWidth={1.8} />
      </span>

      <div className="work-system-zone work-system-zone-mission">
        <span className="work-system-zone-label">
          {translate(
            "generated.components.worksystemguide.104.12",
            "Oversight and results",
          )}
        </span>
        <GuideLink
          current={current}
          view="mission"
          label={translate(
            "generated.components.worksystemguide.108.13",
            "mission center",
          )}
          description={translate(
            "generated.components.worksystemguide.109.14",
            "View progress and results",
          )}
          icon={LayoutDashboard}
          onClick={onOpenMission}
        />
      </div>
    </nav>
  );
}
