import { useEffect, useMemo, useState } from "react";
import "./memory-hub-settings.css";
import type {
  AutonomyConfig,
  AutonomyDecision,
  AutonomyAction,
  ChiefOfStaffWorldModel,
  AwarenessBelief,
  AwarenessConfig,
  AwarenessSource,
  AwarenessSummary,
  MemoryLayerPreviewPayload,
  MemoryObservationBackfillStatus,
  MemoryObservationMetadata,
  MemoryObservationPrivacyState,
  MemoryObservationSearchResult,
  MemoryObservationTimelineEntry,
  MemoryFeaturesSettings,
  SupermemoryConfigStatus,
  SupermemorySearchMode,
  MemoryWriteApprovalItem,
  Workspace,
  WorkspaceKitStatus,
} from "../../shared/types";
import { MemorySettings } from "./MemorySettings";
import { ChronicleSettingsCard } from "./ChronicleSettings";
import { createRendererLogger } from "../utils/logger";
import { translate, useLanguage } from "../i18n";

const DEFAULT_FEATURES: MemoryFeaturesSettings = {
  contextPackInjectionEnabled: true,
  heartbeatMaintenanceEnabled: true,
  checkpointCaptureEnabled: true,
  verbatimRecallEnabled: true,
  wakeUpLayersEnabled: true,
  temporalKnowledgeEnabled: true,
  structuredObservationsEnabled: true,
  progressiveRecallToolsEnabled: true,
  memoryInspectorEnabled: true,
  transcriptStoreEnabled: false,
  durableContextEnabled: false,
  durableContextMode: "off",
  durableContextThreshold: 0.75,
  durableContextFreshTailCount: 64,
  durableContextLargePayloadThreshold: 25000,
  durableContextSummaryModel: "",
  memoryWriteApprovalMode: "off",
};

type BadgeTone = "neutral" | "success" | "warning" | "error";
type MemoryHubSection =
  "basics" | "workspace" | "layers" | "inspector" | "external";
const logger = createRendererLogger("MemoryHubSettings");

function badgeClass(tone: BadgeTone) {
  return `settings-badge settings-badge--${tone}`;
}

function formatTimestamp(timestamp?: number): string | null {
  if (!timestamp) return null;
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return null;
  }
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatConfidence(confidence?: number): string {
  if (typeof confidence !== "number" || !Number.isFinite(confidence))
    return "n/a";
  return `${Math.round(confidence * 100)}%`;
}

export function MemoryHubSettings(props?: {
  initialWorkspaceId?: string;
  onSettingsChanged?: () => void;
}) {
  useLanguage();
  const t = translate;
  const [features, setFeatures] = useState<MemoryFeaturesSettings | null>(null);
  const [activeSection, setActiveSection] =
    useState<MemoryHubSection>("basics");
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [kitStatus, setKitStatus] = useState<WorkspaceKitStatus | null>(null);
  const [kitLoading, setKitLoading] = useState(false);
  const [kitBusy, setKitBusy] = useState(false);
  const [kitPreset, setKitPreset] = useState<"default" | "venture_operator">(
    "default",
  );
  const [newProjectId, setNewProjectId] = useState("");
  const [layerPreview, setLayerPreview] =
    useState<MemoryLayerPreviewPayload | null>(null);
  const [observationQuery, setObservationQuery] = useState("");
  const [observationPrivacy, setObservationPrivacy] = useState<
    "all" | MemoryObservationPrivacyState
  >("all");
  const [observationResults, setObservationResults] = useState<
    MemoryObservationSearchResult[]
  >([]);
  const [observationTimeline, setObservationTimeline] = useState<
    MemoryObservationTimelineEntry[]
  >([]);
  const [selectedObservationId, setSelectedObservationId] =
    useState<string>("");
  const [selectedObservation, setSelectedObservation] =
    useState<MemoryObservationMetadata | null>(null);
  const [observationEditTitle, setObservationEditTitle] = useState("");
  const [observationEditNarrative, setObservationEditNarrative] = useState("");
  const [observationLoading, setObservationLoading] = useState(false);
  const [observationBusy, setObservationBusy] = useState(false);
  const [observationBackfillStatus, setObservationBackfillStatus] =
    useState<MemoryObservationBackfillStatus | null>(null);
  const [pendingMemoryWrites, setPendingMemoryWrites] = useState<
    MemoryWriteApprovalItem[]
  >([]);
  const [memoryApprovalBusyId, setMemoryApprovalBusyId] = useState<string>("");
  const [memoryApprovalsLoading, setMemoryApprovalsLoading] = useState(false);
  const [awarenessConfig, setAwarenessConfig] =
    useState<AwarenessConfig | null>(null);
  const [awarenessBeliefs, setAwarenessBeliefs] = useState<AwarenessBelief[]>(
    [],
  );
  const [awarenessSummary, setAwarenessSummary] =
    useState<AwarenessSummary | null>(null);
  const [awarenessSaving, setAwarenessSaving] = useState(false);
  const [autonomyConfig, setAutonomyConfig] = useState<AutonomyConfig | null>(
    null,
  );
  const [autonomyState, setAutonomyState] =
    useState<ChiefOfStaffWorldModel | null>(null);
  const [autonomyDecisions, setAutonomyDecisions] = useState<
    AutonomyDecision[]
  >([]);
  const [autonomyActions, setAutonomyActions] = useState<AutonomyAction[]>([]);
  const [autonomySaving, setAutonomySaving] = useState(false);
  const [supermemoryStatus, setSupermemoryStatus] =
    useState<SupermemoryConfigStatus | null>(null);
  const [supermemoryEnabled, setSupermemoryEnabled] = useState(false);
  const [supermemoryApiKey, setSupermemoryApiKey] = useState("");
  const [supermemoryBaseUrl, setSupermemoryBaseUrl] = useState(
    "https://api.supermemory.ai",
  );
  const [supermemoryContainerTemplate, setSupermemoryContainerTemplate] =
    useState("neoworker:{workspaceId}");
  const [supermemoryIncludeProfile, setSupermemoryIncludeProfile] =
    useState(true);
  const [supermemoryMirrorWrites, setSupermemoryMirrorWrites] = useState(true);
  const [supermemorySearchMode, setSupermemorySearchMode] =
    useState<SupermemorySearchMode>("hybrid");
  const [supermemoryRerank, setSupermemoryRerank] = useState(true);
  const [supermemoryThreshold, setSupermemoryThreshold] = useState("0.55");
  const [supermemoryCustomContainers, setSupermemoryCustomContainers] =
    useState("");
  const [supermemorySaving, setSupermemorySaving] = useState(false);
  const [supermemoryTesting, setSupermemoryTesting] = useState(false);
  const [supermemoryTestResult, setSupermemoryTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [workspaces, selectedWorkspaceId]);

  const kitHealth = useMemo(() => {
    const files = kitStatus?.files || [];
    return {
      staleCount: files.filter((file) => file.stale).length,
      warningCount: kitStatus?.lintWarningCount || 0,
      errorCount: kitStatus?.lintErrorCount || 0,
    };
  }, [kitStatus]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      setKitStatus(null);
      setLayerPreview(null);
      setAwarenessBeliefs([]);
      setAwarenessSummary(null);
      setAutonomyState(null);
      setAutonomyDecisions([]);
      setAutonomyActions([]);
      return;
    }
    void refreshKit();
    void refreshLayerPreview();
    void refreshObservationBackfillStatus();
    void refreshMemoryApprovals();
    void searchObservations();
    void refreshAwareness();
    void refreshAutonomy();
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    void refreshLayerPreview();
  }, [
    selectedWorkspaceId,
    features?.wakeUpLayersEnabled,
    features?.contextPackInjectionEnabled,
  ]);

  const loadAll = async () => {
    try {
      setLoading(true);

      const [
        loadedFeatures,
        loadedWorkspaces,
        tempWorkspace,
        loadedAwarenessConfig,
        loadedAutonomyConfig,
        loadedSupermemoryStatus,
      ] = await Promise.all([
        window.electronAPI
          .getMemoryFeaturesSettings()
          .catch(() => DEFAULT_FEATURES),
        window.electronAPI.listWorkspaces().catch(() => [] as Workspace[]),
        window.electronAPI
          .getTempWorkspace()
          .catch(() => null as Workspace | null),
        window.electronAPI
          .getAwarenessConfig()
          .catch(() => null as AwarenessConfig | null),
        window.electronAPI
          .getAutonomyConfig()
          .catch(() => null as AutonomyConfig | null),
        window.electronAPI
          .getSupermemoryStatus()
          .catch(() => null as SupermemoryConfigStatus | null),
      ]);

      const combined: Workspace[] = [
        ...(tempWorkspace ? [tempWorkspace] : []),
        ...loadedWorkspaces.filter((w) => w.id !== tempWorkspace?.id),
      ];

      setFeatures(loadedFeatures);
      setAwarenessConfig(loadedAwarenessConfig);
      setAutonomyConfig(loadedAutonomyConfig);
      setSupermemoryStatus(loadedSupermemoryStatus);
      setSupermemoryEnabled(loadedSupermemoryStatus?.enabled === true);
      setSupermemoryBaseUrl(
        loadedSupermemoryStatus?.baseUrl || "https://api.supermemory.ai",
      );
      setSupermemoryContainerTemplate(
        loadedSupermemoryStatus?.containerTagTemplate ||
          "neoworker:{workspaceId}",
      );
      setSupermemoryIncludeProfile(
        loadedSupermemoryStatus?.includeProfileInPrompt !== false,
      );
      setSupermemoryMirrorWrites(
        loadedSupermemoryStatus?.mirrorMemoryWrites !== false,
      );
      setSupermemorySearchMode(loadedSupermemoryStatus?.searchMode || "hybrid");
      setSupermemoryRerank(loadedSupermemoryStatus?.rerank !== false);
      setSupermemoryThreshold(
        String(loadedSupermemoryStatus?.threshold ?? 0.55),
      );
      setSupermemoryCustomContainers(
        (loadedSupermemoryStatus?.customContainers || [])
          .map(
            (entry) =>
              `${entry.tag}${entry.description ? ` | ${entry.description}` : ""}`,
          )
          .join("\n"),
      );
      setWorkspaces(combined);
      setSelectedWorkspaceId((prev) => {
        const preferred = (props?.initialWorkspaceId || "").trim();
        if (preferred && combined.some((w) => w.id === preferred))
          return preferred;
        if (prev && combined.some((w) => w.id === prev)) return prev;
        return combined[0]?.id || "";
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshKit = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setKitLoading(true);
      const status =
        await window.electronAPI.getWorkspaceKitStatus(selectedWorkspaceId);
      setKitStatus(status);
    } catch (error) {
      logger.error("Failed to load workspace kit status:", error);
      setKitStatus(null);
    } finally {
      setKitLoading(false);
    }
  };

  const refreshLayerPreview = async () => {
    if (!selectedWorkspaceId) return;
    try {
      const preview =
        await window.electronAPI.getMemoryLayerPreview(selectedWorkspaceId);
      setLayerPreview(preview);
    } catch (error) {
      logger.error("Failed to load memory layer preview:", error);
      setLayerPreview(null);
    }
  };

  const refreshObservationBackfillStatus = async () => {
    try {
      const status =
        await window.electronAPI.getMemoryObservationBackfillStatus();
      setObservationBackfillStatus(status);
    } catch (error) {
      logger.error("Failed to load memory observation backfill status:", error);
    }
  };

  const refreshMemoryApprovals = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setMemoryApprovalsLoading(true);
      const items = await window.electronAPI.listMemoryWriteApprovals({
        workspaceId: selectedWorkspaceId,
        limit: 50,
      });
      setPendingMemoryWrites(items);
    } catch (error) {
      logger.error("Failed to load pending memory writes:", error);
      setPendingMemoryWrites([]);
    } finally {
      setMemoryApprovalsLoading(false);
    }
  };

  const approveMemoryWrite = async (id: string) => {
    if (!selectedWorkspaceId || !id) return;
    try {
      setMemoryApprovalBusyId(id);
      const result = await window.electronAPI.approveMemoryWriteApproval({
        id,
        workspaceId: selectedWorkspaceId,
      });
      if (result.status === "failed") {
        window.alert(
          result.resolution ||
            t(
              "memoryHub.memoryApprovals.approveFailed",
              "Approved memory write failed to apply.",
            ),
        );
      }
      await Promise.all([
        refreshMemoryApprovals(),
        refreshLayerPreview(),
        refreshKit(),
      ]);
    } catch (error) {
      logger.error("Failed to approve memory write:", error);
    } finally {
      setMemoryApprovalBusyId("");
    }
  };

  const rejectMemoryWrite = async (id: string) => {
    if (!selectedWorkspaceId || !id) return;
    const reason = window.prompt(
      t(
        "memoryHub.memoryApprovals.rejectReasonPrompt",
        "Reason for rejecting this memory write?",
      ),
      t(
        "memoryHub.memoryApprovals.rejectedFromHub",
        "Rejected from Memory Hub",
      ),
    );
    if (reason === null) return;
    try {
      setMemoryApprovalBusyId(id);
      await window.electronAPI.rejectMemoryWriteApproval({
        id,
        workspaceId: selectedWorkspaceId,
        reason,
      });
      await refreshMemoryApprovals();
    } catch (error) {
      logger.error("Failed to reject memory write:", error);
    } finally {
      setMemoryApprovalBusyId("");
    }
  };

  const searchObservations = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setObservationLoading(true);
      const results = await window.electronAPI.searchMemoryObservations({
        workspaceId: selectedWorkspaceId,
        query: observationQuery.trim(),
        limit: 30,
        privacyStates:
          observationPrivacy === "all" ? undefined : [observationPrivacy],
      });
      setObservationResults(results);
      const nextId = selectedObservationId || results[0]?.memoryId || "";
      if (nextId) {
        await loadObservation(nextId);
      } else {
        setSelectedObservation(null);
        setObservationTimeline([]);
      }
    } catch (error) {
      logger.error("Failed to search memory observations:", error);
      setObservationResults([]);
    } finally {
      setObservationLoading(false);
    }
  };

  const loadObservation = async (memoryId: string) => {
    if (!selectedWorkspaceId || !memoryId) return;
    try {
      setSelectedObservationId(memoryId);
      const [details, timeline] = await Promise.all([
        window.electronAPI.getMemoryObservationDetails({
          workspaceId: selectedWorkspaceId,
          ids: [memoryId],
        }),
        window.electronAPI.getMemoryObservationTimeline({
          workspaceId: selectedWorkspaceId,
          memoryId,
          windowSize: 4,
        }),
      ]);
      setSelectedObservation(details[0] || null);
      setObservationEditTitle(details[0]?.title || "");
      setObservationEditNarrative(details[0]?.narrative || "");
      setObservationTimeline(timeline);
    } catch (error) {
      logger.error("Failed to load memory observation:", error);
    }
  };

  const updateObservationPrivacy = async (
    privacyState: MemoryObservationPrivacyState,
  ) => {
    if (!selectedObservation) return;
    try {
      setObservationBusy(true);
      await window.electronAPI.updateMemoryObservation({
        workspaceId: selectedWorkspaceId,
        memoryId: selectedObservation.memoryId,
        patch: { privacyState },
      });
      await loadObservation(selectedObservation.memoryId);
      await searchObservations();
    } catch (error) {
      logger.error("Failed to update memory observation:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const saveObservationMetadata = async () => {
    if (!selectedObservation) return;
    try {
      setObservationBusy(true);
      await window.electronAPI.updateMemoryObservation({
        workspaceId: selectedWorkspaceId,
        memoryId: selectedObservation.memoryId,
        patch: {
          title: observationEditTitle.trim() || selectedObservation.title,
          narrative:
            observationEditNarrative.trim() || selectedObservation.narrative,
        },
      });
      await loadObservation(selectedObservation.memoryId);
      await searchObservations();
    } catch (error) {
      logger.error("Failed to save memory observation metadata:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const redactObservation = async () => {
    if (!selectedObservation) return;
    try {
      setObservationBusy(true);
      await window.electronAPI.redactMemoryObservation({
        workspaceId: selectedWorkspaceId,
        memoryId: selectedObservation.memoryId,
      });
      await loadObservation(selectedObservation.memoryId);
      await searchObservations();
    } catch (error) {
      logger.error("Failed to redact memory observation:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const deleteObservation = async () => {
    if (!selectedObservation) return;
    const confirmed = window.confirm(
      t(
        "memoryHub.inspector.confirmSuppress",
        "Hide this memory from recall? The record will be kept as suppressed metadata.",
      ),
    );
    if (!confirmed) return;
    try {
      setObservationBusy(true);
      await window.electronAPI.deleteMemoryObservation({
        workspaceId: selectedWorkspaceId,
        memoryId: selectedObservation.memoryId,
      });
      setSelectedObservationId("");
      setSelectedObservation(null);
      setObservationTimeline([]);
      await searchObservations();
    } catch (error) {
      logger.error("Failed to delete memory observation:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const promoteObservation = async () => {
    if (!selectedObservation) return;
    try {
      setObservationBusy(true);
      await window.electronAPI.promoteMemoryObservation({
        workspaceId: selectedWorkspaceId,
        memoryId: selectedObservation.memoryId,
        target: "workspace",
        kind: "project_fact",
      });
      await refreshLayerPreview();
    } catch (error) {
      logger.error("Failed to promote memory observation:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const rebuildObservationMetadata = async () => {
    try {
      setObservationBusy(true);
      const status = await window.electronAPI.rebuildMemoryObservationMetadata({
        force: true,
      });
      setObservationBackfillStatus(status);
      await searchObservations();
    } catch (error) {
      logger.error("Failed to rebuild memory observation metadata:", error);
    } finally {
      setObservationBusy(false);
    }
  };

  const refreshAwareness = async () => {
    if (!selectedWorkspaceId) return;
    try {
      const [beliefs, summary] = await Promise.all([
        window.electronAPI
          .listAwarenessBeliefs(selectedWorkspaceId)
          .catch(() => [] as AwarenessBelief[]),
        window.electronAPI
          .getAwarenessSummary(selectedWorkspaceId)
          .catch(() => null as AwarenessSummary | null),
      ]);
      setAwarenessBeliefs(beliefs);
      setAwarenessSummary(summary);
    } catch (error) {
      logger.error("Failed to load awareness state:", error);
    }
  };

  const refreshAutonomy = async () => {
    if (!selectedWorkspaceId) return;
    try {
      const [worldModel, decisions, actions] = await Promise.all([
        window.electronAPI
          .getAutonomyState(selectedWorkspaceId)
          .catch(() => null as ChiefOfStaffWorldModel | null),
        window.electronAPI
          .listAutonomyDecisions(selectedWorkspaceId)
          .catch(() => [] as AutonomyDecision[]),
        window.electronAPI
          .listAutonomyActions(selectedWorkspaceId)
          .catch(() => [] as AutonomyAction[]),
      ]);
      setAutonomyState(worldModel);
      setAutonomyDecisions(decisions);
      setAutonomyActions(actions);
    } catch (error) {
      logger.error("Failed to load autonomy state:", error);
    }
  };

  const initKit = async () => {
    if (!selectedWorkspaceId) return;
    try {
      setKitBusy(true);
      const status = await window.electronAPI.initWorkspaceKit({
        workspaceId: selectedWorkspaceId,
        mode: "missing",
        templatePreset: kitPreset,
      });
      setKitStatus(status);
    } catch (error) {
      logger.error("Failed to initialize workspace kit:", error);
    } finally {
      setKitBusy(false);
    }
  };

  const createProject = async () => {
    if (!selectedWorkspaceId) return;
    const projectId = newProjectId.trim();
    if (!projectId) return;
    try {
      setKitBusy(true);
      await window.electronAPI.createWorkspaceKitProject({
        workspaceId: selectedWorkspaceId,
        projectId,
      });
      setNewProjectId("");
      await refreshKit();
    } catch (error) {
      logger.error("Failed to create project folder:", error);
    } finally {
      setKitBusy(false);
    }
  };

  const saveFeatures = async (updates: Partial<MemoryFeaturesSettings>) => {
    const next: MemoryFeaturesSettings = {
      ...(features || DEFAULT_FEATURES),
      ...updates,
    };
    setFeatures(next);
    try {
      setSaving(true);
      await window.electronAPI.saveMemoryFeaturesSettings(next);
    } catch (error) {
      logger.error("Failed to save memory feature settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const renderPendingPayload = (item: MemoryWriteApprovalItem): string => {
    const payload = item.payload || {};
    const visible = {
      proposedValue: item.proposedValue,
      oldValue: item.oldValue,
      reason: item.reason,
      payload,
    };
    return JSON.stringify(visible, null, 2);
  };

  const saveAwarenessConfig = async (nextConfig: AwarenessConfig) => {
    setAwarenessConfig(nextConfig);
    try {
      setAwarenessSaving(true);
      const saved = await window.electronAPI.saveAwarenessConfig(nextConfig);
      setAwarenessConfig(saved);
    } catch (error) {
      logger.error("Failed to save awareness config:", error);
    } finally {
      setAwarenessSaving(false);
    }
  };

  const updateAwarenessSource = async (
    source: AwarenessSource,
    updates: Partial<AwarenessConfig["sources"][AwarenessSource]>,
  ) => {
    if (!awarenessConfig) return;
    await saveAwarenessConfig({
      ...awarenessConfig,
      sources: {
        ...awarenessConfig.sources,
        [source]: {
          ...awarenessConfig.sources[source],
          ...updates,
        },
      },
    });
  };

  const updateBelief = async (
    belief: AwarenessBelief,
    patch: Record<string, unknown>,
  ) => {
    try {
      await window.electronAPI.updateAwarenessBelief(belief.id, patch);
      await refreshAwareness();
    } catch (error) {
      logger.error("Failed to update awareness belief:", error);
    }
  };

  const deleteBelief = async (beliefId: string) => {
    try {
      await window.electronAPI.deleteAwarenessBelief(beliefId);
      await refreshAwareness();
    } catch (error) {
      logger.error("Failed to delete awareness belief:", error);
    }
  };

  const saveAutonomyConfig = async (nextConfig: AutonomyConfig) => {
    setAutonomyConfig(nextConfig);
    try {
      setAutonomySaving(true);
      const saved = await window.electronAPI.saveAutonomyConfig(nextConfig);
      setAutonomyConfig(saved);
    } catch (error) {
      logger.error("Failed to save autonomy config:", error);
    } finally {
      setAutonomySaving(false);
    }
  };

  const updateDecision = async (
    decisionId: string,
    patch: Record<string, unknown>,
  ) => {
    try {
      await window.electronAPI.updateAutonomyDecision(decisionId, patch);
      await refreshAutonomy();
    } catch (error) {
      logger.error("Failed to update autonomy decision:", error);
    }
  };

  const saveSupermemorySettings = async () => {
    try {
      setSupermemorySaving(true);
      setSupermemoryTestResult(null);
      await window.electronAPI.saveSupermemorySettings({
        enabled: supermemoryEnabled,
        apiKey: supermemoryApiKey || undefined,
        baseUrl: supermemoryBaseUrl,
        containerTagTemplate: supermemoryContainerTemplate,
        includeProfileInPrompt: supermemoryIncludeProfile,
        mirrorMemoryWrites: supermemoryMirrorWrites,
        searchMode: supermemorySearchMode,
        rerank: supermemoryRerank,
        threshold: Number(supermemoryThreshold),
        customContainers: supermemoryCustomContainers
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const [tag, ...descriptionParts] = line.split("|");
            return {
              tag: tag.trim(),
              description: descriptionParts.join("|").trim() || undefined,
            };
          }),
      });
      setSupermemoryApiKey("");
      const refreshed = await window.electronAPI.getSupermemoryStatus();
      setSupermemoryStatus(refreshed);
    } catch (error) {
      logger.error("Failed to save Supermemory settings:", error);
    } finally {
      setSupermemorySaving(false);
    }
  };

  const testSupermemoryConnection = async () => {
    try {
      setSupermemoryTesting(true);
      setSupermemoryTestResult(null);
      const result = await window.electronAPI.testSupermemoryConnection();
      setSupermemoryTestResult(result);
      const refreshed = await window.electronAPI
        .getSupermemoryStatus()
        .catch(() => null);
      if (refreshed) {
        setSupermemoryStatus(refreshed);
      }
    } catch (error: unknown) {
      setSupermemoryTestResult({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : t(
                "memoryHub.supermemory.error.failedToReach",
                "Failed to reach Supermemory",
              ),
      });
    } finally {
      setSupermemoryTesting(false);
    }
  };

  if (loading || !features) {
    return (
      <div className="settings-section">
        <div className="settings-loading">
          {t("memory.loading", "Loading memory settings...")}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">
        {t("memoryHub.title", "Memory")}
      </h2>
      <p className="settings-section-description">
        {t(
          "memoryHub.description",
          "Control memory-related features globally and per workspace.",
        )}
      </p>

      <nav
        className="memory-hub-navigation"
        aria-label={t("memoryHub.navigation.label", "Memory settings")}
      >
        {(
          [
            ["basics", t("memoryHub.navigation.basics", "Basics")],
            ["workspace", t("memoryHub.navigation.workspace", "Workspace")],
            [
              "layers",
              t("memoryHub.navigation.layers", "Recall and awareness"),
            ],
            ["inspector", t("memoryHub.navigation.inspector", "Inspector")],
            ["external", t("memoryHub.navigation.external", "External memory")],
          ] as Array<[MemoryHubSection, string]>
        ).map(([section, label]) => (
          <button
            key={section}
            type="button"
            className={`memory-hub-navigation-item${activeSection === section ? " is-active" : ""}`}
            aria-current={activeSection === section ? "page" : undefined}
            onClick={() => setActiveSection(section)}
          >
            {label}
          </button>
        ))}
      </nav>

      {activeSection === "basics" && (
        <div className="settings-subsection memory-hub-section-panel">
          <div className="memory-hub-section-heading">
            <div>
              <h3>{t("memoryHub.globalToggles", "Global Toggles")}</h3>
              <p className="settings-form-hint">
                {t(
                  "memoryHub.globalTogglesDescription",
                  "Choose the memory capabilities used in everyday conversations. Less common controls stay folded below.",
                )}
              </p>
            </div>
          </div>

          <div className="memory-hub-setting-list">
            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t(
                      "memoryHub.contextPack.title",
                      "Enable Workspace Context Pack Injection",
                    )}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.contextPack.description.prefix",
                      "When enabled, the app may inject redacted notes from",
                    )}{" "}
                    <code>.neoworker/</code>{" "}
                    {t(
                      "memoryHub.contextPack.description.suffix",
                      "into agent context to improve continuity.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={features.contextPackInjectionEnabled}
                    onChange={(e) =>
                      saveFeatures({
                        contextPackInjectionEnabled: e.target.checked,
                      })
                    }
                    disabled={saving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t(
                      "memoryHub.heartbeats.title",
                      "Enable Maintenance Heartbeats",
                    )}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.heartbeats.description.prefix",
                      "When enabled, lead agents treat",
                    )}{" "}
                    <code>.neoworker/HEARTBEAT.md</code>{" "}
                    {t(
                      "memoryHub.heartbeats.description.suffix",
                      "as the recurring checks contract for proactive maintenance, while staying silent unless they find something actionable.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={features.heartbeatMaintenanceEnabled}
                    onChange={(e) =>
                      saveFeatures({
                        heartbeatMaintenanceEnabled: e.target.checked,
                      })
                    }
                    disabled={saving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          </div>

          <details
            className="memory-hub-advanced"
            open={advancedExpanded}
            onToggle={(event) => setAdvancedExpanded(event.currentTarget.open)}
          >
            <summary>
              <span>
                <strong>
                  {t("memoryHub.advanced.title", "Advanced memory controls")}
                </strong>
                <small>
                  {t(
                    "memoryHub.advanced.description",
                    "Recall layers, temporal knowledge, inspection metadata, and write approval.",
                  )}
                </small>
              </span>
              <span className="memory-hub-advanced-action">
                {advancedExpanded
                  ? t("memoryHub.advanced.collapse", "Hide settings")
                  : t("memoryHub.advanced.expand", "Show settings")}
              </span>
            </summary>
            <div className="memory-hub-setting-list memory-hub-advanced-content">
              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.checkpoints.title",
                        "Enable Checkpoint Capture",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.checkpoints.description",
                        "Writes structured summaries plus verbatim evidence packets on snapshots, periodic exchange checkpoints, and meaningful task completions.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.checkpointCaptureEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          checkpointCaptureEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.verbatimRecall.title",
                        "Enable Verbatim Recall",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.verbatimRecall.description",
                        "Exposes the quote-first recall lane so the agent can retrieve exact wording instead of summarized memory when precision matters.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.verbatimRecallEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          verbatimRecallEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.wakeUpLayers.title",
                        "Enable Wake-Up Layers",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.wakeUpLayers.description",
                        "Makes prompt-visible memory explicit: inject only L0 Identity and L1 Essential Story by default, while keeping L2 Topic Packs and L3 Deep Recall tool-driven.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.wakeUpLayersEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({ wakeUpLayersEnabled: e.target.checked })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.temporalKnowledge.title",
                        "Enable Temporal Knowledge",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.temporalKnowledge.description",
                        "Tracks start and end validity on KG edges so current context ignores stale facts while historical lookups can still recover past truths.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.temporalKnowledgeEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          temporalKnowledgeEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.structuredObservations.title",
                        "Enable Structured Memory Observations",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.structuredObservations.description",
                        "Stores inspectable sidecar metadata for memories without replacing the local archive.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.structuredObservationsEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          structuredObservationsEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.progressiveRecall.title",
                        "Enable Progressive Recall Tools",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.progressiveRecall.description",
                        "Adds index, timeline, and detail tools so agents retrieve memory in token-efficient stages.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.progressiveRecallToolsEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          progressiveRecallToolsEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.durableContext.title",
                        "Enable Durable Runtime Context",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.durableContext.description",
                        "Stores compacted task context with source links and exposes read-only context_grep and context_describe tools.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.durableContextEnabled === true}
                      onChange={(e) =>
                        saveFeatures({
                          durableContextEnabled: e.target.checked,
                          durableContextMode: e.target.checked
                            ? "experimental"
                            : "off",
                          checkpointCaptureEnabled: e.target.checked
                            ? true
                            : features.checkpointCaptureEnabled,
                          transcriptStoreEnabled: e.target.checked
                            ? true
                            : features.transcriptStoreEnabled,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <div className="memory-hub-toggle-row">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.inspector.enable",
                        "Enable Memory Inspector",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.inspector.enableDescription",
                        "Shows searchable observation metadata, provenance, privacy controls, and timeline context in Memory Hub.",
                      )}
                    </p>
                  </div>
                  <label className="settings-toggle memory-hub-toggle">
                    <input
                      type="checkbox"
                      checked={features.memoryInspectorEnabled !== false}
                      onChange={(e) =>
                        saveFeatures({
                          memoryInspectorEnabled: e.target.checked,
                        })
                      }
                      disabled={saving}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="settings-form-group">
                <label className="settings-label">
                  {t("memoryHub.writeApproval.title", "Memory Write Approval")}
                </label>
                <select
                  value={features.memoryWriteApprovalMode || "off"}
                  onChange={(e) =>
                    saveFeatures({
                      memoryWriteApprovalMode: e.target
                        .value as MemoryFeaturesSettings["memoryWriteApprovalMode"],
                    })
                  }
                  className="settings-select"
                  disabled={saving}
                >
                  <option value="off">{t("common.off", "Off")}</option>
                  <option value="curated_only">
                    {t(
                      "memoryHub.writeApproval.curatedOnly",
                      "Curated memory only",
                    )}
                  </option>
                  <option value="external_only">
                    {t(
                      "memoryHub.writeApproval.externalOnly",
                      "External memory only",
                    )}
                  </option>
                  <option value="background_only">
                    {t(
                      "memoryHub.writeApproval.backgroundOnly",
                      "Background writes only",
                    )}
                  </option>
                  <option value="all">
                    {t(
                      "memoryHub.writeApproval.all",
                      "All durable memory writes",
                    )}
                  </option>
                </select>
                <p className="settings-form-hint">
                  {t(
                    "memoryHub.writeApproval.description",
                    "Staged writes appear in the pending queue before they change hot memory, archive memory, or external memory providers.",
                  )}
                </p>
              </div>
            </div>
          </details>
        </div>
      )}

      {activeSection === "external" && (
        <div className="settings-subsection memory-hub-section-panel">
          <h3>{t("memoryHub.supermemory.title", "Supermemory")}</h3>
          <p className="settings-form-hint">
            {t(
              "memoryHub.supermemory.description",
              "External memory provider integration inspired by Hermes: workspace-scoped profile fetches, explicit search/remember/forget tools, and optional background mirroring of NeoWorker memory captures.",
            )}
          </p>

          <div className="settings-card memory-hub-external-card">
            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t("memoryHub.supermemory.enable", "Enable Supermemory")}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.supermemory.enableDescription",
                      "When enabled, NeoWorker can fetch scoped profile context from Supermemory and mirror non-private memory captures into the configured container.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={supermemoryEnabled}
                    onChange={(e) => setSupermemoryEnabled(e.target.checked)}
                    disabled={supermemorySaving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-field">
              <label>{t("common.apiKey", "API Key")}</label>
              <input
                type="password"
                className="settings-input"
                placeholder={
                  supermemoryStatus?.apiKeyConfigured
                    ? "••••••••••••••••"
                    : "sm_..."
                }
                value={supermemoryApiKey}
                onChange={(e) => setSupermemoryApiKey(e.target.value)}
              />
              <p className="settings-hint">
                {t("memoryHub.supermemory.apiKeyHint", "Get your API key from")}{" "}
                <a
                  href="https://console.supermemory.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  console.supermemory.ai
                </a>
              </p>
            </div>

            <div className="settings-field">
              <label>{t("common.baseUrl", "Base URL")}</label>
              <input
                className="settings-input"
                value={supermemoryBaseUrl}
                onChange={(e) => setSupermemoryBaseUrl(e.target.value)}
                placeholder="https://api.supermemory.ai"
              />
            </div>

            <div className="settings-field">
              <label>
                {t(
                  "memoryHub.supermemory.containerTagTemplate",
                  "Container Tag Template",
                )}
              </label>
              <input
                className="settings-input"
                value={supermemoryContainerTemplate}
                onChange={(e) =>
                  setSupermemoryContainerTemplate(e.target.value)
                }
                placeholder="neoworker:{workspaceId}"
              />
              <p className="settings-hint">
                {t("memoryHub.supermemory.templateHintPrefix", "Supports")}{" "}
                <code>{"{workspaceId}"}</code> {t("common.and", "and")}{" "}
                <code>{"{workspaceName}"}</code>.{" "}
                {t(
                  "memoryHub.supermemory.templateHintSuffix",
                  "The current workspace defaults to a scoped namespace like",
                )}{" "}
                <code>neoworker:&lt;workspace&gt;</code>.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px",
              }}
            >
              <div className="settings-field">
                <label>
                  {t("memoryHub.supermemory.searchMode", "Search Mode")}
                </label>
                <select
                  className="settings-select"
                  value={supermemorySearchMode}
                  onChange={(e) =>
                    setSupermemorySearchMode(
                      e.target.value as SupermemorySearchMode,
                    )
                  }
                >
                  <option value="hybrid">
                    {t("memoryHub.supermemory.mode.hybrid", "Hybrid")}
                  </option>
                  <option value="memories">
                    {t("memoryHub.supermemory.mode.memories", "Memories only")}
                  </option>
                </select>
              </div>

              <div className="settings-field">
                <label>
                  {t("memoryHub.supermemory.threshold", "Threshold")}
                </label>
                <input
                  className="settings-input"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={supermemoryThreshold}
                  onChange={(e) => setSupermemoryThreshold(e.target.value)}
                />
              </div>
            </div>

            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t(
                      "memoryHub.supermemory.injectProfile",
                      "Inject Supermemory Profile Into Prompts",
                    )}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.supermemory.injectProfileDescription",
                      "Fetches the workspace-scoped profile at prompt-build time and appends it as soft context for chat, execution, and follow-up turns.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={supermemoryIncludeProfile}
                    onChange={(e) =>
                      setSupermemoryIncludeProfile(e.target.checked)
                    }
                    disabled={supermemorySaving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t(
                      "memoryHub.supermemory.mirrorWrites",
                      "Mirror Memory Writes",
                    )}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.supermemory.mirrorWritesDescription",
                      "Mirrors non-private NeoWorker memory captures into Supermemory as indexed documents.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={supermemoryMirrorWrites}
                    onChange={(e) =>
                      setSupermemoryMirrorWrites(e.target.checked)
                    }
                    disabled={supermemorySaving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-form-group">
              <div className="memory-hub-toggle-row">
                <div className="memory-hub-grow">
                  <div className="memory-hub-primary-label">
                    {t("memoryHub.supermemory.rerank", "Rerank Search Results")}
                  </div>
                  <p className="settings-form-hint memory-hub-hint-tight">
                    {t(
                      "memoryHub.supermemory.rerankDescription",
                      "Uses Supermemory reranking to improve relevance for explicit search tool calls.",
                    )}
                  </p>
                </div>
                <label className="settings-toggle memory-hub-toggle">
                  <input
                    type="checkbox"
                    checked={supermemoryRerank}
                    onChange={(e) => setSupermemoryRerank(e.target.checked)}
                    disabled={supermemorySaving}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            <div className="settings-field">
              <label>
                {t(
                  "memoryHub.supermemory.customContainers",
                  "Custom Containers",
                )}
              </label>
              <textarea
                className="settings-textarea"
                rows={4}
                value={supermemoryCustomContainers}
                onChange={(e) => setSupermemoryCustomContainers(e.target.value)}
                placeholder={t(
                  "memoryHub.supermemory.customContainersPlaceholder",
                  "work | Work projects\npersonal | Personal context",
                )}
              />
              <p className="settings-hint">
                {t(
                  "memoryHub.supermemory.customContainersHint",
                  "Optional one container per line. Format:",
                )}{" "}
                <code>tag | description</code>.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
                marginTop: "8px",
              }}
            >
              <button
                className="settings-button primary"
                onClick={() => void saveSupermemorySettings()}
                disabled={supermemorySaving}
              >
                {supermemorySaving
                  ? t("common.saving", "Saving...")
                  : t(
                      "memoryHub.supermemory.save",
                      "Save Supermemory Settings",
                    )}
              </button>
              <button
                className="settings-button"
                onClick={() => void testSupermemoryConnection()}
                disabled={supermemoryTesting}
              >
                {supermemoryTesting
                  ? t("common.testing", "Testing...")
                  : t(
                      "memoryHub.supermemory.testConnection",
                      "Test Connection",
                    )}
              </button>
              {supermemoryStatus?.apiKeyConfigured && (
                <span className={badgeClass("success")}>
                  {t(
                    "memoryHub.supermemory.apiKeyConfigured",
                    "API key configured",
                  )}
                </span>
              )}
              {supermemoryStatus?.circuitBreakerUntil ? (
                <span className={badgeClass("warning")}>
                  {t(
                    "memoryHub.supermemory.pausedUntil",
                    "Paused until {time}",
                    {
                      time:
                        formatTimestamp(
                          supermemoryStatus.circuitBreakerUntil,
                        ) || t("memoryHub.supermemory.later", "later"),
                    },
                  )}
                </span>
              ) : null}
            </div>

            {supermemoryTestResult && (
              <div
                className={`settings-feedback ${supermemoryTestResult.success ? "success" : "error"} memory-hub-top-gap`}
              >
                {supermemoryTestResult.success
                  ? t(
                      "memoryHub.supermemory.testSucceeded",
                      "Supermemory connection succeeded.",
                    )
                  : supermemoryTestResult.error ||
                    t(
                      "memoryHub.supermemory.testFailed",
                      "Supermemory connection failed.",
                    )}
              </div>
            )}

            {supermemoryStatus?.lastError && (
              <p className="settings-form-hint memory-hub-top-gap">
                {t(
                  "memoryHub.supermemory.lastProviderError",
                  "Last provider error: {error}",
                  {
                    error: supermemoryStatus.lastError,
                  },
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {activeSection === "layers" && layerPreview && (
        <div className="settings-subsection memory-hub-section-panel">
          <h3>{t("memoryHub.wakeUpPreview.title", "Wake-Up Layers")}</h3>
          <p className="settings-form-hint">
            {t(
              "memoryHub.wakeUpPreview.description",
              "Preview of the current L0/L1 payload and the tool-driven layers kept out of default prompt injection.",
            )}
          </p>

          <div className="memory-layer-grid">
            {layerPreview.layers.map((layer) => (
              <div
                key={layer.layer}
                className="settings-card memory-layer-card"
              >
                <div className="memory-hub-row">
                  <div className="memory-hub-section-title">{layer.title}</div>
                  <span
                    className={badgeClass(
                      layer.injectedByDefault ? "success" : "neutral",
                    )}
                  >
                    {layer.injectedByDefault
                      ? t("memoryHub.wakeUpPreview.injected", "Injected")
                      : t("memoryHub.wakeUpPreview.toolDriven", "Tool-driven")}
                  </span>
                </div>
                <p className="settings-form-hint memory-hub-hint">
                  {layer.description}
                </p>
                <div className="memory-hub-caption">
                  {t(
                    "memoryHub.wakeUpPreview.tokensUsed",
                    "{count} tokens used",
                    {
                      count: layer.budget.usedTokens,
                    },
                  )}
                  {layer.budget.excludedCount > 0
                    ? ` • ${t(
                        "memoryHub.wakeUpPreview.fragmentsExcluded",
                        "{count} fragment(s) excluded by budget",
                        {
                          count: layer.budget.excludedCount,
                        },
                      )}`
                    : ""}
                </div>
                {layer.includedText ? (
                  <pre className="memory-layer-preview">
                    {layer.includedText}
                  </pre>
                ) : (
                  <div className="settings-empty memory-hub-top-gap">
                    {t(
                      "memoryHub.wakeUpPreview.noInlinePayload",
                      "No inline payload.",
                    )}
                  </div>
                )}
                {layer.excludedText && (
                  <div className="memory-layer-excluded">
                    {layer.excludedText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === "inspector" &&
        features.memoryInspectorEnabled !== false &&
        selectedWorkspaceId && (
          <div className="settings-subsection memory-hub-section-panel">
            <h3>{t("memoryHub.inspector.title", "Memory Inspector")}</h3>
            <p className="settings-form-hint">
              {t(
                "memoryHub.inspector.description",
                "Search structured memory observations, inspect provenance, and control what can be reused in future prompts.",
              )}
            </p>

            <div className="settings-card memory-inspector-status">
              <div className="memory-hub-row">
                <div className="memory-hub-section-title">
                  {t(
                    "memoryHub.inspector.observationMetadata",
                    "Observation metadata",
                  )}
                </div>
                <span
                  className={badgeClass(
                    observationBackfillStatus?.running ? "warning" : "success",
                  )}
                >
                  {observationBackfillStatus?.running
                    ? t("memoryHub.inspector.backfilling", "Backfilling")
                    : t("skillhub.status.ready", "Ready")}
                </span>
              </div>
              <div className="memory-hub-caption">
                {observationBackfillStatus
                  ? t(
                      "memoryHub.inspector.metadataProgress",
                      "{processed}/{total} processed • {failed} failed • {pending} pending",
                      {
                        processed: observationBackfillStatus.processed,
                        total: observationBackfillStatus.total,
                        failed: observationBackfillStatus.failed,
                        pending: observationBackfillStatus.pending,
                      },
                    )
                  : t(
                      "memoryHub.inspector.metadataUnavailable",
                      "Metadata status unavailable",
                    )}
              </div>
              <div className="memory-hub-chip-row memory-hub-top-gap">
                <button
                  className="settings-button"
                  disabled={observationBusy}
                  onClick={() => void rebuildObservationMetadata()}
                >
                  {t("memoryHub.inspector.rebuildMetadata", "Rebuild Metadata")}
                </button>
                <button
                  className="settings-button"
                  disabled={observationBusy}
                  onClick={() => void refreshObservationBackfillStatus()}
                >
                  {t("memoryHub.inspector.refreshStatus", "Refresh Status")}
                </button>
              </div>
            </div>

            <div className="settings-card memory-hub-top-gap memory-inspector-shell">
              <div className="memory-inspector-search">
                <input
                  className="settings-input"
                  value={observationQuery}
                  onChange={(event) => setObservationQuery(event.target.value)}
                  placeholder={t(
                    "memoryHub.inspector.searchPlaceholder",
                    "Search memories, files, tools, concepts",
                  )}
                />
                <select
                  className="settings-select"
                  value={observationPrivacy}
                  onChange={(event) =>
                    setObservationPrivacy(
                      event.target.value as
                        "all" | MemoryObservationPrivacyState,
                    )
                  }
                >
                  <option value="all">
                    {t("memoryHub.inspector.privacy.all", "All privacy")}
                  </option>
                  <option value="normal">
                    {t("memoryHub.inspector.privacy.normal", "Normal")}
                  </option>
                  <option value="private">
                    {t("memoryHub.inspector.privacy.private", "Private")}
                  </option>
                  <option value="redacted">
                    {t("memoryHub.inspector.privacy.redacted", "Redacted")}
                  </option>
                  <option value="suppressed">
                    {t("memoryHub.inspector.privacy.suppressed", "Suppressed")}
                  </option>
                </select>
                <button
                  className="settings-button primary"
                  disabled={observationLoading}
                  onClick={() => void searchObservations()}
                >
                  {observationLoading
                    ? t("memoryHub.inspector.searching", "Searching...")
                    : t("common.search", "Search")}
                </button>
              </div>

              <div className="memory-inspector-layout">
                <div className="memory-hub-column memory-inspector-results">
                  {observationResults.length === 0 ? (
                    <div className="settings-empty">
                      {t(
                        "memoryHub.inspector.empty",
                        "No memory observations found.",
                      )}
                    </div>
                  ) : (
                    observationResults.map((result) => (
                      <button
                        key={result.memoryId}
                        className={`settings-card memory-observation-result${
                          selectedObservationId === result.memoryId
                            ? " is-selected"
                            : ""
                        }`}
                        onClick={() => void loadObservation(result.memoryId)}
                      >
                        <div className="memory-hub-row memory-inspector-item-header">
                          <div className="memory-hub-primary-label memory-inspector-title">
                            {result.title}
                          </div>
                          <span
                            className={badgeClass(
                              result.privacyState === "normal"
                                ? "neutral"
                                : "warning",
                            )}
                          >
                            {result.privacyState}
                          </span>
                        </div>
                        <div className="memory-hub-caption">
                          {result.sourceLabel} • {result.observationType} •{" "}
                          {formatTimestamp(result.createdAt) ||
                            t(
                              "memoryHub.common.unknownDate",
                              "unknown date",
                            )}{" "}
                          •{" "}
                          {t("memory.tokensCount", "{count} tokens", {
                            count: result.estimatedDetailTokens,
                          })}
                        </div>
                        <div className="memory-hub-text-block-primary memory-inspector-snippet">
                          {result.snippet}
                        </div>
                        {result.concepts.length > 0 && (
                          <div className="memory-hub-chip-row memory-inspector-chip-row">
                            {result.concepts.slice(0, 4).map((concept) => (
                              <span
                                key={concept}
                                className={badgeClass("neutral")}
                              >
                                {concept}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>

                <div className="settings-card memory-observation-detail">
                  {selectedObservation ? (
                    <>
                      <div className="memory-hub-row memory-inspector-item-header">
                        <div className="memory-inspector-detail-heading">
                          <div className="memory-hub-section-title memory-inspector-detail-title">
                            {selectedObservation.title}
                          </div>
                          <div className="memory-hub-caption">
                            {selectedObservation.origin} •{" "}
                            {selectedObservation.observationType} •{" "}
                            {formatTimestamp(
                              selectedObservation.memoryCreatedAt,
                            ) ||
                              t("memoryHub.common.unknownDate", "unknown date")}
                          </div>
                        </div>
                        <span
                          className={badgeClass(
                            selectedObservation.privacyState === "normal"
                              ? "success"
                              : "warning",
                          )}
                        >
                          {selectedObservation.privacyState}
                        </span>
                      </div>
                      <div className="memory-hub-top-gap">
                        <input
                          className="settings-input"
                          value={observationEditTitle}
                          onChange={(event) =>
                            setObservationEditTitle(event.target.value)
                          }
                          placeholder={t(
                            "memoryHub.inspector.observationTitlePlaceholder",
                            "Observation title",
                          )}
                        />
                        <textarea
                          className="settings-textarea memory-hub-top-gap memory-inspector-textarea"
                          rows={4}
                          value={observationEditNarrative}
                          onChange={(event) =>
                            setObservationEditNarrative(event.target.value)
                          }
                          placeholder={t(
                            "memoryHub.inspector.observationNarrativePlaceholder",
                            "Observation narrative",
                          )}
                        />
                        <div className="memory-hub-chip-row">
                          <button
                            className="settings-button"
                            disabled={observationBusy}
                            onClick={() => void saveObservationMetadata()}
                          >
                            {t(
                              "memoryHub.inspector.saveMetadata",
                              "Save Metadata",
                            )}
                          </button>
                        </div>
                      </div>
                      {selectedObservation.facts.length > 0 && (
                        <div className="memory-hub-top-gap">
                          <div className="memory-hub-primary-label">
                            {t("memoryHub.inspector.facts", "Facts")}
                          </div>
                          <ul className="memory-hub-text-block-primary memory-inspector-facts">
                            {selectedObservation.facts.map((fact) => (
                              <li key={fact}>{fact}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="memory-hub-chip-row">
                        <button
                          className="settings-button"
                          disabled={observationBusy}
                          onClick={() => void promoteObservation()}
                        >
                          {t("memoryHub.inspector.promote", "Promote")}
                        </button>
                        <button
                          className="settings-button"
                          disabled={observationBusy}
                          onClick={() =>
                            void updateObservationPrivacy("private")
                          }
                        >
                          {t("memoryHub.inspector.markPrivate", "Mark Private")}
                        </button>
                        <button
                          className="settings-button"
                          disabled={observationBusy}
                          onClick={() =>
                            void updateObservationPrivacy("suppressed")
                          }
                        >
                          {t(
                            "memoryHub.inspector.suppressRecall",
                            "Suppress Recall",
                          )}
                        </button>
                        <button
                          className="settings-button"
                          disabled={observationBusy}
                          onClick={() => void redactObservation()}
                        >
                          {t("memoryHub.inspector.redact", "Redact")}
                        </button>
                        <button
                          className="settings-button danger"
                          disabled={observationBusy}
                          onClick={() => void deleteObservation()}
                        >
                          {t("common.delete", "Delete")}
                        </button>
                      </div>

                      <div className="memory-hub-top-gap">
                        <div className="memory-hub-primary-label">
                          {t("memoryHub.inspector.timeline", "Timeline")}
                        </div>
                        <div className="memory-hub-column">
                          {observationTimeline.map((entry) => (
                            <div
                              key={entry.memoryId}
                              className="settings-card memory-inspector-timeline-card"
                            >
                              <div className="memory-hub-row memory-inspector-item-header">
                                <span className="memory-inspector-title">
                                  {entry.title}
                                </span>
                                {entry.isAnchor && (
                                  <span className={badgeClass("success")}>
                                    {t("memoryHub.inspector.anchor", "Anchor")}
                                  </span>
                                )}
                              </div>
                              <div className="memory-hub-caption">
                                {formatTimestamp(entry.createdAt) ||
                                  t(
                                    "memoryHub.common.unknownDate",
                                    "unknown date",
                                  )}{" "}
                                • {entry.sourceLabel}
                              </div>
                              <div className="memory-hub-text-block-primary memory-inspector-snippet">
                                {entry.snippet}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="settings-empty">
                      {t(
                        "memoryHub.inspector.selectObservation",
                        "Select a memory observation to inspect.",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      {activeSection === "layers" && awarenessConfig && (
        <div className="settings-subsection memory-hub-section-panel">
          <h3>{t("memoryHub.awareness.title", "Ambient Awareness")}</h3>
          <p className="settings-form-hint">
            {t(
              "memoryHub.awareness.description",
              "Control which local signals NeoWorker can observe, promote into durable beliefs, inject into prompts, and use for heartbeats.",
            )}
          </p>

          <div className="settings-form-group">
            <div className="memory-hub-toggle-row">
              <div className="memory-hub-grow">
                <div className="memory-hub-primary-label">
                  {t("memoryHub.privateMode.title", "Private Mode")}
                </div>
                <p className="settings-form-hint memory-hub-hint-tight">
                  {t(
                    "memoryHub.privateMode.description",
                    "Suspends higher-sensitivity collectors like browser, clipboard, and notifications while keeping task execution available.",
                  )}
                </p>
              </div>
              <label className="settings-toggle memory-hub-toggle">
                <input
                  type="checkbox"
                  checked={awarenessConfig.privateModeEnabled}
                  onChange={(e) =>
                    void saveAwarenessConfig({
                      ...awarenessConfig,
                      privateModeEnabled: e.target.checked,
                    })
                  }
                  disabled={awarenessSaving}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          <div className="awareness-grid">
            <div className="awareness-grid-header">
              <div>{t("common.source", "Source")}</div>
              <div>{t("common.enabled", "Enabled")}</div>
              <div>{t("memoryHub.awareness.promote", "Promote")}</div>
              <div>{t("memoryHub.awareness.inject", "Inject")}</div>
              <div>{t("memoryHub.awareness.heartbeat", "Heartbeat")}</div>
              <div>{t("memoryHub.awareness.ttlMinutes", "TTL (min)")}</div>
            </div>
            {Object.entries(awarenessConfig.sources).map(([source, policy]) => (
              <div key={source} className="awareness-grid-row">
                <div>
                  <div className="memory-hub-section-title">{source}</div>
                  <div className="memory-hub-inline-secondary-gap">
                    {t("memoryHub.awareness.ttlValue", "TTL {minutes} min", {
                      minutes: policy.ttlMinutes,
                    })}
                  </div>
                </div>
                <label
                  className="settings-toggle"
                  title={t("common.enabled", "Enabled")}
                >
                  <input
                    type="checkbox"
                    checked={policy.enabled}
                    onChange={(e) =>
                      void updateAwarenessSource(source as AwarenessSource, {
                        enabled: e.target.checked,
                      })
                    }
                    disabled={awarenessSaving}
                  />
                  <span className="toggle-slider" />
                </label>
                <label
                  className="settings-toggle"
                  title={t(
                    "memoryHub.awareness.promoteTooltip",
                    "Promote to beliefs",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={policy.allowPromotion}
                    onChange={(e) =>
                      void updateAwarenessSource(source as AwarenessSource, {
                        allowPromotion: e.target.checked,
                      })
                    }
                    disabled={awarenessSaving}
                  />
                  <span className="toggle-slider" />
                </label>
                <label
                  className="settings-toggle"
                  title={t(
                    "memoryHub.awareness.injectTooltip",
                    "Inject into prompts",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={policy.allowPromptInjection}
                    onChange={(e) =>
                      void updateAwarenessSource(source as AwarenessSource, {
                        allowPromptInjection: e.target.checked,
                      })
                    }
                    disabled={awarenessSaving}
                  />
                  <span className="toggle-slider" />
                </label>
                <label
                  className="settings-toggle"
                  title={t(
                    "memoryHub.awareness.heartbeatTooltip",
                    "Use for heartbeat",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={policy.allowHeartbeat}
                    onChange={(e) =>
                      void updateAwarenessSource(source as AwarenessSource, {
                        allowHeartbeat: e.target.checked,
                      })
                    }
                    disabled={awarenessSaving}
                  />
                  <span className="toggle-slider" />
                </label>
                <input
                  className="settings-input"
                  type="number"
                  min={5}
                  max={24 * 60}
                  value={policy.ttlMinutes}
                  onChange={(e) =>
                    void updateAwarenessSource(source as AwarenessSource, {
                      ttlMinutes: Math.max(5, Number(e.target.value) || 5),
                    })
                  }
                  disabled={awarenessSaving}
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            <div className="settings-card">
              <div className="memory-hub-section-title">
                {t(
                  "memoryHub.awareness.beliefsTitle",
                  "What NeoWorker Currently Believes",
                )}
              </div>
              <p className="settings-form-hint memory-hub-hint">
                {t(
                  "memoryHub.awareness.beliefsDescription",
                  "Stable beliefs promoted from conversation and local computer context.",
                )}
              </p>
              {awarenessBeliefs.length === 0 ? (
                <div className="settings-empty">
                  {t(
                    "memoryHub.awareness.emptyBeliefs",
                    "No promoted beliefs yet for this workspace.",
                  )}
                </div>
              ) : (
                <div className="memory-hub-column">
                  {awarenessBeliefs.slice(0, 12).map((belief) => (
                    <div key={belief.id} className="settings-card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <div className="memory-hub-primary-label">
                          {belief.subject}
                        </div>
                        <span
                          className={badgeClass(
                            belief.promotionStatus === "confirmed"
                              ? "success"
                              : "neutral",
                          )}
                        >
                          {belief.promotionStatus}
                        </span>
                      </div>
                      <div className="memory-hub-text-block-primary">
                        {belief.value}
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          color: "var(--color-text-secondary)",
                          fontSize: "11px",
                        }}
                      >
                        <span>{belief.beliefType}</span>
                        <span>
                          {t(
                            "memoryHub.common.confidence",
                            "confidence {value}",
                            {
                              value: formatConfidence(belief.confidence),
                            },
                          )}
                        </span>
                        <span>
                          {t(
                            "memoryHub.common.sourceValue",
                            "source {source}",
                            {
                              source: belief.source,
                            },
                          )}
                        </span>
                      </div>
                      <div className="memory-hub-chip-row">
                        <button
                          className="settings-button"
                          onClick={() =>
                            void updateBelief(belief, {
                              promotionStatus: "confirmed",
                              confidence: 1,
                            })
                          }
                        >
                          {t("common.confirm", "Confirm")}
                        </button>
                        <button
                          className="settings-button"
                          onClick={() =>
                            void updateBelief(belief, {
                              confidence: Math.max(
                                0.1,
                                belief.confidence - 0.15,
                              ),
                            })
                          }
                        >
                          {t(
                            "memoryHub.awareness.lowerConfidence",
                            "Lower confidence",
                          )}
                        </button>
                        <button
                          className="settings-button"
                          onClick={() => void deleteBelief(belief.id)}
                        >
                          {t("memory.relationship.forget", "Forget")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-card">
              <div className="memory-hub-section-title">
                {t(
                  "memoryHub.awareness.summaryTitle",
                  "Current Awareness Summary",
                )}
              </div>
              <p className="settings-form-hint memory-hub-hint">
                {t(
                  "memoryHub.awareness.summaryDescription",
                  "Live summary of focus, high-signal context changes, and due-soon items.",
                )}
              </p>
              <div className="memory-hub-inline-primary">
                <strong>
                  {t("memoryHub.awareness.currentFocus", "Current focus:")}
                </strong>{" "}
                {awarenessSummary?.currentFocus ||
                  t("common.unknown", "Unknown")}
              </div>
              <div className="memory-hub-top-gap">
                <div className="memory-hub-primary-label">
                  {t("memoryHub.awareness.whatMattersNow", "What matters now")}
                </div>
                {(awarenessSummary?.whatMattersNow || [])
                  .slice(0, 5)
                  .map((item) => (
                    <div key={item.id} className="memory-hub-text-block">
                      <div className="memory-hub-text-primary">
                        {item.title}
                      </div>
                      {item.detail && (
                        <div className="memory-hub-inline-secondary-top">
                          {item.detail}
                        </div>
                      )}
                    </div>
                  ))}
                {(awarenessSummary?.whatMattersNow || []).length === 0 && (
                  <p className="settings-form-hint">
                    {t(
                      "memoryHub.awareness.emptyHighSignal",
                      "No current high-signal awareness items.",
                    )}
                  </p>
                )}
              </div>
              <div className="memory-hub-top-gap-md">
                <div className="memory-hub-primary-label">
                  {t("memoryHub.awareness.dueSoon", "Due soon")}
                </div>
                {(awarenessSummary?.dueSoon || []).slice(0, 5).map((item) => (
                  <div key={item.id} className="memory-hub-text-block">
                    <div className="memory-hub-text-primary">{item.title}</div>
                    {item.detail && (
                      <div className="memory-hub-inline-secondary-top">
                        {item.detail}
                      </div>
                    )}
                  </div>
                ))}
                {(awarenessSummary?.dueSoon || []).length === 0 && (
                  <p className="settings-form-hint">
                    {t(
                      "memoryHub.awareness.emptyDueSoon",
                      "No due-soon signals right now.",
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {autonomyConfig && (
            <div className="memory-hub-top-gap-md">
              <div className="settings-card">
                <div className="memory-hub-section-title">
                  {t("memoryHub.autonomy.title", "Chief of Staff Mode")}
                </div>
                <p className="settings-form-hint memory-hub-hint">
                  {t(
                    "memoryHub.autonomy.description",
                    "Controls goal-driven planning, intervention generation, and bounded local execution.",
                  )}
                </p>
                <div className="memory-hub-grid">
                  <div className="memory-hub-row-center">
                    <span className="memory-hub-inline-primary-sm">
                      {t(
                        "memoryHub.autonomy.enableEngine",
                        "Enable chief-of-staff engine",
                      )}
                    </span>
                    <label className="settings-toggle memory-hub-toggle-shrink">
                      <input
                        type="checkbox"
                        checked={autonomyConfig.enabled}
                        onChange={(e) =>
                          void saveAutonomyConfig({
                            ...autonomyConfig,
                            enabled: e.target.checked,
                          })
                        }
                        disabled={autonomySaving}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div className="memory-hub-row-center">
                    <span className="memory-hub-inline-primary-sm">
                      {t(
                        "memoryHub.autonomy.autoEvaluate",
                        "Auto-evaluate on ambient changes",
                      )}
                    </span>
                    <label className="settings-toggle memory-hub-toggle-shrink">
                      <input
                        type="checkbox"
                        checked={autonomyConfig.autoEvaluate}
                        onChange={(e) =>
                          void saveAutonomyConfig({
                            ...autonomyConfig,
                            autoEvaluate: e.target.checked,
                          })
                        }
                        disabled={autonomySaving}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {Object.entries(autonomyConfig.actionPolicies).map(
                      ([actionType, policy]) => (
                        <div key={actionType} className="settings-card">
                          <div className="memory-hub-primary-label">
                            {actionType}
                          </div>
                          <div className="memory-hub-top-gap-sm">
                            <select
                              className="settings-select"
                              value={policy.level}
                              onChange={(e) =>
                                void saveAutonomyConfig({
                                  ...autonomyConfig,
                                  actionPolicies: {
                                    ...autonomyConfig.actionPolicies,
                                    [actionType]: {
                                      ...policy,
                                      level: e.target
                                        .value as typeof policy.level,
                                    },
                                  },
                                })
                              }
                              disabled={autonomySaving}
                            >
                              <option value="observe_only">
                                {t(
                                  "memoryHub.autonomy.level.observeOnly",
                                  "Observe only",
                                )}
                              </option>
                              <option value="suggest_only">
                                {t(
                                  "memoryHub.autonomy.level.suggestOnly",
                                  "Suggest only",
                                )}
                              </option>
                              <option value="execute_local">
                                {t(
                                  "memoryHub.autonomy.level.executeLocal",
                                  "Execute local",
                                )}
                              </option>
                              <option value="execute_with_approval">
                                {t(
                                  "memoryHub.autonomy.level.approvalRequired",
                                  "Approval required",
                                )}
                              </option>
                              <option value="never">
                                {t("common.never", "Never")}
                              </option>
                            </select>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                  <div className="memory-hub-stack-gap">
                    <button
                      className="settings-button"
                      onClick={() => void refreshAutonomy()}
                      disabled={autonomySaving}
                    >
                      {t("memoryHub.action.refreshState", "Refresh state")}
                    </button>
                    <button
                      className="settings-button primary"
                      onClick={async () => {
                        await window.electronAPI.triggerAutonomyEvaluation(
                          selectedWorkspaceId,
                        );
                        await refreshAutonomy();
                      }}
                      disabled={autonomySaving}
                    >
                      {t("memoryHub.autonomy.evaluateNow", "Evaluate now")}
                    </button>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "12px",
                  marginTop: "12px",
                }}
              >
                <div className="settings-card">
                  <div className="memory-hub-section-title">
                    {t("memoryHub.autonomy.worldModel", "World Model")}
                  </div>
                  <p className="settings-form-hint memory-hub-hint">
                    {t(
                      "memoryHub.autonomy.worldModelDescription",
                      "What NeoWorker thinks is active right now.",
                    )}
                  </p>
                  <div className="memory-hub-inline-primary">
                    <strong>{t("memoryHub.autonomy.focus", "Focus:")}</strong>{" "}
                    {autonomyState?.focusSession?.focusLabel ||
                      t("common.unknown", "Unknown")}
                  </div>
                  <div className="memory-hub-top-gap">
                    <div className="memory-hub-primary-label">
                      {t("memoryHub.autonomy.goals", "Goals")}
                    </div>
                    {(autonomyState?.goals || []).slice(0, 4).map((goal) => (
                      <div key={goal.id} className="memory-hub-text-block">
                        <div>{goal.title}</div>
                        <div className="memory-hub-text-secondary">
                          {goal.status} •{" "}
                          {t(
                            "memoryHub.common.confidence",
                            "confidence {value}",
                            {
                              value: formatConfidence(goal.confidence),
                            },
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="memory-hub-top-gap">
                    <div className="memory-hub-primary-label">
                      {t("memoryHub.autonomy.openLoops", "Open loops")}
                    </div>
                    {(autonomyState?.openLoops || [])
                      .slice(0, 4)
                      .map((loop) => (
                        <div key={loop.id} className="memory-hub-text-block">
                          <div>{loop.title}</div>
                          <div className="memory-hub-text-secondary">
                            {loop.dueAt
                              ? formatTimestamp(loop.dueAt)
                              : t(
                                  "memoryHub.autonomy.noDueDate",
                                  "No due date",
                                )}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="memory-hub-top-gap">
                    <div className="memory-hub-primary-label">
                      {t("memoryHub.autonomy.routines", "Routines")}
                    </div>
                    {(autonomyState?.routines || [])
                      .slice(0, 3)
                      .map((routine) => (
                        <div key={routine.id} className="memory-hub-text-block">
                          <div>{routine.title}</div>
                          <div className="memory-hub-text-secondary">
                            {routine.description}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="settings-card">
                  <div className="memory-hub-section-title">
                    {t(
                      "memoryHub.autonomy.pendingInterventions",
                      "Pending Interventions",
                    )}
                  </div>
                  <p className="settings-form-hint memory-hub-hint">
                    {t(
                      "memoryHub.autonomy.pendingDescription",
                      "What chief-of-staff mode wants to do next and why.",
                    )}
                  </p>
                  {(autonomyDecisions || []).slice(0, 8).map((decision) => (
                    <div
                      key={decision.id}
                      className="settings-card memory-hub-top-gap-sm"
                    >
                      <div className="memory-hub-row">
                        <div className="memory-hub-primary-label">
                          {decision.title}
                        </div>
                        <span
                          className={badgeClass(
                            decision.priority === "high"
                              ? "warning"
                              : "neutral",
                          )}
                        >
                          {decision.status}
                        </span>
                      </div>
                      <div className="memory-hub-text-block-primary">
                        {decision.description}
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          fontSize: "11px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {decision.actionType} • {decision.policyLevel} •{" "}
                        {decision.reason}
                      </div>
                      <div className="memory-hub-chip-row">
                        {decision.status !== "done" && (
                          <button
                            className="settings-button"
                            onClick={() =>
                              void updateDecision(decision.id, {
                                status: "done",
                              })
                            }
                          >
                            {t("memoryHub.autonomy.markDone", "Mark done")}
                          </button>
                        )}
                        {decision.status !== "dismissed" && (
                          <button
                            className="settings-button"
                            onClick={() =>
                              void updateDecision(decision.id, {
                                status: "dismissed",
                              })
                            }
                          >
                            {t("common.dismiss", "Dismiss")}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {autonomyDecisions.length === 0 && (
                    <div className="settings-empty">
                      {t(
                        "memoryHub.autonomy.emptyInterventions",
                        "No pending chief-of-staff interventions.",
                      )}
                    </div>
                  )}
                </div>

                <div className="settings-card">
                  <div className="memory-hub-section-title">
                    {t("memoryHub.autonomy.recentActions", "Recent Actions")}
                  </div>
                  <p className="settings-form-hint memory-hub-hint">
                    {t(
                      "memoryHub.autonomy.recentActionsDescription",
                      "Local actions the engine already attempted.",
                    )}
                  </p>
                  {(autonomyActions || []).slice(0, 8).map((action) => (
                    <div key={action.id} className="memory-hub-text-block">
                      <div className="memory-hub-text-primary">
                        {action.summary}
                      </div>
                      <div className="memory-hub-text-secondary">
                        {action.actionType} • {action.status} •{" "}
                        {formatTimestamp(action.createdAt)}
                      </div>
                    </div>
                  ))}
                  {autonomyActions.length === 0 && (
                    <div className="settings-empty">
                      {t(
                        "memoryHub.autonomy.emptyActions",
                        "No recent chief-of-staff actions yet.",
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeSection === "workspace" && (
        <div className="settings-subsection memory-hub-section-panel">
          <h3>{t("memoryHub.workspace.title", "Per Workspace")}</h3>

          {workspaces.length === 0 ? (
            <p className="settings-form-hint">
              {t("memoryHub.workspace.empty", "No workspaces found.")}
            </p>
          ) : (
            <div className="settings-form-group">
              <label className="settings-label">
                {t("common.workspace", "Workspace")}
              </label>
              <select
                value={selectedWorkspaceId}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                className="settings-select"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {selectedWorkspace?.path && (
                <p className="settings-form-hint">
                  {t("memoryHub.workspace.path", "Path:")}{" "}
                  <code>{selectedWorkspace.path}</code>
                </p>
              )}
              <div className="memory-hub-top-gap">
                <label className="settings-label">
                  {t("memoryHub.workspace.kitPreset", "Kit Preset")}
                </label>
                <select
                  value={kitPreset}
                  onChange={(e) =>
                    setKitPreset(
                      e.target.value === "venture_operator"
                        ? "venture_operator"
                        : "default",
                    )
                  }
                  className="settings-select"
                >
                  <option value="default">
                    {t(
                      "memoryHub.workspace.defaultKit",
                      "Default workspace kit",
                    )}
                  </option>
                  <option value="venture_operator">
                    {t(
                      "memoryHub.workspace.ventureKit",
                      "Venture operator kit",
                    )}
                  </option>
                </select>
                <p className="settings-form-hint">
                  {t(
                    "memoryHub.workspace.ventureKitHint",
                    "Venture operator mode seeds company, KPI, and operating-loop files for founder-led autonomous workflows.",
                  )}
                </p>
              </div>
            </div>
          )}

          {selectedWorkspaceId && (
            <div className="settings-form-group memory-hub-top-gap">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                }}
              >
                <div>
                  <div className="memory-hub-primary-label">
                    {t("memoryHub.workspaceKit.title", "Workspace Kit")}
                  </div>
                  <p className="settings-form-hint" style={{ margin: 0 }}>
                    {t(
                      "memoryHub.workspaceKit.descriptionPrefix",
                      "Creates recommended",
                    )}{" "}
                    <code>.neoworker/</code>{" "}
                    {t(
                      "memoryHub.workspaceKit.descriptionSuffix",
                      "files for shared, durable context.",
                    )}
                  </p>
                </div>
                <div className="memory-hub-stack-gap">
                  <button
                    className="settings-button"
                    onClick={() => void refreshKit()}
                    disabled={kitLoading || kitBusy}
                  >
                    {kitLoading
                      ? t("common.refreshing", "Refreshing...")
                      : t("common.refresh", "Refresh")}
                  </button>
                  <button
                    className="settings-button primary"
                    onClick={() => void initKit()}
                    disabled={kitBusy}
                  >
                    {kitBusy
                      ? t("common.working", "Working…")
                      : t("memoryHub.workspace.initialize", "Initialize")}
                  </button>
                </div>
              </div>

              {kitStatus && (
                <div className="memory-hub-top-gap">
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                  >
                    <span
                      className={badgeClass(
                        kitStatus.hasKitDir ? "success" : "warning",
                      )}
                    >
                      {kitStatus.hasKitDir
                        ? t(
                            "memoryHub.workspace.neoworkerReady",
                            ".neoworker ready",
                          )
                        : t(
                            "memoryHub.workspace.neoworkerMissing",
                            ".neoworker missing",
                          )}
                    </span>
                    <span
                      className={badgeClass(
                        kitStatus.missingCount > 0 ? "error" : "success",
                      )}
                    >
                      {t(
                        "memoryHub.workspace.missingCount",
                        "{count} missing",
                        {
                          count: kitStatus.missingCount,
                        },
                      )}
                    </span>
                    <span
                      className={badgeClass(
                        kitHealth.errorCount > 0 ? "error" : "neutral",
                      )}
                    >
                      {t(
                        "memoryHub.workspace.lintErrors",
                        "{count} lint error(s)",
                        {
                          count: kitHealth.errorCount,
                        },
                      )}
                    </span>
                    <span
                      className={badgeClass(
                        kitHealth.warningCount > 0 ? "warning" : "neutral",
                      )}
                    >
                      {t("memoryHub.workspace.warnings", "{count} warning(s)", {
                        count: kitHealth.warningCount,
                      })}
                    </span>
                    <span
                      className={badgeClass(
                        kitHealth.staleCount > 0 ? "warning" : "neutral",
                      )}
                    >
                      {t("memoryHub.workspace.staleCount", "{count} stale", {
                        count: kitHealth.staleCount,
                      })}
                    </span>
                    {kitStatus.onboarding && (
                      <span
                        className={badgeClass(
                          kitStatus.onboarding.onboardingCompletedAt
                            ? "success"
                            : kitStatus.onboarding.bootstrapPresent
                              ? "warning"
                              : "neutral",
                        )}
                      >
                        {kitStatus.onboarding.onboardingCompletedAt
                          ? t(
                              "memoryHub.workspace.onboardingCompleted",
                              "Onboarding completed",
                            )
                          : kitStatus.onboarding.bootstrapPresent
                            ? t(
                                "memoryHub.workspace.bootstrapActive",
                                "Bootstrap active",
                              )
                            : t(
                                "memoryHub.workspace.bootstrapMissing",
                                "Bootstrap missing",
                              )}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <div>
                      {kitStatus.workspacePath
                        ? t("memoryHub.workspace.pathValue", "Path: {path}", {
                            path: kitStatus.workspacePath,
                          })
                        : ""}
                    </div>
                    <div>
                      {kitStatus.onboarding?.bootstrapSeededAt
                        ? t(
                            "memoryHub.workspace.bootstrapSeeded",
                            "Bootstrap seeded {time}",
                            {
                              time:
                                formatTimestamp(
                                  kitStatus.onboarding.bootstrapSeededAt,
                                ) || "",
                            },
                          )
                        : t(
                            "memoryHub.workspace.bootstrapNotSeeded",
                            "Bootstrap not yet seeded",
                          )}
                    </div>
                  </div>

                  {kitStatus.files.length > 0 && (
                    <details className="memory-hub-top-gap-sm">
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "12px",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {t(
                          "memoryHub.workspace.showKitFiles",
                          "Show kit files",
                        )}
                      </summary>
                      <div
                        className="memory-list"
                        style={{ marginTop: "8px", maxHeight: "none" }}
                      >
                        {kitStatus.files.map((f) => {
                          const warningCount =
                            f.issues?.filter(
                              (issue) => issue.level === "warning",
                            ).length || 0;
                          const errorCount =
                            f.issues?.filter((issue) => issue.level === "error")
                              .length || 0;
                          const modifiedAt = formatTimestamp(f.modifiedAt);
                          const sizeLabel = formatBytes(f.sizeBytes);
                          const metadata = [
                            f.title,
                            modifiedAt
                              ? t(
                                  "memoryHub.workspace.updatedAt",
                                  "updated {time}",
                                  { time: modifiedAt },
                                )
                              : null,
                            sizeLabel,
                            typeof f.revisionCount === "number"
                              ? t(
                                  "memoryHub.workspace.revisions",
                                  "{count} revision(s)",
                                  {
                                    count: f.revisionCount,
                                  },
                                )
                              : null,
                          ].filter(Boolean);

                          return (
                            <div
                              key={f.relPath}
                              className="memory-list-item"
                              style={{ fontSize: "12px" }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                  alignItems: "flex-start",
                                }}
                              >
                                <div className="memory-hub-grow">
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <code
                                      style={{
                                        color: "var(--color-text-primary)",
                                      }}
                                    >
                                      {f.relPath}
                                    </code>
                                    {f.specialHandling === "heartbeat" && (
                                      <span className={badgeClass("warning")}>
                                        heartbeat
                                      </span>
                                    )}
                                    {f.specialHandling === "bootstrap" && (
                                      <span className={badgeClass("neutral")}>
                                        bootstrap
                                      </span>
                                    )}
                                    {f.specialHandling === "design-system" && (
                                      <span className={badgeClass("neutral")}>
                                        design
                                      </span>
                                    )}
                                  </div>
                                  {metadata.length > 0 && (
                                    <div
                                      style={{
                                        marginTop: "6px",
                                        color: "var(--color-text-secondary)",
                                        display: "flex",
                                        gap: "8px",
                                        flexWrap: "wrap",
                                      }}
                                    >
                                      {metadata.map((item) => (
                                        <span key={`${f.relPath}:${item}`}>
                                          {item}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {f.issues && f.issues.length > 0 && (
                                    <ul
                                      style={{
                                        marginTop: "8px",
                                        marginBottom: 0,
                                        paddingLeft: "18px",
                                        color: "var(--color-text-secondary)",
                                      }}
                                    >
                                      {f.issues.map((issue) => (
                                        <li
                                          key={`${f.relPath}:${issue.code}:${issue.message}`}
                                        >
                                          <strong
                                            style={{
                                              color:
                                                issue.level === "error"
                                                  ? "var(--color-error, #ef4444)"
                                                  : "var(--color-warning, #f59e0b)",
                                            }}
                                          >
                                            {issue.code}
                                          </strong>{" "}
                                          {issue.message}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "6px",
                                    justifyContent: "flex-end",
                                    maxWidth: "40%",
                                  }}
                                >
                                  <span
                                    className={badgeClass(
                                      f.exists ? "success" : "error",
                                    )}
                                  >
                                    {f.exists ? "OK" : "MISSING"}
                                  </span>
                                  {f.stale && (
                                    <span className={badgeClass("warning")}>
                                      stale
                                    </span>
                                  )}
                                  {errorCount > 0 && (
                                    <span className={badgeClass("error")}>
                                      {t(
                                        "memoryHub.workspace.errorCount",
                                        "{count} error(s)",
                                        {
                                          count: errorCount,
                                        },
                                      )}
                                    </span>
                                  )}
                                  {warningCount > 0 && (
                                    <span className={badgeClass("warning")}>
                                      {t(
                                        "memoryHub.workspace.warnings",
                                        "{count} warning(s)",
                                        {
                                          count: warningCount,
                                        },
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div
                style={{
                  marginTop: "12px",
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                }}
              >
                <input
                  className="settings-input"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  placeholder={t(
                    "memoryHub.workspace.newProjectPlaceholder",
                    "New project id (e.g. website-redesign)",
                  )}
                  style={{ flex: 1 }}
                />
                <button
                  className="settings-button"
                  onClick={() => void createProject()}
                  disabled={kitBusy || !newProjectId.trim()}
                >
                  {t("memoryHub.workspace.createProject", "Create project")}
                </button>
              </div>

              <div
                style={{
                  marginTop: "10px",
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="settings-button"
                  onClick={() =>
                    void window.electronAPI.openWorkspaceKitFile({
                      workspaceId: selectedWorkspaceId,
                      relPath: ".neoworker/USER.md",
                    })
                  }
                  disabled={!selectedWorkspaceId || kitBusy}
                >
                  {t("memoryHub.openUserMd", "Open USER.md")}
                </button>
                <button
                  className="settings-button"
                  onClick={() =>
                    void window.electronAPI.openWorkspaceKitFile({
                      workspaceId: selectedWorkspaceId,
                      relPath: ".neoworker/MEMORY.md",
                    })
                  }
                  disabled={!selectedWorkspaceId || kitBusy}
                >
                  {t("memoryHub.openMemoryMd", "Open MEMORY.md")}
                </button>
                <button
                  className="settings-button"
                  onClick={() =>
                    void window.electronAPI.openWorkspaceKitFile({
                      workspaceId: selectedWorkspaceId,
                      relPath: ".neoworker/DESIGN.md",
                    })
                  }
                  disabled={!selectedWorkspaceId || kitBusy}
                >
                  {t("memoryHub.openDesignMd", "Open DESIGN.md")}
                </button>
              </div>
            </div>
          )}

          {selectedWorkspaceId && (
            <>
              <div className="settings-card memory-hub-top-gap">
                <div className="memory-hub-row-center">
                  <div className="memory-hub-grow">
                    <div className="memory-hub-primary-label">
                      {t(
                        "memoryHub.memoryApprovals.title",
                        "Pending Memory Writes",
                      )}
                    </div>
                    <p className="settings-form-hint memory-hub-hint-tight">
                      {t(
                        "memoryHub.memoryApprovals.description",
                        "Review staged archive, curated, and external memory writes for this workspace.",
                      )}
                    </p>
                  </div>
                  <div className="memory-hub-stack-gap">
                    <span
                      className={badgeClass(
                        pendingMemoryWrites.length > 0 ? "warning" : "success",
                      )}
                    >
                      {t(
                        "memoryHub.memoryApprovals.pendingCount",
                        "{count} pending",
                        {
                          count: pendingMemoryWrites.length,
                        },
                      )}
                    </span>
                    <button
                      className="settings-button"
                      onClick={() => void refreshMemoryApprovals()}
                      disabled={memoryApprovalsLoading}
                    >
                      {memoryApprovalsLoading
                        ? t("common.refreshing", "Refreshing...")
                        : t("common.refresh", "Refresh")}
                    </button>
                  </div>
                </div>

                <div className="memory-hub-top-gap">
                  {pendingMemoryWrites.length === 0 ? (
                    <div className="settings-empty">
                      {t(
                        "memoryHub.memoryApprovals.empty",
                        "No pending memory writes.",
                      )}
                    </div>
                  ) : (
                    <div className="memory-list" style={{ maxHeight: "360px" }}>
                      {pendingMemoryWrites.map((item) => {
                        const isExternal = item.target === "external";
                        const busy = memoryApprovalBusyId === item.id;
                        return (
                          <div key={item.id} className="memory-list-item">
                            <div className="memory-hub-row">
                              <div className="memory-hub-grow">
                                <div className="memory-hub-stack-wrap">
                                  <span
                                    className={badgeClass(
                                      isExternal ? "warning" : "neutral",
                                    )}
                                  >
                                    {item.target}
                                  </span>
                                  <span className={badgeClass("neutral")}>
                                    {item.action}
                                  </span>
                                  <span
                                    className={badgeClass(
                                      item.origin === "agent_tool"
                                        ? "success"
                                        : "warning",
                                    )}
                                  >
                                    {item.origin}
                                  </span>
                                  <span
                                    className={badgeClass(
                                      item.riskScore >= 0.7
                                        ? "warning"
                                        : "neutral",
                                    )}
                                  >
                                    {t(
                                      "memoryHub.memoryApprovals.risk",
                                      "risk {percent}%",
                                      {
                                        percent: Math.round(
                                          item.riskScore * 100,
                                        ),
                                      },
                                    )}
                                  </span>
                                </div>
                                <div className="memory-hub-text-block-primary">
                                  {item.summary}
                                </div>
                                <div className="memory-hub-caption">
                                  {formatTimestamp(item.createdAt) ||
                                    t("common.unknownTime", "Unknown time")}
                                  {item.taskId
                                    ? ` • ${t(
                                        "memoryHub.memoryApprovals.task",
                                        "task {id}",
                                        {
                                          id: item.taskId,
                                        },
                                      )}`
                                    : ""}
                                </div>
                                {isExternal && (
                                  <div className="memory-hub-caption memory-hub-top-gap-sm">
                                    {t(
                                      "memoryHub.memoryApprovals.externalWarning",
                                      "External write: approving this can send the shown content to the configured provider.",
                                    )}
                                  </div>
                                )}
                                <pre className="memory-approval-payload">
                                  {renderPendingPayload(item)}
                                </pre>
                              </div>
                              <div className="memory-hub-stack-gap memory-hub-toggle-shrink">
                                <button
                                  className="settings-button primary"
                                  onClick={() =>
                                    void approveMemoryWrite(item.id)
                                  }
                                  disabled={busy}
                                >
                                  {t("common.approve", "Approve")}
                                </button>
                                <button
                                  className="settings-button settings-button-danger"
                                  onClick={() =>
                                    void rejectMemoryWrite(item.id)
                                  }
                                  disabled={busy}
                                >
                                  {t("common.reject", "Reject")}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <ChronicleSettingsCard />
              <MemorySettings
                workspaceId={selectedWorkspaceId}
                onSettingsChanged={props?.onSettingsChanged}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
