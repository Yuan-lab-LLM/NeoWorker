import { Activity, Building2, Layers3, RefreshCw, Search } from "lucide-react";
import { MCSelectMenu } from "./MCSelectMenu";
import { NeoWorkerPageHeader } from "../NeoWorkerPageHeader";
import { ALL_WORKSPACES_ID } from "./useMissionControlData";
import { translate, useLanguage } from "../../i18n";
import { getMissionControlScopeName } from "../../utils/mission-control-copy";
import { FEATURE_VISIBILITY } from "../../feature-visibility";
import type { MissionControlData } from "./useMissionControlData";

interface MCTopBarProps {
  data: MissionControlData;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
}

export function MCTopBar({
  data,
  searchQuery = "",
  onSearchQueryChange,
}: MCTopBarProps) {
  useLanguage();
  const t = translate;
  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    isRefreshing,
    handleManualRefresh,
  } = data;

  return (
    <div className="mc-command-masthead">
      <NeoWorkerPageHeader
        className="mc-v2-topbar mc-command-topbar"
        title={t("missionControl.title", "Operation center")}
        description={translate(
          "generated.components.mission.control.mctopbar.39.0",
          "Focus on long tasks, automations, and work that requires your intervention; normal conversations won't show up here.",
        )}
        icon={<Activity size={18} strokeWidth={2} />}
        actions={
          <div className="mc-command-header-actions">
            <div className="mc-command-context">
              <MCSelectMenu
                ariaLabel={t("missionControl.topbar.workspace", "workspace")}
                className="mc-v2-selector mc-command-context-menu"
                icon={<Layers3 size={14} />}
                minMenuWidth={220}
                prefix={t("missionControl.topbar.workspace", "workspace")}
                value={selectedWorkspaceId || ALL_WORKSPACES_ID}
                onValueChange={setSelectedWorkspaceId}
                options={[
                  {
                    value: ALL_WORKSPACES_ID,
                    label: t(
                      "missionControl.topbar.allWorkspaces",
                      "All workspaces",
                    ),
                  },
                  ...workspaces.map((workspace) => ({
                    value: workspace.id,
                    label: getMissionControlScopeName(workspace.name),
                  })),
                ]}
              />
              {FEATURE_VISIBILITY.companies && companies.length > 0 ? (
                <MCSelectMenu
                  ariaLabel={t("missionControl.topbar.company", "company")}
                  className="mc-v2-selector mc-command-context-menu"
                  icon={<Building2 size={14} />}
                  minMenuWidth={220}
                  prefix={t("missionControl.topbar.company", "company")}
                  value={selectedCompanyId || companies[0]?.id || ""}
                  onValueChange={setSelectedCompanyId}
                  options={companies.map((company) => ({
                    value: company.id,
                    label: getMissionControlScopeName(company.name),
                  }))}
                />
              ) : null}
            </div>

            <label className="mc-command-search">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange?.(event.target.value)}
                placeholder={translate(
                  "generated.components.mission.control.mctopbar.89.1",
                  "Search for a run, owner or workspace",
                )}
              />
            </label>

            <button
              className="mc-command-icon-button"
              onClick={handleManualRefresh}
              disabled={
                (!selectedWorkspaceId && !selectedCompanyId) || isRefreshing
              }
              title={t("common.refresh", "Refresh")}
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? "is-spinning" : ""}
              />
            </button>
          </div>
        }
      />
    </div>
  );
}
