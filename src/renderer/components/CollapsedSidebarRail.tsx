import {
  Clock3,
  Lightbulb,
  MessageCircle,
  Plus,
  Settings,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { translate, useLanguage } from "../i18n";

interface CollapsedSidebarRailProps {
  isSessionsActive?: boolean;
  isEverydayAgentActive?: boolean;
  isAgentTeamActive?: boolean;
  isIdeasActive?: boolean;
  isAutomationsActive?: boolean;
  isToolsAndSkillsActive?: boolean;
  onExpand: () => void;
  onNewSession: () => void;
  onOpenEverydayAgent: () => void;
  onOpenAgentTeam: () => void;
  onOpenIdeas: () => void;
  onOpenAutomations: () => void;
  onOpenToolsAndSkills: () => void;
  onOpenSettings: () => void;
}

interface RailButtonProps {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
  className?: string;
}

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
  className = "",
}: RailButtonProps) {
  return (
    <button
      type="button"
      className={`collapsed-sidebar-rail-button ${active ? "active" : ""} ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
    </button>
  );
}

export function CollapsedSidebarRail({
  isSessionsActive = false,
  isEverydayAgentActive = false,
  isAgentTeamActive = false,
  isIdeasActive = false,
  isAutomationsActive = false,
  isToolsAndSkillsActive = false,
  onExpand,
  onNewSession,
  onOpenEverydayAgent,
  onOpenAgentTeam,
  onOpenIdeas,
  onOpenAutomations,
  onOpenToolsAndSkills,
  onOpenSettings,
}: CollapsedSidebarRailProps) {
  useLanguage();

  return (
    <aside
      className="collapsed-sidebar-rail"
      aria-label={translate("sidebar.navigation", "Main navigation")}
    >
      <button
        type="button"
        className="collapsed-sidebar-rail-brand"
        onClick={onExpand}
        aria-label={translate("app.action.showSidebar", "Show sidebar")}
        title={translate("app.action.showSidebar", "Show sidebar")}
      >
        <img src="./neoworker-app-icon.png" alt="" aria-hidden="true" />
      </button>

      <nav
        className="collapsed-sidebar-rail-navigation"
        aria-label={translate("sidebar.group.work", "Work")}
      >
        <RailButton
          label={translate("sidebar.newWork", "New job")}
          icon={Plus}
          onClick={onNewSession}
        />
        <RailButton
          label={translate("sidebar.sessions", "Sessions")}
          icon={MessageCircle}
          active={isSessionsActive}
          onClick={onExpand}
        />

        <div className="collapsed-sidebar-rail-divider" aria-hidden="true" />

        <RailButton
          label={translate("sidebar.proactive", "Daily assistant")}
          icon={Sparkles}
          active={isEverydayAgentActive}
          onClick={onOpenEverydayAgent}
        />
        <RailButton
          label={translate("sidebar.agentTeam", "Agent team")}
          icon={UsersRound}
          active={isAgentTeamActive}
          onClick={onOpenAgentTeam}
        />
        <RailButton
          label={translate("sidebar.ideas", "Inspiration")}
          icon={Lightbulb}
          active={isIdeasActive}
          onClick={onOpenIdeas}
        />
        <RailButton
          label={translate("sidebar.automations", "Automation")}
          icon={Clock3}
          active={isAutomationsActive}
          onClick={onOpenAutomations}
        />
        <RailButton
          label={translate("sidebar.toolsAndSkills", "Tools and skills")}
          icon={Wrench}
          active={isToolsAndSkillsActive}
          onClick={onOpenToolsAndSkills}
        />
      </nav>

      <RailButton
        label={translate("sidebar.settings", "Settings")}
        icon={Settings}
        onClick={onOpenSettings}
        className="collapsed-sidebar-rail-settings"
      />
    </aside>
  );
}
