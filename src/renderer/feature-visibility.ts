/**
 * UI-only visibility switches for features that remain available in the codebase
 * but are not ready to be exposed in the main product navigation.
 */
export const FEATURE_VISIBILITY = {
  projects: false,
  inboxAgent: false,
  companies: false,
  ideas: true,
  automations: true,
  agentTeams: true,
  capabilityCenter: true,
  advancedAgentSettings: false,
} as const;

export function isInitialReleaseViewAvailable(view: string): boolean {
  switch (view) {
    case "projects":
      return FEATURE_VISIBILITY.projects;
    case "home":
    case "agentTeam":
      return FEATURE_VISIBILITY.agentTeams;
    case "automations":
      return FEATURE_VISIBILITY.automations;
    case "ideas":
      return FEATURE_VISIBILITY.ideas;
    case "inboxAgent":
      return FEATURE_VISIBILITY.inboxAgent;
    case "agents":
    case "agentsManage":
      return FEATURE_VISIBILITY.capabilityCenter;
    case "companies":
      return FEATURE_VISIBILITY.companies;
    default:
      return true;
  }
}

export function isInitialReleaseSettingsAvailable(tab: string): boolean {
  switch (tab) {
    case "companies":
    case "system":
    case "tray":
    case "policies":
    case "access":
    case "controlplane":
    case "webaccess":
    case "devices":
      return false;
    case "automations":
    case "queue":
    case "subconscious":
    case "scheduled":
    case "hooks":
    case "triggers":
    case "council":
    case "briefing":
    case "suggestions":
    case "traces":
      return FEATURE_VISIBILITY.automations;
    case "digitaltwins":
    case "everydayAgent":
    case "memory":
      return FEATURE_VISIBILITY.advancedAgentSettings;
    default:
      return true;
  }
}
