import {
  Clock3,
  Lightbulb,
  Newspaper,
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
  isPaperNewsActive?: boolean;
  isAutomationsActive?: boolean;
  isToolsAndSkillsActive?: boolean;
  onExpand: () => void;
  onNewSession: () => void;
  onOpenEverydayAgent: () => void;
  onOpenAgentTeam: () => void;
  onOpenIdeas: () => void;
  onOpenPaperNews?: () => void;
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
  newSession?: boolean;
}

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
  className = "",
  newSession = false,
}: RailButtonProps) {
  return (
    <button
      type="button"
      className={`new-task-btn cli-new-task-btn cli-action-btn collapsed-sidebar-rail-button ${newSession ? "sidebar-new-session-btn" : "sidebar-home-btn sidebar-nav-item"} ${active ? "active" : ""} ${className}`.trim()}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
    >
      <span className="cli-btn-text">
        <span className="cli-new-task-modern-label">
          <span
            className={`sidebar-home-btn-icon ${newSession ? "sidebar-new-session-icon" : ""}`.trim()}
            aria-hidden="true"
          >
            <Icon size={16} strokeWidth={2} style={{ display: "block" }} />
          </span>
        </span>
      </span>
    </button>
  );
}

export function CollapsedSidebarRail({
  isSessionsActive = false,
  isEverydayAgentActive = false,
  isAgentTeamActive = false,
  isIdeasActive = false,
  isPaperNewsActive = false,
  isAutomationsActive = false,
  isToolsAndSkillsActive = false,
  onExpand,
  onNewSession,
  onOpenEverydayAgent,
  onOpenAgentTeam,
  onOpenIdeas,
  onOpenPaperNews,
  onOpenAutomations,
  onOpenToolsAndSkills,
  onOpenSettings,
}: CollapsedSidebarRailProps) {
  useLanguage();

  return (
    <aside
      className="sidebar cli-sidebar collapsed-sidebar-rail"
      aria-label={translate("sidebar.navigation", "Main navigation")}
    >
      <div className="sidebar-brand-row">
        <button
          type="button"
          className="sidebar-brand-identity collapsed-sidebar-rail-brand"
          onClick={onExpand}
          aria-label={translate("app.action.showSidebar", "Show sidebar")}
          title={translate("app.action.showSidebar", "Show sidebar")}
        >
          <img
            className="sidebar-brand-logo"
            src="./neoworker-app-icon.png"
            width={28}
            height={28}
            alt=""
            aria-hidden="true"
            draggable={false}
          />
        </button>
      </div>

      <nav
        className="sidebar-header collapsed-sidebar-rail-navigation"
        aria-label={translate("sidebar.group.work", "Work")}
      >
        <div className="cli-header-actions sidebar-nav">
          <div className="sidebar-top-actions-row">
            <RailButton
              label={translate("sidebar.newWork", "New job")}
              icon={Plus}
              onClick={onNewSession}
              newSession
            />
          </div>
          <div className="sidebar-nav-group">
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
            {onOpenPaperNews && (
              <RailButton
                label={translate("sidebar.paperNews", "News Feed")}
                icon={Newspaper}
                active={isPaperNewsActive}
                onClick={onOpenPaperNews}
              />
            )}
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
          </div>
        </div>
        <div className="collapsed-sidebar-rail-divider" aria-hidden="true" />
        <RailButton
          label={translate("sidebar.sessions", "Sessions")}
          icon={MessageCircle}
          active={isSessionsActive}
          onClick={onExpand}
        />
      </nav>

      <div className="sidebar-footer cli-sidebar-footer collapsed-sidebar-rail-footer">
        <div className="cli-footer-actions">
          <button
            type="button"
            className="settings-btn cli-settings-btn collapsed-sidebar-rail-settings"
            onClick={onOpenSettings}
            aria-label={translate("sidebar.settings", "Settings")}
            title={translate("sidebar.settings", "Settings")}
          >
            <span className="modern-only">
              <Settings size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
