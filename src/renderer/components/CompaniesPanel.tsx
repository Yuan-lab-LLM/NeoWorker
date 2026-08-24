import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ArrowRight,
  Building2,
  FolderGit2,
  GitBranch,
  Link2,
  Network,
  Plus,
  RefreshCw,
  Upload,
  Workflow,
  Wrench,
} from "lucide-react";
import type { AgentRoleData } from "../../electron/preload";
import type {
  Company,
  CompanyCommandCenterSummary,
  CompanyGraphEdge,
  CompanyGraphNode,
  CompanyImportPreview,
  CompanyPackageImportRequest,
  CompanyPackageSource,
  CompanySyncState,
  ResolvedCompanyGraph,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

interface CompaniesPanelProps {
  onOpenMissionControl?: (companyId: string) => void;
  onOpenDigitalTwins?: (companyId: string) => void;
}

type CompaniesMode = "library" | "org" | "ops";
type ImportTargetMode = "selected" | "new";

const COMPANY_TABS: Array<{ id: CompaniesMode; labelKey: string }> = [
  { id: "library", labelKey: "companies.tabs.library" },
];
const EMPTY_GRAPH_NODES: CompanyGraphNode[] = [];
const EMPTY_GRAPH_EDGES: CompanyGraphEdge[] = [];

interface CompanyDraft {
  name: string;
  slug: string;
  description: string;
}

function emptyDraft(): CompanyDraft {
  return {
    name: "",
    slug: "",
    description: "",
  };
}

function companyStatusBadgeClass(status: Company["status"]): string {
  switch (status) {
    case "active":
      return "settings-badge settings-badge--success";
    case "inactive":
      return "settings-badge settings-badge--warning";
    case "suspended":
      return "settings-badge settings-badge--warning";
    default:
      return "settings-badge settings-badge--neutral";
  }
}

function formatWhen(timestamp?: number): string {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleString();
}

function actionBadgeClass(action: string): string {
  if (action === "create") return "settings-badge settings-badge--success";
  if (action === "update" || action === "link")
    return "settings-badge settings-badge--warning";
  if (action === "conflict" || action === "warning")
    return "settings-badge settings-badge--warning";
  return "settings-badge settings-badge--neutral";
}

function syncBadgeClass(status: string): string {
  if (status === "in_sync") return "settings-badge settings-badge--success";
  if (status === "diverged" || status === "local_override")
    return "settings-badge settings-badge--warning";
  return "settings-badge settings-badge--neutral";
}

function nodeIcon(kind: string) {
  switch (kind) {
    case "company":
      return <Building2 size={14} />;
    case "team":
      return <Network size={14} />;
    case "agent":
      return <Workflow size={14} />;
    case "project":
      return <FolderGit2 size={14} />;
    case "task":
      return <Wrench size={14} />;
    case "skill":
      return <GitBranch size={14} />;
    default:
      return <Building2 size={14} />;
  }
}

function sortNodes(nodes: CompanyGraphNode[]): CompanyGraphNode[] {
  const weight = (kind: CompanyGraphNode["kind"]) => {
    switch (kind) {
      case "company":
        return 0;
      case "team":
        return 1;
      case "agent":
        return 2;
      case "project":
        return 3;
      case "task":
        return 4;
      case "skill":
        return 5;
      default:
        return 99;
    }
  };
  return [...nodes].sort(
    (left, right) =>
      weight(left.kind) - weight(right.kind) ||
      left.name.localeCompare(right.name),
  );
}

function buildTree(nodes: CompanyGraphNode[]) {
  const children = new Map<string, CompanyGraphNode[]>();
  const roots: CompanyGraphNode[] = [];

  for (const node of sortNodes(nodes)) {
    if (!node.parentNodeId) {
      roots.push(node);
      continue;
    }
    const bucket = children.get(node.parentNodeId) || [];
    bucket.push(node);
    children.set(node.parentNodeId, bucket);
  }

  return { roots, children };
}

function buildAgentHierarchy(
  nodes: CompanyGraphNode[],
  edges: CompanyGraphEdge[],
) {
  const agents = nodes.filter((node) => node.kind === "agent");
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const children = new Map<string, CompanyGraphNode[]>();
  const hasManager = new Set<string>();

  for (const edge of edges) {
    if (edge.kind !== "reports_to") continue;
    const child = byId.get(edge.fromNodeId);
    const manager = byId.get(edge.toNodeId);
    if (!child || !manager) continue;
    hasManager.add(child.id);
    const bucket = children.get(manager.id) || [];
    bucket.push(child);
    children.set(manager.id, bucket);
  }

  const roots = agents.filter((agent) => !hasManager.has(agent.id));
  return {
    roots,
    children,
  };
}

function summarizeRuntimeCounts(
  nodes: CompanyGraphNode[],
  states: CompanySyncState[],
) {
  let desiredAgents = 0;
  let desiredProjects = 0;
  let linkedOperators = 0;
  let seededIssues = 0;

  for (const node of nodes) {
    if (node.kind === "agent") desiredAgents += 1;
    if (node.kind === "project") desiredProjects += 1;
  }

  for (const state of states) {
    if (state.runtimeEntityKind === "agent_role") linkedOperators += 1;
    if (state.runtimeEntityKind === "issue") seededIssues += 1;
  }

  return {
    desiredAgents,
    desiredProjects,
    linkedOperators,
    seededIssues,
  };
}

function renderAgentChartNode(
  node: CompanyGraphNode,
  children: Map<string, CompanyGraphNode[]>,
  selectedNodeId: string | null,
  setSelectedNodeId: (value: string) => void,
) {
  const directReports = children.get(node.id) || [];
  return (
    <div key={node.id} className="co-org-branch">
      <button
        type="button"
        className={`co-org-card ${selectedNodeId === node.id ? "is-selected" : ""}`}
        onClick={() => setSelectedNodeId(node.id)}
      >
        <span className="co-org-card-kind">{node.kind}</span>
        <strong>{node.name}</strong>
        {node.description && <span>{node.description}</span>}
      </button>
      {directReports.length > 0 && (
        <div className="co-org-branch-children">
          {directReports.map((child) =>
            renderAgentChartNode(
              child,
              children,
              selectedNodeId,
              setSelectedNodeId,
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function CompaniesPanel({
  onOpenMissionControl,
  onOpenDigitalTwins,
}: CompaniesPanelProps) {
  useLanguage();
  const t = translate;
  const [companies, setCompanies] = useState<Company[]>([]);
  const [roles, setRoles] = useState<AgentRoleData[]>([]);
  const [sources, setSources] = useState<CompanyPackageSource[]>([]);
  const [graph, setGraph] = useState<ResolvedCompanyGraph | null>(null);
  const [syncStates, setSyncStates] = useState<CompanySyncState[]>([]);
  const [summary, setSummary] = useState<CompanyCommandCenterSummary | null>(
    null,
  );
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    null,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [mode, setMode] = useState<CompaniesMode>("library");
  const [companyDraft, setCompanyDraft] = useState<CompanyDraft>(emptyDraft());
  const [preview, setPreview] = useState<CompanyImportPreview | null>(null);
  const [previewRequest, setPreviewRequest] =
    useState<CompanyPackageImportRequest | null>(null);
  const [importTargetMode, setImportTargetMode] =
    useState<ImportTargetMode>("selected");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null);
  const [pendingRoleLinks, setPendingRoleLinks] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isModePending, startModeTransition] = useTransition();

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );
  const graphNodes = graph?.nodes ?? EMPTY_GRAPH_NODES;
  const graphEdges = graph?.edges ?? EMPTY_GRAPH_EDGES;
  const graphNodeById = useMemo(
    () => new Map(graphNodes.map((node) => [node.id, node])),
    [graphNodes],
  );
  const syncByOrgNode = useMemo(
    () =>
      new Map(
        syncStates
          .filter((state) => state.orgNodeId)
          .map((state) => [state.orgNodeId as string, state]),
      ),
    [syncStates],
  );
  const selectedNode = useMemo(
    () => graphNodes.find((node) => node.id === selectedNodeId) ?? null,
    [graphNodes, selectedNodeId],
  );
  const relatedEdges = useMemo(
    () =>
      selectedNode
        ? graphEdges.filter(
            (edge) =>
              edge.fromNodeId === selectedNode.id ||
              edge.toNodeId === selectedNode.id,
          )
        : [],
    [graphEdges, selectedNode],
  );
  const tree = useMemo(() => buildTree(graphNodes), [graphNodes]);
  const agentHierarchy = useMemo(
    () => buildAgentHierarchy(graphNodes, graphEdges),
    [graphNodes, graphEdges],
  );
  const projects = useMemo(
    () => graphNodes.filter((node) => node.kind === "project"),
    [graphNodes],
  );
  const tasks = useMemo(
    () => graphNodes.filter((node) => node.kind === "task"),
    [graphNodes],
  );
  const linkedRoleIds = useMemo(
    () =>
      new Set(
        syncStates
          .filter((state) => state.runtimeEntityKind === "agent_role")
          .map((state) => state.runtimeEntityId),
      ),
    [syncStates],
  );
  const selectedCompanyRoles = useMemo(
    () =>
      selectedCompanyId
        ? roles.filter((role) => role.companyId === selectedCompanyId)
        : [],
    [roles, selectedCompanyId],
  );
  const runtimeCounts = useMemo(
    () => summarizeRuntimeCounts(graphNodes, syncStates),
    [graphNodes, syncStates],
  );

  const loadCompanies = useCallback(
    async (preferredCompanyId?: string | null) => {
      const loaded = await window.electronAPI.listCompanies();
      setCompanies(loaded);
      setSelectedCompanyId((current) => {
        const next = preferredCompanyId ?? current;
        if (next && loaded.some((company) => company.id === next)) return next;
        return loaded[0]?.id || null;
      });
      return loaded;
    },
    [],
  );

  const loadRoles = useCallback(async () => {
    const loaded = await window.electronAPI.getAgentRoles(true);
    setRoles(loaded);
    return loaded;
  }, []);

  const loadCompanyData = useCallback(
    async (companyId: string | null, includeOps = false) => {
      if (!companyId) {
        setSources([]);
        setGraph(null);
        setSyncStates([]);
        setSummary(null);
        return;
      }

      const [loadedSources, loadedGraph, loadedSyncStates, loadedSummary] =
        await Promise.all([
          window.electronAPI.listCompanyPackageSources(companyId),
          window.electronAPI.getCompanyGraph(companyId).catch(() => null),
          window.electronAPI.listCompanySyncStates(companyId).catch(() => []),
          includeOps
            ? window.electronAPI
                .getCommandCenterSummary(companyId)
                .catch(() => null)
            : Promise.resolve(null),
        ]);

      setSources(loadedSources);
      setGraph(loadedGraph);
      setSyncStates(loadedSyncStates);
      setSummary(loadedSummary);
    },
    [],
  );

  const refreshAll = useCallback(
    async (preferredCompanyId?: string | null) => {
      setRefreshing(true);
      setError(null);
      try {
        const [loadedCompanies] = await Promise.all([
          loadCompanies(preferredCompanyId),
          loadRoles(),
        ]);
        const resolvedCompanyId =
          preferredCompanyId &&
          loadedCompanies.some((company) => company.id === preferredCompanyId)
            ? preferredCompanyId
            : loadedCompanies[0]?.id || null;
        await loadCompanyData(resolvedCompanyId, mode === "ops");
      } catch (err) {
        console.error("Failed to refresh companies panel:", err);
        setError(t("companies.error.refresh", "Failed to refresh company"));
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [loadCompanies, loadRoles, loadCompanyData, mode],
  );

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    void loadCompanyData(selectedCompanyId, mode === "ops");
  }, [selectedCompanyId, mode, loadCompanyData]);

  useEffect(() => {
    if (!graphNodes.length) {
      setSelectedNodeId(null);
      return;
    }
    if (
      selectedNodeId &&
      graphNodes.some((node) => node.id === selectedNodeId)
    ) {
      return;
    }
    const companyNode = graphNodes.find((node) => node.kind === "company");
    setSelectedNodeId(companyNode?.id || graphNodes[0]?.id || null);
  }, [graphNodes, selectedNodeId]);

  const handleCreateCompany = async () => {
    if (!companyDraft.name.trim()) {
      setError(t("companies.error.nameRequired", "Company name is required"));
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await window.electronAPI.createCompany({
        name: companyDraft.name.trim(),
        slug: companyDraft.slug.trim() || undefined,
        description: companyDraft.description.trim() || undefined,
      });
      setCompanyDraft(emptyDraft());
      setSuccess(t("companies.success.created", "Company has been created"));
      await refreshAll(created.id);
    } catch (err) {
      console.error("Failed to create company:", err);
      setError(t("companies.error.create", "Failed to create company"));
    } finally {
      setCreating(false);
    }
  };

  const handlePreviewImport = async () => {
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return;

    if (importTargetMode === "selected" && !selectedCompanyId) {
      setError(
        t(
          "companies.error.selectCompany",
          "Please select a company, or switch to create a new company",
        ),
      );
      return;
    }

    const request: CompanyPackageImportRequest = {
      companyId: importTargetMode === "selected" ? selectedCompanyId : null,
      source: {
        sourceKind: "local",
        rootUri: folderPath,
        localPath: folderPath,
      },
    };

    setError(null);
    try {
      const nextPreview =
        await window.electronAPI.previewCompanyPackageImport(request);
      setPreview(nextPreview);
      setPreviewRequest(request);
      setSuccess(
        t("companies.success.previewReady", "Package preview is ready"),
      );
    } catch (err) {
      console.error("Failed to preview package import:", err);
      setError(
        err instanceof Error ? err.message : "Failed to preview package import",
      );
    }
  };

  const handleImportPackage = async () => {
    if (!previewRequest) return;
    setImporting(true);
    setError(null);
    try {
      const result =
        await window.electronAPI.importCompanyPackage(previewRequest);
      setPreview(null);
      setPreviewRequest(null);
      setSuccess(
        t(
          "companies.success.imported",
          "{count} organization nodes imported to {company}",
          {
            count: result.graph.nodes.length,
            company: result.company.name,
          },
        ),
      );
      // Organization structure and operational status belong to the Agents Hub
      // and Task Hub. Keep this low-frequency admin surface on its import view.
      setMode("library");
      await refreshAll(result.company.id);
    } catch (err) {
      console.error("Failed to import company package:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("companies.error.import", "Import package failed"),
      );
    } finally {
      setImporting(false);
    }
  };

  const handleLinkRole = async (nodeId: string) => {
    if (!selectedCompanyId) return;
    const roleId = pendingRoleLinks[nodeId] || null;
    setLinkingNodeId(nodeId);
    setError(null);
    try {
      await window.electronAPI.linkCompanyOrgNodeToRole({
        companyId: selectedCompanyId,
        orgNodeId: nodeId,
        agentRoleId: roleId,
      });
      setSuccess(
        roleId
          ? t(
              "companies.success.linkedOperator",
              "Agent node associated to operator",
            )
          : t(
              "companies.success.clearedOperator",
              "Operator association cleared",
            ),
      );
      await loadCompanyData(selectedCompanyId, mode === "ops");
    } catch (err) {
      console.error("Failed to link org node to role:", err);
      setError(
        t(
          "companies.error.linkOperator",
          "Failed to associate organization node to role",
        ),
      );
    } finally {
      setLinkingNodeId(null);
    }
  };

  const activeCompanySummary = summary?.overview;
  const selectedNodeSync = selectedNode
    ? syncByOrgNode.get(selectedNode.id)
    : undefined;
  const selectedLinkedRole =
    selectedNodeSync?.runtimeEntityKind === "agent_role"
      ? roles.find((role) => role.id === selectedNodeSync.runtimeEntityId)
      : null;
  const linkableRoles = useMemo(
    () =>
      roles.filter(
        (role) =>
          !linkedRoleIds.has(role.id) || role.id === selectedLinkedRole?.id,
      ),
    [linkedRoleIds, roles, selectedLinkedRole?.id],
  );

  if (loading) {
    return (
      <div className="settings-empty">
        {t("companies.loading", "Loading companies...")}
      </div>
    );
  }

  return (
    <div
      className={`companies-v2 settings-page ${isModePending ? "is-mode-pending" : ""}`}
    >
      <section className="co-v2-header">
        <div>
          <h2>{t("companies.title", "company")}</h2>
          <p className="settings-description">
            {translate(
              "generated.components.companiespanel.504.0",
              "Manage company information and import packages; please view team collaboration and work progress in the corresponding main menu.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="provider-test-button"
          onClick={() => void refreshAll(selectedCompanyId)}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          {t("common.refresh", "Refresh")}
        </button>
      </section>

      {error && (
        <div className="settings-alert settings-alert-error">{error}</div>
      )}
      {success && <div className="settings-save-indicator">{success}</div>}

      <div className="co-v2-layout">
        <aside className="co-v2-sidebar">
          <div className="co-v3-company-rail">
            <div className="co-v3-rail-heading">
              <span>{t("companies.title", "company")}</span>
              <span>{companies.length}</span>
            </div>
            <div className="co-v2-company-list">
              {companies.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  className={`co-v2-company-item ${company.id === selectedCompanyId ? "is-selected" : ""}`}
                  onClick={() => setSelectedCompanyId(company.id)}
                >
                  <div className="co-v2-company-item-row">
                    <strong>{company.name}</strong>
                    <span className={companyStatusBadgeClass(company.status)}>
                      {company.status}
                    </span>
                  </div>
                  <div className="co-v2-company-item-meta">
                    {company.slug && <span>{company.slug}</span>}
                    {company.isDefault && (
                      <span className="settings-badge settings-badge--outline">
                        {t("common.default", "Default")}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {companies.length === 0 && (
                <div className="settings-empty" style={{ fontSize: 13 }}>
                  {t(
                    "companies.empty",
                    "There is no company yet. Create a company, or import a package.",
                  )}
                </div>
              )}
            </div>
            <div className="co-v3-rail-note">
              <Building2 size={15} />
              <span>
                {translate(
                  "generated.components.companiespanel.558.1",
                  "Select a company, manage profiles or import team packages.",
                )}
              </span>
            </div>
          </div>
        </aside>

        <main className="co-v2-main">
          <section className="co-v3-company-overview">
            <div className="co-v3-company-identity">
              <span className="co-v3-company-icon">
                <Building2 size={21} />
              </span>
              <div>
                <div className="co-v3-company-title-row">
                  <h3>
                    {selectedCompany?.name ||
                      t("companies.empty", "No company yet")}
                  </h3>
                  {selectedCompany && (
                    <span
                      className={companyStatusBadgeClass(
                        selectedCompany.status,
                      )}
                    >
                      {selectedCompany.status === "active"
                        ? translate(
                            "generated.components.companiespanel.572.2",
                            "in use",
                          )
                        : selectedCompany.status}
                    </span>
                  )}
                </div>
                <p>
                  {selectedCompany?.description ||
                    translate(
                      "generated.components.companiespanel.578.3",
                      "Create a company identity for your team, or import an existing team package.",
                    )}
                </p>
              </div>
            </div>
            <div
              className="co-v3-company-facts"
              aria-label={translate(
                "generated.components.companiespanel.582.4",
                "Company Overview",
              )}
            >
              <div>
                <span>
                  {t("companies.metric.packageSources", "Package source")}
                </span>
                <strong>{sources.length}</strong>
              </div>
              <div>
                <span>
                  {translate(
                    "generated.components.companiespanel.584.5",
                    "Company created",
                  )}
                </span>
                <strong>{companies.length}</strong>
              </div>
            </div>
          </section>

          {mode === "library" && (
            <div className="co-v3-library-grid">
              <section className="co-v3-work-panel">
                <div className="co-v3-panel-heading">
                  <span className="co-v3-panel-index">01</span>
                  <div>
                    <h3>{t("companies.newCompany", "New company")}</h3>
                    <p>
                      {translate(
                        "generated.components.companiespanel.595.6",
                        "Start with a clean identity profile and establish separate workspaces for your team.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="co-v3-form">
                  <label className="co-v2-field">
                    <span>{t("companies.field.name", "Name")}</span>
                    <input
                      type="text"
                      value={companyDraft.name}
                      onChange={(event) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder={translate(
                        "generated.components.companiespanel.601.7",
                        "For example: Beichen Creative",
                      )}
                    />
                  </label>
                  <label className="co-v2-field">
                    <span>{t("companies.field.slug", "logo")}</span>
                    <input
                      type="text"
                      value={companyDraft.slug}
                      onChange={(event) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          slug: event.target.value,
                        }))
                      }
                      placeholder="beichen-studio"
                    />
                  </label>
                  <label className="co-v2-field">
                    <span>
                      {t(
                        "companies.field.description",
                        "Description (optional)",
                      )}
                    </span>
                    <textarea
                      rows={3}
                      value={companyDraft.description}
                      onChange={(event) =>
                        setCompanyDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder={t(
                        "companies.placeholder.description",
                        "One sentence describing what the team is doing",
                      )}
                    />
                  </label>
                  <button
                    type="button"
                    className="provider-save-button co-v3-primary-action"
                    onClick={() => void handleCreateCompany()}
                    disabled={creating}
                  >
                    <Plus size={15} />
                    {creating
                      ? translate(
                          "generated.components.companiespanel.613.8",
                          "Creating…",
                        )
                      : t("companies.createCompany", "Create a company")}
                  </button>
                </div>
              </section>

              <section className="co-v3-work-panel co-v3-import-panel">
                <div className="co-v3-panel-heading">
                  <span className="co-v3-panel-index">02</span>
                  <div>
                    <h3>
                      {t(
                        "companies.library.previewImport",
                        "Import company package",
                      )}
                    </h3>
                    <p>
                      {translate(
                        "generated.components.companiespanel.623.9",
                        "Bring existing organizational structures, roles and work conventions into NeoWorker.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="co-v3-target-control">
                  <span>
                    {translate(
                      "generated.components.companiespanel.627.10",
                      "Import method",
                    )}
                  </span>
                  <div className="co-v3-segmented-control">
                    <button
                      type="button"
                      className={
                        importTargetMode === "selected" ? "is-selected" : ""
                      }
                      onClick={() => setImportTargetMode("selected")}
                      disabled={!selectedCompanyId}
                    >
                      {translate(
                        "generated.components.companiespanel.630.11",
                        "Import to current company",
                      )}
                    </button>
                    <button
                      type="button"
                      className={
                        importTargetMode === "new" ? "is-selected" : ""
                      }
                      onClick={() => setImportTargetMode("new")}
                    >
                      {translate(
                        "generated.components.companiespanel.633.12",
                        "Import as new company",
                      )}
                    </button>
                  </div>
                </div>
                {!preview ? (
                  <button
                    type="button"
                    className="co-v3-dropzone"
                    onClick={() => void handlePreviewImport()}
                  >
                    <span className="co-v3-dropzone-icon">
                      <Upload size={20} />
                    </span>
                    <strong>
                      {translate(
                        "generated.components.companiespanel.640.13",
                        "Select the local company package folder",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.companiespanel.641.14",
                        "Preview the imported content first, and the current company will not be changed immediately.",
                      )}
                    </span>
                    <span className="co-v3-choose-file">
                      {translate(
                        "generated.components.companiespanel.642.15",
                        "Select folder",
                      )}
                    </span>
                  </button>
                ) : (
                  <div className="co-v3-import-preview">
                    <div className="co-v3-preview-topline">
                      <div>
                        <span>
                          {translate(
                            "generated.components.companiespanel.648.16",
                            "Preview is ready",
                          )}
                        </span>
                        <strong>{preview.graph.packageName}</strong>
                      </div>
                      <button
                        type="button"
                        className="provider-save-button co-v3-primary-action"
                        onClick={() => void handleImportPackage()}
                        disabled={importing}
                      >
                        <Upload size={15} />
                        {importing
                          ? translate(
                              "generated.components.companiespanel.653.17",
                              "Importing…",
                            )
                          : t(
                              "companies.preview.importPackage",
                              "Confirm import",
                            )}
                      </button>
                    </div>
                    <div className="co-v3-preview-facts">
                      <span>
                        {preview.graph.manifests.length}{" "}
                        {translate(
                          "generated.components.companiespanel.657.18",
                          "list",
                        )}
                      </span>
                      <span>
                        {preview.graph.nodes.length}{" "}
                        {translate(
                          "generated.components.companiespanel.657.19",
                          "nodes",
                        )}
                      </span>
                      <span>
                        {preview.graph.edges.length}{" "}
                        {translate(
                          "generated.components.companiespanel.657.20",
                          "relationship",
                        )}
                      </span>
                    </div>
                    {preview.warnings.length > 0 && (
                      <div className="settings-alert settings-alert-error">
                        {preview.warnings.join(" ")}
                      </div>
                    )}
                    <button
                      type="button"
                      className="co-v3-reset-preview"
                      onClick={() => {
                        setPreview(null);
                        setPreviewRequest(null);
                      }}
                    >
                      {translate(
                        "generated.components.companiespanel.660.21",
                        "Reselect folder",
                      )}
                    </button>
                  </div>
                )}
                {sources.length > 0 && (
                  <div className="co-v3-source-summary">
                    <span>
                      {translate(
                        "generated.components.companiespanel.665.22",
                        "Source imported",
                      )}
                    </span>
                    <strong>{sources[0]?.name}</strong>
                    <small>
                      {sources.length > 1
                        ? translate(
                            "companies.additionalSources",
                            "{count} more sources",
                            { count: sources.length - 1 },
                          )
                        : sources[0]?.rootUri}
                    </small>
                  </div>
                )}
              </section>
            </div>
          )}

          {mode === "org" && (
            <div className="co-v2-panel-grid co-v2-panel-grid--org">
              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <div>
                    <h3>{t("companies.org.structure", "structure")}</h3>
                    <p className="co-v2-subtle">
                      {t(
                        "companies.org.structureDescription",
                        "Desired state company diagram generated from imported package.",
                      )}
                    </p>
                  </div>
                </div>
                {graphNodes.length === 0 ? (
                  <div className="settings-empty">
                    {t(
                      "companies.org.noGraph",
                      "There is no desired state diagram yet. Please first populate the organization builder by importing packages from the Package Library tab.",
                    )}
                  </div>
                ) : (
                  <div className="co-v2-tree">
                    {tree.roots.map((node) => (
                      <OrgTreeNode
                        key={node.id}
                        node={node}
                        childrenMap={tree.children}
                        selectedNodeId={selectedNodeId}
                        setSelectedNodeId={setSelectedNodeId}
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <div>
                    <h3>{t("companies.org.chart", "organizational chart")}</h3>
                    <p className="co-v2-subtle">
                      {t(
                        "companies.org.chartDescription",
                        "Import the reporting relationship of the agent role.",
                      )}
                    </p>
                  </div>
                  {selectedCompany && (
                    <button
                      type="button"
                      className="provider-test-button"
                      onClick={() => onOpenMissionControl?.(selectedCompany.id)}
                    >
                      {t("companies.org.openOps", "Open operations")}{" "}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                {agentHierarchy.roots.length === 0 ? (
                  <div className="settings-empty">
                    {t(
                      "companies.org.noHierarchy",
                      "There is no agent hierarchy in the imported graph yet.",
                    )}
                  </div>
                ) : (
                  <div className="co-v2-org-chart">
                    {agentHierarchy.roots.map((root) =>
                      renderAgentChartNode(
                        root,
                        agentHierarchy.children,
                        selectedNodeId,
                        setSelectedNodeId,
                      ),
                    )}
                  </div>
                )}

                {(projects.length > 0 || tasks.length > 0) && (
                  <div className="co-v2-runtime-lanes">
                    {projects.length > 0 && (
                      <div>
                        <h4>{t("companies.org.projects", "Project")}</h4>
                        <div className="co-v2-chip-row">
                          {projects.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              className={`co-v2-chip ${selectedNodeId === project.id ? "is-selected" : ""}`}
                              onClick={() => setSelectedNodeId(project.id)}
                            >
                              {project.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {tasks.length > 0 && (
                      <div>
                        <h4>{t("companies.org.starterTasks", "Start task")}</h4>
                        <div className="co-v2-chip-row">
                          {tasks.map((task) => (
                            <button
                              key={task.id}
                              type="button"
                              className={`co-v2-chip ${selectedNodeId === task.id ? "is-selected" : ""}`}
                              onClick={() => setSelectedNodeId(task.id)}
                            >
                              {task.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <div>
                    <h3>{t("companies.node.title", "Node details")}</h3>
                    <p className="co-v2-subtle">
                      {t(
                        "companies.node.description",
                        "Expected state, origin, and runtime associations.",
                      )}
                    </p>
                  </div>
                  {selectedCompany && (
                    <button
                      type="button"
                      className="provider-test-button"
                      onClick={() => onOpenDigitalTwins?.(selectedCompany.id)}
                    >
                      {t(
                        "companies.node.agentPersonas",
                        "Intelligent body portrait",
                      )}{" "}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
                {!selectedNode ? (
                  <div className="settings-empty">
                    {t(
                      "companies.node.empty",
                      "Select a node to view the desired state and runtime associations.",
                    )}
                  </div>
                ) : (
                  <div className="co-v2-detail">
                    <div className="co-v2-detail-title">
                      <div className="co-v2-detail-kind">
                        {nodeIcon(selectedNode.kind)}
                        <span>{selectedNode.kind}</span>
                      </div>
                      <h3>{selectedNode.name}</h3>
                    </div>

                    <div className="co-v2-detail-grid">
                      <div>
                        <span className="co-v2-subtle">
                          {t("companies.field.slug", "logo")}
                        </span>
                        <strong>{selectedNode.slug}</strong>
                      </div>
                      <div>
                        <span className="co-v2-subtle">
                          {t("companies.node.path", "path")}
                        </span>
                        <strong>
                          {selectedNode.relativePath ||
                            t("common.notAvailable", "None")}
                        </strong>
                      </div>
                      <div>
                        <span className="co-v2-subtle">
                          {t(
                            "companies.node.runtimeSync",
                            "Runtime synchronization",
                          )}
                        </span>
                        <span
                          className={
                            selectedNodeSync
                              ? syncBadgeClass(selectedNodeSync.syncStatus)
                              : "settings-badge settings-badge--neutral"
                          }
                        >
                          {selectedNodeSync?.syncStatus || "unlinked"}
                        </span>
                      </div>
                    </div>

                    {selectedNode.description && (
                      <p>{selectedNode.description}</p>
                    )}

                    <div className="co-v2-detail-section">
                      <h4>
                        {t("companies.node.relationships", "relationship")}
                      </h4>
                      {relatedEdges.length === 0 ? (
                        <div className="co-v2-subtle">
                          {t(
                            "companies.node.noRelationships",
                            "This node has no recorded graph relationships yet.",
                          )}
                        </div>
                      ) : (
                        <div className="co-v2-rel-list">
                          {relatedEdges.map((edge) => {
                            const target =
                              graphNodeById.get(
                                edge.fromNodeId === selectedNode.id
                                  ? edge.toNodeId
                                  : edge.fromNodeId,
                              ) || null;
                            return (
                              <div key={edge.id} className="co-v2-rel-item">
                                <span className="settings-badge settings-badge--outline">
                                  {edge.kind}
                                </span>
                                <span>
                                  {target?.name ||
                                    t("companies.node.unknown", "unknown node")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedNode.kind === "agent" && (
                      <div className="co-v2-detail-section">
                        <h4>
                          {t(
                            "companies.node.linkedOperator",
                            "Runtime operator associated",
                          )}
                        </h4>
                        <div className="co-v2-linker">
                          <select
                            value={
                              pendingRoleLinks[selectedNode.id] ??
                              selectedLinkedRole?.id ??
                              ""
                            }
                            onChange={(event) =>
                              setPendingRoleLinks((current) => ({
                                ...current,
                                [selectedNode.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">
                              {t(
                                "companies.node.noLinkedOperator",
                                "No associated operator",
                              )}
                            </option>
                            {linkableRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.displayName || role.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="provider-save-button"
                            disabled={linkingNodeId === selectedNode.id}
                            onClick={() => void handleLinkRole(selectedNode.id)}
                          >
                            <Link2 size={14} />
                            {t("companies.node.saveLink", "Save association")}
                          </button>
                        </div>
                        {selectedLinkedRole && (
                          <div className="co-v2-subtle">
                            {t(
                              "companies.node.linkedTo",
                              "Linked to {operator} · Company-Wide Operator",
                              {
                                operator:
                                  selectedLinkedRole.displayName ||
                                  selectedLinkedRole.name,
                              },
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {mode === "ops" && (
            <div className="co-v2-panel-grid">
              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <div>
                    <h3>
                      {t("companies.ops.runtimeOverview", "Runtime overview")}
                    </h3>
                    <p className="co-v2-subtle">
                      {t(
                        "companies.ops.runtimeDescription",
                        "Actual company operations in NeoWorker runtime.",
                      )}
                    </p>
                  </div>
                  {selectedCompany && (
                    <button
                      type="button"
                      className="provider-test-button"
                      onClick={() => onOpenMissionControl?.(selectedCompany.id)}
                    >
                      {t(
                        "companies.ops.fullMissionControl",
                        "Full task console",
                      )}{" "}
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>

                {!selectedCompany ? (
                  <div className="settings-empty">
                    {t(
                      "companies.ops.selectCompany",
                      "Select a company to view runtime operations.",
                    )}
                  </div>
                ) : !activeCompanySummary ? (
                  <div className="settings-empty">
                    {t(
                      "companies.ops.loading",
                      "Loading runtime operations...",
                    )}
                  </div>
                ) : (
                  <div className="co-v2-ops-overview">
                    <div className="co-v2-summary-card">
                      <span>
                        {t("companies.ops.activeGoals", "active target")}
                      </span>
                      <strong>{activeCompanySummary.activeGoalCount}</strong>
                    </div>
                    <div className="co-v2-summary-card">
                      <span>
                        {t("companies.ops.activeProjects", "Active projects")}
                      </span>
                      <strong>{activeCompanySummary.activeProjectCount}</strong>
                    </div>
                    <div className="co-v2-summary-card">
                      <span>
                        {t("companies.ops.openIssues", "open question")}
                      </span>
                      <strong>{activeCompanySummary.openIssueCount}</strong>
                    </div>
                    <div className="co-v2-summary-card">
                      <span>
                        {t("companies.ops.pendingReview", "Pending review")}
                      </span>
                      <strong>{activeCompanySummary.pendingReviewCount}</strong>
                    </div>
                    <div className="co-v2-summary-card">
                      <span>
                        {t("companies.ops.valuableOutputs", "valuable output")}
                      </span>
                      <strong>
                        {activeCompanySummary.valuableOutputCount}
                      </strong>
                    </div>
                  </div>
                )}
              </section>

              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <h3>
                    {t(
                      "companies.ops.desiredVsActual",
                      "Expectations and reality",
                    )}
                  </h3>
                </div>
                <div className="co-v2-runtime-comparison">
                  <div className="co-v2-summary-card">
                    <span>
                      {t("companies.ops.desiredAgents", "expectant agent")}
                    </span>
                    <strong>{runtimeCounts.desiredAgents}</strong>
                  </div>
                  <div className="co-v2-summary-card">
                    <span>
                      {t("companies.ops.linkedOperators", "Operator linked")}
                    </span>
                    <strong>{runtimeCounts.linkedOperators}</strong>
                  </div>
                  <div className="co-v2-summary-card">
                    <span>
                      {t("companies.ops.desiredProjects", "Expected items")}
                    </span>
                    <strong>{runtimeCounts.desiredProjects}</strong>
                  </div>
                  <div className="co-v2-summary-card">
                    <span>
                      {t("companies.ops.seededIssues", "Seeded runtime issues")}
                    </span>
                    <strong>{runtimeCounts.seededIssues}</strong>
                  </div>
                </div>
              </section>

              <section className="co-v2-card">
                <div className="co-v2-card-header">
                  <h3>
                    {t("companies.ops.outputsReview", "Output and review")}
                  </h3>
                </div>
                {!summary ? (
                  <div className="settings-empty">
                    {t(
                      "companies.ops.noSummary",
                      "The runtime summary has not been loaded yet.",
                    )}
                  </div>
                ) : (
                  <div className="co-v2-output-columns">
                    <div>
                      <h4>
                        {t("companies.ops.recentOutputs", "recent output")}
                      </h4>
                      <div className="co-v2-list">
                        {summary.outputs.slice(0, 6).map((output) => (
                          <div key={output.id} className="co-v2-list-row">
                            <div>
                              <strong>{output.title}</strong>
                              <div className="co-v2-subtle">
                                {output.outputType} · {output.valueReason}
                              </div>
                            </div>
                            <span className="settings-badge settings-badge--outline">
                              {output.reviewRequired
                                ? t("companies.ops.review", "Review")
                                : output.status || output.outputType}
                            </span>
                          </div>
                        ))}
                        {summary.outputs.length === 0 && (
                          <div className="settings-empty">
                            {t("companies.ops.noOutputs", "No output yet.")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <h4>{t("companies.ops.reviewQueue", "Review queue")}</h4>
                      <div className="co-v2-list">
                        {summary.reviewQueue.slice(0, 6).map((item) => (
                          <div key={item.id} className="co-v2-list-row">
                            <div>
                              <strong>{item.title}</strong>
                              <div className="co-v2-subtle">
                                {item.reviewReason}
                              </div>
                            </div>
                            <span className="settings-badge settings-badge--warning">
                              {formatWhen(item.createdAt)}
                            </span>
                          </div>
                        ))}
                        {summary.reviewQueue.length === 0 && (
                          <div className="settings-empty">
                            {t(
                              "companies.ops.noQueuedReviews",
                              "There is currently no queue for review.",
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .companies-v2 {
          --co-v2-card-bg: var(--color-bg-glass);
          --co-v2-card-bg-strong: var(--color-bg-secondary);
          --co-v2-item-bg: var(--color-bg-secondary);
          --co-v2-item-bg-hover: var(--color-bg-hover);
          --co-v2-input-bg: var(--color-bg-input);
          --co-v2-selected-bg: var(--color-accent-subtle);
          --co-v2-shadow: var(--shadow-sm);
          color: var(--color-text-primary);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .companies-v2.settings-page {
          background: transparent;
          height: auto;
          padding-top: 0;
        }
        .theme-light .companies-v2 {
          --co-v2-card-bg: var(--color-bg-glass);
          --co-v2-card-bg-strong: var(--color-bg-glass);
          --co-v2-item-bg: var(--color-bg-glass);
          --co-v2-input-bg: var(--color-bg-input);
        }
        .companies-v2 h2,
        .companies-v2 h3,
        .companies-v2 h4,
        .companies-v2 p {
          margin: 0;
        }
        .companies-v2 svg {
          flex-shrink: 0;
        }
        .companies-v2 .provider-save-button,
        .companies-v2 .provider-test-button {
          align-items: center;
          display: inline-flex;
          gap: 8px;
          justify-content: center;
          white-space: nowrap;
        }
        .co-v2-header,
        .co-v2-topbar,
        .co-v2-card-header,
        .co-v2-company-item-row,
        .co-v2-company-item-meta,
        .co-v2-source-item,
        .co-v2-preview-item,
        .co-v2-list-row,
        .co-v2-rel-item,
        .co-v2-linker,
        .co-v2-detail-title,
        .co-v2-detail-kind,
        .co-v2-company-list {
          display: flex;
        }
        .co-v2-header,
        .co-v2-topbar,
        .co-v2-card-header,
        .co-v2-source-item,
        .co-v2-preview-item,
        .co-v2-list-row,
        .co-v2-linker {
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .co-v2-header,
        .co-v2-card-header {
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .co-v2-header > div,
        .co-v2-card-header > div {
          min-width: 0;
        }
        .co-v2-layout {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
          min-height: 0;
        }
        .co-v2-sidebar,
        .co-v2-main,
        .co-v2-panel-grid,
        .co-v2-card,
        .co-v2-preview,
        .co-v2-detail,
        .co-v2-source-list,
        .co-v2-preview-items,
        .co-v2-list,
        .co-v2-tree,
        .co-v2-form,
        .co-v2-runtime-lanes,
        .co-v2-output-columns {
          display: flex;
          flex-direction: column;
        }
        .co-v2-sidebar,
        .co-v2-main,
        .co-v2-panel-grid,
        .co-v2-card,
        .co-v2-source-list,
        .co-v2-preview-items,
        .co-v2-list,
        .co-v2-tree,
        .co-v2-form,
        .co-v2-runtime-lanes {
          gap: 12px;
        }
        .co-v2-main {
          gap: 16px;
          min-width: 0;
          transition: opacity 140ms ease;
        }
        .companies-v2.is-mode-pending .co-v2-main {
          opacity: 0.86;
        }
        .co-v2-card {
          padding: 16px;
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-md);
          background: var(--co-v2-card-bg);
          box-shadow: var(--co-v2-shadow);
          min-width: 0;
          overflow: hidden;
        }
        .co-v2-panel-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }
        .co-v2-panel-grid--org {
          grid-template-columns: 280px minmax(0, 1.4fr) minmax(300px, 0.8fr);
        }
        .co-v2-company-list {
          flex-direction: column;
          gap: 8px;
        }
        .co-v2-sidebar > .co-v2-card:first-child {
          background: transparent;
          box-shadow: none;
        }
        .co-v2-topbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 16px;
        }
        .co-v2-summary-strip {
          min-width: 0;
          width: 100%;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .co-v2-company-item,
        .co-v2-chip,
        .co-v2-tab,
        .co-org-card,
        .co-v2-tree-node {
          border: 1px solid var(--color-border, rgba(0,0,0,0.1));
          border-radius: var(--radius-md);
          background: var(--co-v2-item-bg);
          color: var(--color-text-primary);
          transition: border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
        }
        .co-v2-company-item:hover,
        .co-v2-chip:hover:not(:disabled),
        .co-v2-tab:hover,
        .co-org-card:hover,
        .co-v2-tree-node:hover {
          background: var(--co-v2-item-bg-hover);
        }
        .co-v2-company-item,
        .co-v2-tree-node {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
        }
        .co-v2-company-item {
          display: grid;
          gap: 8px;
          padding: 12px;
        }
        .co-v2-company-item-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 8px;
          min-width: 0;
        }
        .co-v2-company-item-row strong {
          font-size: 14px;
          line-height: 1.35;
        }
        .co-v2-company-item-row .settings-badge {
          margin-top: 1px;
          white-space: nowrap;
        }
        .co-v2-company-item-meta {
          align-items: center;
          flex-wrap: wrap;
          min-width: 0;
        }
        .co-v2-company-item-meta > span:not(.settings-badge) {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .co-v2-company-item-row strong,
        .co-v2-source-item strong,
        .co-v2-preview-item strong,
        .co-v2-list-row strong,
        .co-v2-detail-grid strong,
        .co-org-card strong {
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .co-v2-company-item.is-selected,
        .co-v2-tab.is-active,
        .co-v2-chip.is-selected,
        .co-org-card.is-selected,
        .co-v2-tree-node.is-selected {
          border-color: var(--color-accent);
          background: var(--co-v2-selected-bg);
          box-shadow: 0 0 0 1px var(--color-accent-subtle);
        }
        .co-v2-company-item-meta,
        .co-v2-source-meta,
        .co-v2-subtle {
          color: var(--color-text-secondary, rgba(15, 23, 42, 0.68));
          font-size: 12px;
          gap: 8px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }
        .co-v2-summary-strip,
        .co-v2-preview-summary,
        .co-v2-ops-overview,
        .co-v2-runtime-comparison {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px;
        }
        .co-v2-summary-strip {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .co-v2-summary-card {
          padding: 12px;
          border-radius: var(--radius-md);
          background: var(--co-v2-card-bg-strong);
          border: 1px solid var(--color-border-subtle);
          display: flex;
          flex-direction: column;
          gap: 6px;
          justify-content: center;
          min-height: 72px;
          min-width: 0;
        }
        .co-v2-summary-card span {
          font-size: 12px;
          color: var(--color-text-secondary, rgba(15, 23, 42, 0.68));
        }
        .co-v2-summary-card strong {
          font-size: 20px;
          color: var(--color-text-primary);
        }
        .co-v2-tabs {
          display: inline-flex;
          gap: 8px;
          padding: 4px;
          border-radius: var(--radius-md);
          background: var(--co-v2-card-bg-strong);
          border: 1px solid var(--color-border-subtle);
          justify-self: end;
        }
        .co-v2-tab {
          align-items: center;
          display: inline-flex;
          font-weight: 600;
          justify-content: center;
          min-height: 34px;
          padding: 8px 12px;
          white-space: nowrap;
        }
        .co-v2-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .co-v2-field > span {
          color: var(--color-text-secondary);
          font-size: 12px;
          font-weight: 600;
        }
        .co-v2-field input,
        .co-v2-field textarea,
        .co-v2-linker select {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--color-border, rgba(0,0,0,0.12));
          background: var(--co-v2-input-bg);
          color: var(--color-text-primary);
          font: inherit;
          padding: 10px 12px;
        }
        .co-v2-field input::placeholder,
        .co-v2-field textarea::placeholder {
          color: var(--color-text-muted);
        }
        .co-v2-preview-meta,
        .co-v2-detail-grid,
        .co-v2-rel-list,
        .co-v2-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .co-v2-source-meta {
          display: flex;
          flex-wrap: wrap;
        }
        .co-v2-source-item,
        .co-v2-preview-item,
        .co-v2-list-row,
        .co-v2-rel-item {
          padding: 12px;
          border-radius: var(--radius-md);
          border: 1px solid var(--color-border-subtle);
          background: var(--co-v2-card-bg-strong);
          min-width: 0;
          content-visibility: auto;
          contain-intrinsic-size: 0 72px;
        }
        .co-v2-source-item > div,
        .co-v2-preview-item > div,
        .co-v2-list-row > div {
          min-width: 0;
        }
        .co-v2-tree {
          overflow: auto;
          max-height: 720px;
        }
        .co-v2-tree-children {
          margin-left: 18px;
          padding-left: 12px;
          border-left: 1px solid var(--color-border-subtle);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .co-v2-tree-node {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .co-v2-tree-node strong {
          display: block;
        }
        .co-v2-tree-node span {
          font-size: 12px;
          color: var(--color-text-secondary, rgba(15, 23, 42, 0.68));
        }
        .co-v2-org-chart {
          overflow: auto;
          padding: 8px;
          min-height: 220px;
        }
        .co-org-branch {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          position: relative;
        }
        .co-org-branch-children {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 18px;
          position: relative;
        }
        .co-org-card {
          min-width: 180px;
          max-width: 220px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          text-align: center;
        }
        .co-org-card span:not(.co-org-card-kind) {
          color: var(--color-text-secondary);
          font-size: 12px;
          line-height: 1.35;
        }
        .co-org-card-kind {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--color-text-secondary, rgba(15, 23, 42, 0.68));
        }
        .co-v2-runtime-lanes h4,
        .co-v2-detail-section h4,
        .co-v2-output-columns h4 {
          margin: 0 0 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--color-text-secondary, rgba(15, 23, 42, 0.68));
        }
        .co-v2-chip {
          align-items: center;
          display: inline-flex;
          justify-content: center;
          max-width: 100%;
          padding: 8px 10px;
          font-size: 12px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .co-v2-chip:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .companies-v2 .settings-empty {
          background: var(--co-v2-card-bg-strong);
          color: var(--color-text-muted);
          min-width: 0;
        }
        .co-v2-detail,
        .co-v2-detail-section {
          gap: 12px;
        }
        .co-v2-detail-section {
          display: flex;
          flex-direction: column;
        }
        .co-v2-detail-kind {
          align-items: center;
          gap: 6px;
        }
        .co-v2-detail-title h3 {
          margin: 0;
          overflow-wrap: anywhere;
        }
        .co-v2-detail-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .co-v2-detail-grid strong {
          display: block;
          margin-top: 4px;
        }
        .co-v2-linker {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
        }
        .co-v2-output-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        /* Company workspace — the company list is navigation, not another card stack. */
        .co-v3-company-rail {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 4px 4px 0;
          border-right: 1px solid var(--color-border-subtle);
          min-height: 360px;
        }
        .co-v3-rail-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 8px 6px;
          color: var(--color-text-secondary);
          font-size: 12px;
          font-weight: 650;
        }
        .co-v3-rail-heading > span:last-child {
          color: var(--color-text-muted);
          font-size: 11px;
          font-variant-numeric: tabular-nums;
        }
        .co-v3-company-rail .co-v2-company-list {
          gap: 3px;
          padding-right: 10px;
        }
        .co-v3-company-rail .co-v2-company-item {
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          box-shadow: none;
          padding: 10px 11px;
        }
        .co-v3-company-rail .co-v2-company-item:hover {
          background: var(--color-bg-hover);
        }
        .co-v3-company-rail .co-v2-company-item.is-selected {
          border-color: color-mix(in srgb, var(--color-accent) 28%, transparent);
          background: color-mix(in srgb, var(--color-accent) 10%, var(--color-bg-glass));
          box-shadow: none;
        }
        .co-v3-company-rail .co-v2-company-item-row {
          align-items: center;
        }
        .co-v3-company-rail .co-v2-company-item-row strong {
          font-size: 13px;
        }
        .co-v3-company-rail .settings-badge {
          font-size: 10px;
          padding: 2px 5px;
        }
        .co-v3-rail-note {
          display: flex;
          align-items: flex-start;
          gap: 7px;
          margin: 6px 10px 0 8px;
          padding: 10px 9px;
          border-top: 1px solid var(--color-border-subtle);
          color: var(--color-text-muted);
          font-size: 11px;
          line-height: 1.55;
        }
        .co-v3-rail-note svg {
          margin-top: 1px;
          color: var(--color-accent);
        }
        .co-v3-company-overview {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
          gap: 28px;
          align-items: center;
          min-width: 0;
          padding: 4px 0 18px;
          border-bottom: 1px solid var(--color-border-subtle);
        }
        .co-v3-company-identity {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }
        .co-v3-company-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
          border-radius: 12px;
          background: color-mix(in srgb, var(--color-accent) 9%, var(--color-bg-glass));
          color: var(--color-accent);
          flex-shrink: 0;
        }
        .co-v3-company-title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .co-v3-company-title-row h3 {
          font-size: 18px;
          font-weight: 680;
          letter-spacing: -0.02em;
        }
        .co-v3-company-identity p {
          margin-top: 4px;
          color: var(--color-text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }
        .co-v3-company-facts {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          border-left: 1px solid var(--color-border-subtle);
        }
        .co-v3-company-facts > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
          padding: 0 13px;
          border-right: 1px solid var(--color-border-subtle);
        }
        .co-v3-company-facts > div:last-child { border-right: 0; }
        .co-v3-company-facts span {
          color: var(--color-text-muted);
          font-size: 11px;
          line-height: 1.35;
        }
        .co-v3-company-facts strong {
          color: var(--color-text-primary);
          font-size: 20px;
          font-variant-numeric: tabular-nums;
        }
        .co-v3-mode-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .co-v3-mode-label {
          color: var(--color-text-secondary);
          font-size: 12px;
          font-weight: 650;
        }
        .co-v3-mode-row .co-v2-tabs {
          padding: 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          gap: 0;
        }
        .co-v3-mode-row .co-v2-tab {
          min-height: 30px;
          border: 0;
          border-bottom: 2px solid transparent;
          border-radius: 0;
          background: transparent;
          color: var(--color-text-muted);
          font-size: 12px;
          font-weight: 600;
          padding: 6px 10px;
        }
        .co-v3-mode-row .co-v2-tab.is-active {
          border-color: var(--color-accent);
          background: transparent;
          box-shadow: none;
          color: var(--color-accent);
        }
        .co-v3-library-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.93fr) minmax(0, 1.07fr);
          gap: 0;
          align-items: start;
        }
        .co-v3-work-panel {
          min-width: 0;
          padding: 20px 24px 24px 0;
          border: 0;
          border-radius: 0;
          background: transparent;
          box-shadow: none;
        }
        .co-v3-work-panel + .co-v3-work-panel {
          padding-left: 28px;
          padding-right: 0;
          border-left: 1px solid var(--color-border-subtle);
        }
        .co-v3-panel-heading {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          padding-bottom: 10px;
          border-bottom: 0;
        }
        .co-v3-panel-index {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 25px;
          height: 25px;
          border-radius: 50%;
          background: color-mix(in srgb, var(--color-accent) 11%, var(--color-bg-glass));
          color: var(--color-accent);
          font-size: 11px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          flex-shrink: 0;
        }
        .co-v3-panel-heading h3 {
          font-size: 15px;
          font-weight: 680;
          letter-spacing: -0.01em;
        }
        .co-v3-panel-heading p {
          margin-top: 4px;
          color: var(--color-text-secondary);
          font-size: 12px;
          line-height: 1.5;
        }
        .co-v3-form {
          display: flex;
          flex-direction: column;
          gap: 13px;
          padding-top: 10px;
        }
        .co-v3-form .co-v2-field { gap: 6px; }
        .co-v3-form .co-v2-field > span {
          color: var(--color-text-secondary);
          font-size: 11px;
          font-weight: 650;
        }
        .co-v3-form .co-v2-field input,
        .co-v3-form .co-v2-field textarea {
          border-radius: 9px;
          padding: 9px 11px;
        }
        .co-v3-primary-action {
          align-self: stretch;
          min-height: 34px;
          padding: 8px 13px;
          border-radius: 9px;
          justify-content: center !important;
          border-color: var(--color-accent) !important;
          background: var(--color-accent) !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }
        .co-v3-primary-action:hover:not(:disabled) {
          background: color-mix(in srgb, var(--color-accent) 88%, #000000) !important;
          border-color: color-mix(in srgb, var(--color-accent) 88%, #000000) !important;
        }
        .co-v3-primary-action:focus-visible,
        .co-v3-dropzone:focus-visible,
        .co-v3-segmented-control button:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--color-accent) 62%, transparent);
          outline-offset: 2px;
        }
        .co-v3-target-control {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 0;
          color: var(--color-text-secondary);
          font-size: 12px;
        }
        .co-v3-segmented-control {
          display: inline-flex;
          padding: 3px;
          border: 1px solid var(--color-border-subtle);
          border-radius: 9px;
          background: var(--color-bg-secondary);
        }
        .co-v3-segmented-control button {
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--color-text-secondary);
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          padding: 6px 8px;
        }
        .co-v3-segmented-control button.is-selected {
          background: var(--color-bg-glass);
          box-shadow: var(--shadow-sm);
          color: var(--color-text-primary);
        }
        .co-v3-segmented-control button:disabled { cursor: not-allowed; opacity: 0.45; }
        .co-v3-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 7px;
          width: 100%;
          min-height: 216px;
          padding: 24px;
          border: 1px dashed color-mix(in srgb, var(--color-accent) 35%, var(--color-border-subtle));
          border-radius: 12px;
          background: color-mix(in srgb, var(--color-accent) 3%, var(--color-bg-glass));
          color: var(--color-text-secondary);
          cursor: pointer;
          text-align: center;
          transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
        }
        .co-v3-dropzone:hover {
          border-color: var(--color-accent);
          background: color-mix(in srgb, var(--color-accent) 7%, var(--color-bg-glass));
          transform: translateY(-1px);
        }
        .co-v3-dropzone-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 11px;
          background: var(--color-bg-glass);
          box-shadow: var(--shadow-sm);
          color: var(--color-accent);
        }
        .co-v3-dropzone strong { color: var(--color-text-primary); font-size: 13px; }
        .co-v3-dropzone > span:not(.co-v3-dropzone-icon):not(.co-v3-choose-file) { font-size: 11px; line-height: 1.5; }
        .co-v3-choose-file {
          margin-top: 3px;
          padding: 6px 9px;
          border-radius: 7px;
          background: var(--color-bg-glass);
          color: var(--color-accent);
          font-size: 11px;
          font-weight: 650;
          box-shadow: var(--shadow-sm);
        }
        .co-v3-import-preview {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
          border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border-subtle));
          border-radius: 12px;
          background: color-mix(in srgb, var(--color-accent) 4%, var(--color-bg-glass));
        }
        .co-v3-preview-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .co-v3-preview-topline > div { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .co-v3-preview-topline span { color: var(--color-accent); font-size: 11px; font-weight: 650; }
        .co-v3-preview-topline strong { overflow-wrap: anywhere; }
        .co-v3-preview-facts { display: flex; flex-wrap: wrap; gap: 7px; }
        .co-v3-preview-facts span {
          padding: 4px 7px;
          border-radius: 6px;
          background: var(--color-bg-glass);
          color: var(--color-text-secondary);
          font-size: 11px;
        }
        .co-v3-reset-preview {
          align-self: flex-start;
          border: 0;
          background: transparent;
          color: var(--color-accent);
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          padding: 0;
        }
        .co-v3-source-summary {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          column-gap: 10px;
          row-gap: 2px;
          margin-top: 16px;
          padding-top: 14px;
          border-top: 1px solid var(--color-border-subtle);
          font-size: 11px;
        }
        .co-v3-source-summary > span,
        .co-v3-source-summary small { color: var(--color-text-muted); }
        .co-v3-source-summary strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .co-v3-source-summary small { grid-column: 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 1200px) {
          .co-v2-layout,
          .co-v2-panel-grid,
          .co-v2-panel-grid--org,
          .co-v2-topbar,
          .co-v2-output-columns {
            grid-template-columns: 1fr;
          }
          .co-v2-tabs {
            justify-self: start;
          }
          .co-v2-sidebar {
            order: 2;
          }
          .co-v2-main {
            order: 1;
          }
          .co-v3-company-overview,
          .co-v3-library-grid {
            grid-template-columns: 1fr;
          }
          .co-v3-work-panel + .co-v3-work-panel {
            padding: 24px 0 0;
            border-left: 0;
            border-top: 1px solid var(--color-border-subtle);
          }
          .co-v3-company-facts { max-width: 640px; }
          .co-v3-company-rail {
            border-right: 0;
            border-top: 1px solid var(--color-border-subtle);
            min-height: auto;
            padding-top: 14px;
          }
        }
        @media (max-width: 760px) {
          .co-v2-summary-strip,
          .co-v2-preview-summary,
          .co-v2-ops-overview,
          .co-v2-runtime-comparison,
          .co-v2-detail-grid {
            grid-template-columns: 1fr;
          }
          .co-v2-header > .provider-test-button,
          .co-v2-card-header > .provider-save-button,
          .co-v2-card-header > .provider-test-button,
          .co-v2-linker .provider-save-button {
            width: 100%;
            justify-content: center;
          }
          .co-v2-tabs {
            width: 100%;
          }
          .co-v2-tab {
            flex: 1 1 0;
          }
          .co-v2-linker {
            grid-template-columns: 1fr;
          }
          .co-v3-company-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .co-v3-company-facts > div:nth-child(2) { border-right: 0; }
          .co-v3-company-facts > div:nth-child(n + 3) { border-top: 1px solid var(--color-border-subtle); padding-top: 10px; }
          .co-v3-mode-row,
          .co-v3-target-control,
          .co-v3-preview-topline { align-items: flex-start; flex-direction: column; }
          .co-v3-mode-row .co-v2-tabs { width: 100%; overflow-x: auto; }
          .co-v3-mode-row .co-v2-tab { flex: 1 0 auto; }
        }
      `}</style>
    </div>
  );
}

function OrgTreeNode({
  node,
  childrenMap,
  selectedNodeId,
  setSelectedNodeId,
}: {
  node: CompanyGraphNode;
  childrenMap: Map<string, CompanyGraphNode[]>;
  selectedNodeId: string | null;
  setSelectedNodeId: (value: string) => void;
}) {
  const children = childrenMap.get(node.id) || [];
  return (
    <div>
      <button
        type="button"
        className={`co-v2-tree-node ${selectedNodeId === node.id ? "is-selected" : ""}`}
        onClick={() => setSelectedNodeId(node.id)}
      >
        {nodeIcon(node.kind)}
        <div>
          <strong>{node.name}</strong>
          <span>{node.kind}</span>
        </div>
      </button>
      {children.length > 0 && (
        <div className="co-v2-tree-children">
          {children.map((child) => (
            <OrgTreeNode
              key={child.id}
              node={child}
              childrenMap={childrenMap}
              selectedNodeId={selectedNodeId}
              setSelectedNodeId={setSelectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
