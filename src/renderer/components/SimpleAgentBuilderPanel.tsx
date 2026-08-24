import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  CalendarDays,
  CheckCircle2,
  Library,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  AgentRole,
  AgentBuilderPlan,
  AgentBuilderSelectionOption,
  AgentBuilderSelectionRequirement,
  ManagedAgent,
  Workspace,
} from "../../shared/types";
import { deriveAgentNameFromPrompt, isGenericAgentName } from "../../shared/agent-name";
import { translate, useLanguage, type SupportedLanguage } from "../i18n";
import {
  getLocalizedAgentCapability,
  getLocalizedAgentRoleText,
} from "../utils/localized-agent-roles";
import { getAgentRoleLinkedSkillLabels } from "../utils/agent-role-skills";
import { getAgentRoleVisual } from "../utils/agent-role-portraits";
import { getLocalizedSkillText } from "../utils/localized-skills";
import { getSemanticIconVisual } from "../utils/semantic-icon-map";
import {
  resetSimpleAgentBuilderSession,
  updateSimpleAgentBuilderSession,
  useSimpleAgentBuilderSession,
} from "./simple-agent-builder-state";
import "./simple-agent-builder.css";

interface SimpleAgentBuilderPanelProps {
  workspace?: Workspace | null;
  onBack?: () => void;
  onSelectRole: (role: AgentRole) => void;
}

type AgentOverview = {
  total: number;
  scheduled: number;
};

type AgentDirectoryFilter = "all" | "build" | "insight" | "content" | "coordination";

const AGENT_DIRECTORY_FILTERS: Array<{
  id: AgentDirectoryFilter;
  label: string;
  capabilities: string[];
}> = [
  {
    id: "all",
    label: translate("generated.components.simpleagentbuilderpanel.54.0", "All"),
    capabilities: [],
  },
  {
    id: "build",
    label: translate(
      "generated.components.simpleagentbuilderpanel.57.1",
      "Products and Technology",
    ),
    capabilities: ["code", "build", "debug", "test", "ops", "security", "design"],
  },
  {
    id: "insight",
    label: translate("generated.components.simpleagentbuilderpanel.62.2", "research and analysis"),
    capabilities: ["research", "analyze", "review"],
  },
  {
    id: "content",
    label: translate("generated.components.simpleagentbuilderpanel.67.3", "Content and growth"),
    capabilities: ["write", "document", "market"],
  },
  {
    id: "coordination",
    label: translate(
      "generated.components.simpleagentbuilderpanel.72.4",
      "Planning and collaboration",
    ),
    capabilities: ["plan", "manage", "communicate", "product"],
  },
];

const EMPTY_OVERVIEW: AgentOverview = {
  total: 0,
  scheduled: 0,
};

const AGENT_SUGGESTIONS = [
  {
    id: "team-chat",
    icon: MessageSquare,
    title: translate("generated.components.simpleagentbuilderpanel.86.5", "Team Chat Q&A"),
    description: translate(
      "generated.components.simpleagentbuilderpanel.87.6",
      "Use approved documents and files to answer frequently asked team questions.",
    ),
    prompt: translate(
      "generated.components.simpleagentbuilderpanel.88.7",
      "Create a team Q&A agent that answers frequently asked questions using approved documents and files in your workspace.",
    ),
  },
  {
    id: "morning-plan",
    icon: CalendarDays,
    title: translate(
      "generated.components.simpleagentbuilderpanel.93.8",
      "Morning Planning Assistant",
    ),
    description: translate(
      "generated.components.simpleagentbuilderpanel.94.9",
      "Organize your calendar, to-do tasks, and inbox context into a daily plan.",
    ),
    prompt: translate(
      "generated.components.simpleagentbuilderpanel.95.10",
      "Create a morning planning agent that organizes your calendar, to-do tasks, and inbox context every day to generate a clear action plan.",
    ),
  },
  {
    id: "triage",
    icon: CheckCircle2,
    title: translate(
      "generated.components.simpleagentbuilderpanel.100.11",
      "Defect Triage Assistant",
    ),
    description: translate(
      "generated.components.simpleagentbuilderpanel.101.12",
      "Review incoming defects, prioritize them, and generate evidence-based summaries.",
    ),
    prompt: translate(
      "generated.components.simpleagentbuilderpanel.102.13",
      "Create a defect triage agent to review incoming defects, determine priorities, and generate a well-founded triage summary.",
    ),
  },
] as const;

const AGENT_CREATION_STEPS = [
  translate("generated.components.simpleagentbuilderpanel.106.14", "Understand the goal"),
  translate("generated.components.simpleagentbuilderpanel.106.15", "Matching ability"),
  translate("generated.components.simpleagentbuilderpanel.106.16", "Complete configuration"),
] as const;

function optionConnectionKeys(option: AgentBuilderSelectionOption): Set<string> {
  return new Set(
    (option.missingConnections || []).map((connection) => `${connection.kind}:${connection.id}`),
  );
}

function uniqueValues<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function applySimpleBuilderName(
  plan: AgentBuilderPlan,
  requestedName: string,
  prompt: string,
): AgentBuilderPlan {
  const explicitName = requestedName.trim().slice(0, 40);
  const currentName = plan.name.trim();
  const name =
    explicitName ||
    (isGenericAgentName(currentName)
      ? deriveAgentNameFromPrompt(
          prompt,
          translate("generated.components.simpleagentbuilderpanel.130.17", "new agent"),
        )
      : currentName);
  if (!name || name === plan.name) return plan;

  const replaceName = (value: string): string =>
    currentName && currentName !== name ? value.split(currentName).join(name) : value;

  return {
    ...plan,
    name,
    instructions: replaceName(plan.instructions),
    starterPrompts: plan.starterPrompts.map((starterPrompt) => ({
      ...starterPrompt,
      title: replaceName(starterPrompt.title),
      prompt: replaceName(starterPrompt.prompt),
      description: replaceName(starterPrompt.description || ""),
    })),
    routines: plan.routines.map((routine) => ({
      ...routine,
      name: replaceName(routine.name),
    })),
  };
}

export function getSimpleAgentDirectoryFilter(
  role: AgentRole,
): Exclude<AgentDirectoryFilter, "all"> {
  const capabilities = new Set((role.capabilities || []).map(String));
  const primaryCapability = String(role.capabilities?.[0] || "");
  const primaryMatch = AGENT_DIRECTORY_FILTERS.find(
    (filter) =>
      filter.id !== "all" && primaryCapability && filter.capabilities.includes(primaryCapability),
  );
  if (primaryMatch?.id && primaryMatch.id !== "all") return primaryMatch.id;

  const fallbackMatch = AGENT_DIRECTORY_FILTERS.find(
    (filter) =>
      filter.id !== "all" && filter.capabilities.some((capability) => capabilities.has(capability)),
  );
  return fallbackMatch?.id && fallbackMatch.id !== "all" ? fallbackMatch.id : "coordination";
}

export function filterSimpleAgentDirectory(
  roles: AgentRole[],
  query: string,
  filter: AgentDirectoryFilter,
): AgentRole[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return roles.filter((role) => {
    if (filter !== "all" && getSimpleAgentDirectoryFilter(role) !== filter) return false;
    if (!normalizedQuery) return true;
    const localized = getLocalizedAgentRoleText(role);
    const searchable = [
      localized.name,
      localized.description,
      role.name,
      role.displayName,
      role.description,
      ...(role.capabilities || []).map((capability) => getLocalizedAgentCapability(capability)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function applySimpleBuilderSelection(
  plan: AgentBuilderPlan,
  requirementId: string,
  optionId: string,
): AgentBuilderPlan {
  const requirement = (plan.selectionRequirements || []).find(
    (entry) => entry.id === requirementId,
  );
  const option = requirement?.options.find((entry) => entry.id === optionId);
  if (!requirement || !option) return plan;

  const requirementToolFamilies = new Set(
    requirement.options.flatMap((entry) => entry.selectedToolFamilies || []),
  );
  const requirementMcpServers = new Set(
    requirement.options.flatMap((entry) => entry.selectedMcpServers || []),
  );
  const requirementSkills = new Set(
    requirement.options.flatMap((entry) => entry.selectedSkills || []),
  );
  const requirementConnectionKeys = new Set(
    requirement.options.flatMap((entry) => Array.from(optionConnectionKeys(entry))),
  );
  const missingConnections = [
    ...(plan.missingConnections || []).filter(
      (connection) => !requirementConnectionKeys.has(`${connection.kind}:${connection.id}`),
    ),
    ...(option.missingConnections || []),
  ];

  return {
    ...plan,
    selectedToolFamilies: uniqueValues([
      ...(plan.selectedToolFamilies || []).filter((family) => !requirementToolFamilies.has(family)),
      ...(option.selectedToolFamilies || []),
    ]),
    selectedMcpServers: uniqueValues([
      ...(plan.selectedMcpServers || []).filter((serverId) => !requirementMcpServers.has(serverId)),
      ...(option.selectedMcpServers || []),
    ]),
    connectedMcpServers: uniqueValues([
      ...(plan.connectedMcpServers || []).filter(
        (serverId) => !requirementMcpServers.has(serverId),
      ),
      ...(option.selectedMcpServers || []),
    ]),
    selectedSkills: uniqueValues([
      ...(plan.selectedSkills || []).filter((skillId) => !requirementSkills.has(skillId)),
      ...(option.selectedSkills || []),
    ]),
    missingConnections,
    recommendedMissingIntegrations: missingConnections,
    selectionRequirements: (plan.selectionRequirements || []).map((entry) =>
      entry.id === requirementId ? { ...entry, selectedOptionId: optionId } : entry,
    ),
  };
}

export function getRequiredSimpleBuilderSelections(
  plan?: AgentBuilderPlan | null,
): AgentBuilderSelectionRequirement[] {
  return (plan?.selectionRequirements || []).filter(
    (requirement) => requirement.required && !requirement.selectedOptionId,
  );
}

export function getLocalizedSimpleBuilderRequirement(
  requirement: AgentBuilderSelectionRequirement,
  language: SupportedLanguage,
): { title: string; reason: string } {
  if (language !== "zh-CN") {
    return { title: requirement.title, reason: requirement.reason };
  }
  if (requirement.kind === "skill") {
    return {
      title: translate("generated.components.simpleagentbuilderpanel.286.18", "Choose a skill"),
      reason: translate(
        "generated.components.simpleagentbuilderpanel.287.19",
        "If multiple skills are found that meet your needs, please choose the one that best suits this agent.",
      ),
    };
  }
  if (requirement.kind === "integration") {
    return {
      title: translate(
        "generated.components.simpleagentbuilderpanel.292.20",
        "Choose a connection service",
      ),
      reason: translate(
        "generated.components.simpleagentbuilderpanel.293.21",
        "Multiple available connection services were found, please select the one this agent needs to use.",
      ),
    };
  }
  return {
    title: translate("generated.components.simpleagentbuilderpanel.297.22", "Choose a tool"),
    reason: translate(
      "generated.components.simpleagentbuilderpanel.298.23",
      "If multiple tools are found that meet your needs, please select the one that this agent needs to use.",
    ),
  };
}

export function getLocalizedSimpleBuilderOption(
  requirement: AgentBuilderSelectionRequirement,
  option: AgentBuilderSelectionOption,
  language: SupportedLanguage,
): { name: string; description: string } {
  if (requirement.kind !== "skill") {
    return { name: option.label, description: option.description || "" };
  }

  const skillId = option.selectedSkills?.[0] || option.id;
  const localized = getLocalizedSkillText(
    {
      id: skillId,
      name: option.label || skillId,
      description: option.description || "",
    },
    language,
  );
  return { name: localized.name, description: localized.description };
}

export function SimpleAgentBuilderPanel({
  workspace,
  onBack,
  onSelectRole,
}: SimpleAgentBuilderPanelProps) {
  const t = translate;
  const language = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const directoryRef = useRef<HTMLElement>(null);
  const [overview, setOverview] = useState<AgentOverview>(EMPTY_OVERVIEW);
  const [workspaces, setWorkspaces] = useState<Workspace[]>(workspace ? [workspace] : []);
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryFilter, setDirectoryFilter] = useState<AgentDirectoryFilter>("all");
  const { agentName, prompt, plan, stage, createdName, error } = useSimpleAgentBuilderSession();
  const setAgentName = useCallback(
    (value: string) => updateSimpleAgentBuilderSession({ agentName: value }),
    [],
  );
  const setPrompt = useCallback(
    (value: string) => updateSimpleAgentBuilderSession({ prompt: value }),
    [],
  );
  const setPlan = useCallback(
    (value: AgentBuilderPlan | null) => updateSimpleAgentBuilderSession({ plan: value }),
    [],
  );
  const setStage = useCallback(
    (value: typeof stage) => updateSimpleAgentBuilderSession({ stage: value }),
    [],
  );
  const setCreatedName = useCallback(
    (value: string) => updateSimpleAgentBuilderSession({ createdName: value }),
    [],
  );
  const setError = useCallback(
    (value: string | null) => updateSimpleAgentBuilderSession({ error: value }),
    [],
  );
  const activeCreationStep = stage === "creating" ? 2 : 0;

  const selectedWorkspace = workspace || workspaces[0] || null;
  const requiredSelections = useMemo(() => getRequiredSimpleBuilderSelections(plan), [plan]);
  const queryMatchedRoles = useMemo(
    () => filterSimpleAgentDirectory(roles, directoryQuery, "all"),
    [directoryQuery, roles],
  );
  const visibleRoles = useMemo(
    () => filterSimpleAgentDirectory(queryMatchedRoles, "", directoryFilter),
    [directoryFilter, queryMatchedRoles],
  );

  const loadOverview = useCallback(async () => {
    try {
      setDirectoryLoading(true);
      const [managedAgents, availableWorkspaces, availableRoles] = await Promise.all([
        window.electronAPI.listManagedAgents(),
        window.electronAPI.listWorkspaces(),
        window.electronAPI.getAgentRoles(true),
      ]);
      const agents = (managedAgents || []) as ManagedAgent[];
      const nextRoles = (availableRoles || []) as AgentRole[];
      const routines = await Promise.all(
        agents.map((agent) => window.electronAPI.listManagedAgentRoutines(agent.id)),
      );
      const scheduled = routines.reduce(
        (count, entries) => count + entries.filter((routine) => routine.enabled).length,
        0,
      );
      setOverview({ total: nextRoles.length || agents.length, scheduled });
      setWorkspaces(availableWorkspaces || []);
      setRoles(nextRoles);
    } catch (loadError) {
      console.warn("[SimpleAgentBuilder] Failed to load overview", loadError);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (stage === "created") void loadOverview();
  }, [loadOverview, stage]);

  const createFromPlan = async (resolvedPlan: AgentBuilderPlan) => {
    setStage("creating");
    setError(null);
    try {
      const created = await window.electronAPI.createManagedAgentFromPlan({
        plan: resolvedPlan,
        workspaceId: selectedWorkspace?.id,
        activate: true,
      });
      setCreatedName(created.agent.name || resolvedPlan.name);
      setPlan(resolvedPlan);
      setAgentName("");
      setPrompt("");
      setStage("created");
      await loadOverview();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("agents.simple.createError", "Agent creation failed, please try again."),
      );
      setStage(getRequiredSimpleBuilderSelections(resolvedPlan).length > 0 ? "choosing" : "idle");
    }
  };

  const handleCreate = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || stage === "designing" || stage === "creating") return;

    setPrompt(normalizedPrompt);
    setCreatedName("");
    setPlan(null);
    setError(null);
    setStage("designing");
    try {
      const generatedPlan = await window.electronAPI.generateManagedAgentPlan({
        prompt: normalizedPrompt,
        workspaceId: selectedWorkspace?.id,
      });
      const resolvedPlan = applySimpleBuilderName(generatedPlan, agentName, normalizedPrompt);
      setPlan(resolvedPlan);
      if (getRequiredSimpleBuilderSelections(resolvedPlan).length > 0) {
        setStage("choosing");
        return;
      }
      await createFromPlan(resolvedPlan);
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : t(
              "agents.simple.planError",
              "We cannot understand this requirement at the moment. Please try another way of saying it.",
            ),
      );
      setStage("idle");
    }
  };

  const handleSelection = (requirement: AgentBuilderSelectionRequirement, optionId: string) => {
    if (!plan) return;
    setPlan(applySimpleBuilderSelection(plan, requirement.id, optionId));
  };

  const resetBuilder = () => {
    resetSimpleAgentBuilderSession();
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const fillSuggestion = (suggestionPrompt: string) => {
    updateSimpleAgentBuilderSession({
      prompt: suggestionPrompt,
      agentName: "",
      plan: null,
      createdName: "",
      error: null,
      stage: "idle",
    });
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(suggestionPrompt.length, suggestionPrompt.length);
    });
  };

  return (
    <main className="simple-agent-builder">
      {onBack ? (
        <div className="simple-agent-builder-topbar">
          <button type="button" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" />
            {translate(
              "generated.components.simpleagentbuilderpanel.495.24",
              "Return to the agent team",
            )}
          </button>
        </div>
      ) : null}

      <section className="simple-agent-page-header" aria-labelledby="simple-agent-page-title">
        <div>
          <h1 id="simple-agent-page-title">
            {translate("generated.components.simpleagentbuilderpanel.502.25", "Agent team")}
          </h1>
          <p>
            {translate(
              "generated.components.simpleagentbuilderpanel.503.26",
              "Create a new agent or select an appropriate leader from an existing agent.",
            )}
          </p>
        </div>
        <div className="simple-agent-page-actions">
          <span className="simple-agent-page-stat">
            <Bot size={16} aria-hidden="true" />
            <strong>{overview.total}</strong>
            {translate("generated.components.simpleagentbuilderpanel.509.27", "agent")}
          </span>
          {overview.scheduled > 0 ? (
            <span className="simple-agent-page-stat">
              <CalendarDays size={16} aria-hidden="true" />
              <strong>{overview.scheduled}</strong>
              {translate("generated.components.simpleagentbuilderpanel.515.28", "plan")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() =>
              directoryRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            <Library size={16} aria-hidden="true" />
            {translate("generated.components.simpleagentbuilderpanel.525.29", "Browse agents")}
          </button>
        </div>
      </section>

      <section className="simple-agent-create" aria-labelledby="simple-agent-create-title">
        <div className="simple-agent-create-heading">
          <span className="simple-agent-create-icon">
            <Bot size={22} aria-hidden="true" />
          </span>
          <div>
            <h2 id="simple-agent-create-title">
              {translate(
                "generated.components.simpleagentbuilderpanel.536.30",
                "What should your agent do?",
              )}
            </h2>
            <p>
              {translate(
                "generated.components.simpleagentbuilderpanel.537.31",
                "Just describe your target and NeoWorker will automatically match capabilities and security settings.",
              )}
            </p>
          </div>
        </div>

        <label className="simple-agent-name-field" htmlFor="simple-agent-name">
          <Bot size={16} aria-hidden="true" />
          <span>{translate("generated.components.simpleagentbuilderpanel.543.32", "Name")}</span>
          <input
            id="simple-agent-name"
            value={agentName}
            onChange={(event) => setAgentName(event.target.value)}
            placeholder={translate(
              "generated.components.simpleagentbuilderpanel.548.33",
              "Optional, leave it blank and it will be automatically generated based on the task",
            )}
            maxLength={40}
            disabled={stage === "designing" || stage === "creating"}
          />
        </label>

        <form
          className="simple-agent-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <Plus size={17} aria-hidden="true" />
          <label className="sr-only" htmlFor="simple-agent-prompt">
            {translate(
              "generated.components.simpleagentbuilderpanel.563.34",
              "Describe the work to be done by the agent",
            )}
          </label>
          <input
            ref={inputRef}
            id="simple-agent-prompt"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (error) setError(null);
            }}
            placeholder={translate(
              "generated.components.simpleagentbuilderpanel.573.35",
              "describe what it should do",
            )}
            disabled={stage === "designing" || stage === "creating"}
          />
          <button
            type="submit"
            aria-label={translate(
              "generated.components.simpleagentbuilderpanel.578.36",
              "Create an agent",
            )}
            disabled={!prompt.trim() || stage === "designing" || stage === "creating"}
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </form>

        {stage === "designing" || stage === "creating" ? (
          <div
            key={stage}
            className={`simple-agent-progress is-${stage}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="simple-agent-progress-icon" aria-hidden="true">
              <span className="simple-agent-progress-orbit" />
              <Sparkles size={18} />
            </span>
            <div className="simple-agent-progress-copy">
              <strong>
                {stage === "designing"
                  ? translate(
                      "generated.components.simpleagentbuilderpanel.599.37",
                      "Understanding the needs",
                    )
                  : translate(
                      "generated.components.simpleagentbuilderpanel.599.38",
                      "Agent is being created",
                    )}
                <span className="simple-agent-progress-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </strong>
              <span>
                {stage === "designing"
                  ? translate(
                      "generated.components.simpleagentbuilderpanel.608.39",
                      "Objectives, required capabilities and security boundaries are being analyzed.",
                    )
                  : translate(
                      "generated.components.simpleagentbuilderpanel.609.40",
                      "Saving configuration and preparing for use.",
                    )}
              </span>
              <div className="simple-agent-progress-steps" aria-hidden="true">
                {AGENT_CREATION_STEPS.map((label, index) => (
                  <span
                    key={label}
                    className={
                      index < activeCreationStep
                        ? "is-complete"
                        : index === activeCreationStep
                          ? "is-active"
                          : ""
                    }
                  >
                    <i />
                    {label}
                  </span>
                ))}
              </div>
              <div className="simple-agent-progress-track" aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
        ) : null}

        {plan && stage === "choosing" ? (
          <div className="simple-agent-choices">
            <div>
              <strong>
                {translate(
                  "generated.components.simpleagentbuilderpanel.638.41",
                  "One more piece of information needs to be confirmed",
                )}
              </strong>
              <span>
                {translate(
                  "generated.components.simpleagentbuilderpanel.639.42",
                  "Shows only the choices necessary to create this agent.",
                )}
              </span>
            </div>
            {requiredSelections.map((requirement) => {
              const requirementCopy = getLocalizedSimpleBuilderRequirement(requirement, language);
              return (
                <fieldset key={requirement.id}>
                  <legend>{requirementCopy.title}</legend>
                  {requirementCopy.reason ? <p>{requirementCopy.reason}</p> : null}
                  <div>
                    {requirement.options.map((option) => {
                      const optionCopy = getLocalizedSimpleBuilderOption(
                        requirement,
                        option,
                        language,
                      );
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={requirement.selectedOptionId === option.id ? "selected" : ""}
                          onClick={() => handleSelection(requirement, option.id)}
                        >
                          <strong>{optionCopy.name}</strong>
                          {optionCopy.description ? <span>{optionCopy.description}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
            <button
              type="button"
              className="simple-agent-confirm"
              disabled={requiredSelections.length > 0}
              onClick={() => plan && void createFromPlan(plan)}
            >
              {translate("generated.components.simpleagentbuilderpanel.683.43", "Create an agent")}
            </button>
          </div>
        ) : null}

        {stage === "created" ? (
          <div className="simple-agent-success" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>
                “{createdName}
                {translate(
                  "generated.components.simpleagentbuilderpanel.692.44",
                  '"Created and enabled',
                )}
              </strong>
              <span>
                {translate(
                  "generated.components.simpleagentbuilderpanel.693.45",
                  "It can then be used directly in team missions.",
                )}
              </span>
            </div>
            <button type="button" onClick={resetBuilder}>
              {translate("generated.components.simpleagentbuilderpanel.696.46", "Create another")}
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="simple-agent-error" role="alert">
            {error}
          </div>
        ) : null}

        {stage === "idle" ? (
          <div className="simple-agent-suggestions">
            {AGENT_SUGGESTIONS.map((suggestion) => {
              const SuggestionIcon = suggestion.icon;
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  aria-label={`${suggestion.title}：${suggestion.description}`}
                  onClick={() => fillSuggestion(suggestion.prompt)}
                >
                  <SuggestionIcon size={17} aria-hidden="true" />
                  <strong>{suggestion.title}</strong>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section
        ref={directoryRef}
        className="simple-agent-directory"
        aria-labelledby="simple-agent-directory-title"
        aria-busy={directoryLoading}
      >
        <div className="simple-agent-directory-heading">
          <div>
            <h2 id="simple-agent-directory-title">
              {translate("generated.components.simpleagentbuilderpanel.735.47", "Existing agents")}
            </h2>
            <p>
              {translate(
                "generated.components.simpleagentbuilderpanel.736.48",
                "Find ready-to-use agents by job type.",
              )}
            </p>
          </div>
          <span>
            {roles.length}{" "}
            {translate("generated.components.simpleagentbuilderpanel.738.49", "agent")}
          </span>
        </div>

        <div className="simple-agent-directory-toolbar">
          <div
            className="simple-agent-directory-filters"
            role="group"
            aria-label={translate(
              "generated.components.simpleagentbuilderpanel.742.50",
              "Filter agents by job type",
            )}
          >
            {AGENT_DIRECTORY_FILTERS.map((filter) => {
              const count =
                filter.id === "all"
                  ? queryMatchedRoles.length
                  : queryMatchedRoles.filter(
                      (role) => getSimpleAgentDirectoryFilter(role) === filter.id,
                    ).length;
              const selected = directoryFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={selected ? "selected" : ""}
                  aria-pressed={selected}
                  onClick={() => setDirectoryFilter(filter.id)}
                >
                  {filter.label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
          <label className="simple-agent-directory-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">
              {translate("generated.components.simpleagentbuilderpanel.767.51", "Search agent")}
            </span>
            <input
              value={directoryQuery}
              onChange={(event) => setDirectoryQuery(event.target.value)}
              placeholder={translate(
                "generated.components.simpleagentbuilderpanel.771.52",
                "Search agent",
              )}
            />
          </label>
        </div>

        {directoryLoading ? (
          <div
            className="simple-agent-directory-grid"
            aria-label={translate(
              "generated.components.simpleagentbuilderpanel.777.53",
              "Loading agent",
            )}
          >
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="simple-agent-card simple-agent-card-skeleton" />
            ))}
          </div>
        ) : visibleRoles.length ? (
          <div className="simple-agent-directory-grid">
            {visibleRoles.map((role, roleIndex) => {
              const localized = getLocalizedAgentRoleText(role);
              const roleName = localized.name || role.displayName || role.name;
              const roleVisual = getAgentRoleVisual(role);
              const capabilities = (role.capabilities || [])
                .slice(0, 3)
                .map(getLocalizedAgentCapability);
              const linkedSkills = getAgentRoleLinkedSkillLabels(role, [], language);
              const visual = getSemanticIconVisual({
                id: role.id,
                name: localized.name || role.displayName || role.name,
                description: localized.description || role.description,
                category: String(role.capabilities?.[0] || ""),
                fallback: Bot,
              });
              const RoleIcon = visual.Icon;
              return (
                <article
                  key={role.id}
                  className={`simple-agent-card${role.isActive ? "" : " disabled"}`}
                  style={
                    {
                      "--simple-agent-role-accent": role.color || "var(--simple-agent-blue)",
                    } as CSSProperties
                  }
                >
                  <div className={`simple-agent-card-visual is-${roleVisual.kind}`}>
                    <img
                      src={roleVisual.src}
                      alt=""
                      width={400}
                      height={500}
                      loading={roleIndex < 4 ? "eager" : "lazy"}
                      decoding="async"
                      aria-hidden="true"
                    />
                    <div className="simple-agent-card-head">
                      <span className="simple-agent-card-icon">
                        <RoleIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <div>
                        <h3 title={roleName}>{roleName}</h3>
                        <span className={role.isActive ? "available" : "unavailable"}>
                          <CheckCircle2 size={12} aria-hidden="true" />
                          {role.isActive
                            ? translate(
                                "generated.components.simpleagentbuilderpanel.808.54",
                                "Available",
                              )
                            : translate(
                                "generated.components.simpleagentbuilderpanel.808.55",
                                "Not enabled",
                              )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="simple-agent-card-content">
                    <p>
                      {localized.description ||
                        translate(
                          "generated.components.simpleagentbuilderpanel.812.56",
                          "Can perform professional tasks for the team.",
                        )}
                    </p>
                    <div
                      className="simple-agent-card-skills"
                      aria-label={translate(
                        "generated.components.simpleagentbuilderpanel.813.57",
                        "Related skills",
                      )}
                    >
                      <strong>
                        {translate(
                          "generated.components.simpleagentbuilderpanel.814.58",
                          "Related skills",
                        )}
                      </strong>
                      {linkedSkills.length ? (
                        <div>
                          {linkedSkills.slice(0, 2).map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                          {linkedSkills.length > 2 ? <em>+{linkedSkills.length - 2}</em> : null}
                        </div>
                      ) : (
                        <span>
                          {translate(
                            "generated.components.simpleagentbuilderpanel.823.59",
                            "Automatically match by task",
                          )}
                        </span>
                      )}
                    </div>
                    <div className="simple-agent-card-footer">
                      <div
                        className="simple-agent-card-capabilities"
                        aria-label={translate(
                          "generated.components.simpleagentbuilderpanel.827.60",
                          "Good at ability",
                        )}
                      >
                        {capabilities.map((capability) => (
                          <span key={capability}>{capability}</span>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!role.isActive}
                        onClick={() => onSelectRole(role)}
                      >
                        {role.isActive
                          ? translate(
                              "generated.components.simpleagentbuilderpanel.837.61",
                              "Schedule tasks",
                            )
                          : translate(
                              "generated.components.simpleagentbuilderpanel.837.62",
                              "Not available yet",
                            )}
                        <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="simple-agent-directory-empty">
            <Search size={20} aria-hidden="true" />
            <strong>
              {translate(
                "generated.components.simpleagentbuilderpanel.848.63",
                "No matching agent found",
              )}
            </strong>
            <span>
              {translate(
                "generated.components.simpleagentbuilderpanel.849.64",
                "You can change a keyword or job type.",
              )}
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
