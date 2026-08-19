import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ImprovementCampaign,
  ImprovementCandidate,
  ImprovementEligibility,
  ImprovementLoopSettings,
  Workspace,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

const ALL_WORKSPACES_VALUE = "__all_workspaces__";

const DEFAULT_SETTINGS: ImprovementLoopSettings = {
  enabled: false,
  autoRun: true,
  includeDevLogs: true,
  intervalMinutes: 24 * 60,
  variantsPerCampaign: 1,
  maxConcurrentCampaigns: 1,
  maxConcurrentImprovementExecutors: 1,
  maxQueuedImprovementCampaigns: 1,
  maxOpenCandidatesPerWorkspace: 25,
  requireWorktree: true,
  requireRepoChecks: true,
  enforcePatchScope: true,
  maxPatchFiles: 8,
  reviewRequired: false,
  judgeRequired: false,
  promotionMode: "github_pr",
  evalWindowDays: 14,
  replaySetSize: 3,
  campaignTimeoutMinutes: 30,
  campaignTokenBudget: 60000,
  campaignCostBudget: 15,
};

const SCROLL_PANEL_STYLE = {
  maxHeight: 360,
  overflowY: "auto" as const,
  paddingRight: 6,
};

const DEFAULT_ELIGIBILITY: ImprovementEligibility = {
  eligible: false,
  reason: "Checking self-improvement eligibility…",
  enrolled: false,
  checks: {
    unpackagedApp: false,
    canonicalRepo: false,
    ownerEnrollment: false,
    ownerProofPresent: false,
  },
};

function getWorkspaceModeMeta(workspace: Workspace | undefined) {
  if (!workspace) {
    return {
      label: translate("improvementSettings.workspaceMode.unknown", "Unknown"),
      tone: "#6b7280",
      description: translate(
        "improvementSettings.workspaceMode.unknownDescription",
        "Workspace details are unavailable.",
      ),
    };
  }
  if (workspace.id === ALL_WORKSPACES_VALUE) {
    return {
      label: translate(
        "improvementSettings.workspaceMode.aggregate",
        "Aggregate View",
      ),
      tone: "var(--color-accent-primary)",
      description: translate(
        "improvementSettings.workspaceMode.aggregateDescription",
        "Showing issues and campaign activity across every workspace.",
      ),
    };
  }
  if (workspace.isTemp) {
    return {
      label: translate(
        "improvementSettings.workspaceMode.nonPromotable",
        "Non-Promotable",
      ),
      tone: "#b7791f",
      description: translate(
        "improvementSettings.workspaceMode.nonPromotableDescription",
        "Temporary workspaces are not suitable for PR-first self-improvement campaigns.",
      ),
    };
  }
  return {
    label: translate(
      "improvementSettings.workspaceMode.promotable",
      "Promotable If Git-Backed",
    ),
    tone: "#2f855a",
    description: translate(
      "improvementSettings.workspaceMode.promotableDescription",
      "Git-backed workspaces can produce draft PR candidates when promotion gates pass.",
    ),
  };
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTimestamp(value?: number): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function isProviderFailure(value?: string): boolean {
  return typeof value === "string" && value.startsWith("provider_");
}

function getProviderHealthSummary(
  campaigns: ImprovementCampaign[],
  candidates: ImprovementCandidate[],
): {
  status: "healthy" | "degraded" | "blocked";
  label: string;
  details: string;
  incidents: Array<{ id: string; title: string; detail: string; at?: number }>;
} {
  const incidents = [
    ...campaigns
      .filter((campaign) => isProviderFailure(campaign.stopReason))
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.stopReason || "provider_failure",
        detail:
          campaign.promotionError ||
          campaign.verdictSummary ||
          "Provider-related campaign failure.",
        at: campaign.completedAt || campaign.startedAt || campaign.createdAt,
      })),
    ...candidates
      .filter((candidate) => isProviderFailure(candidate.lastFailureClass))
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.lastFailureClass || "provider_failure",
        detail: candidate.parkReason || candidate.summary,
        at:
          candidate.cooldownUntil ||
          candidate.parkedAt ||
          candidate.lastExperimentAt,
      })),
  ].sort((a, b) => (b.at || 0) - (a.at || 0));

  if (incidents.length === 0) {
    return {
      status: "healthy",
      label: translate("improvementSettings.providerHealth.healthy", "Healthy"),
      details: translate(
        "improvementSettings.providerHealth.healthyDetails",
        "No provider-related campaign failures are visible in the current workspace scope.",
      ),
      incidents: [],
    };
  }

  const blocked = candidates.some(
    (candidate) =>
      candidate.status === "parked" &&
      isProviderFailure(candidate.lastFailureClass),
  );
  return {
    status: blocked ? "blocked" : "degraded",
    label: blocked
      ? translate("improvementSettings.providerHealth.blocked", "Blocked")
      : translate("improvementSettings.providerHealth.degraded", "Degraded"),
    details: blocked
      ? translate(
          "improvementSettings.providerHealth.blockedDetails",
          "Provider failures are currently parking candidates and blocking PR generation.",
        )
      : translate(
          "improvementSettings.providerHealth.degradedDetails",
          "Provider-related failures have occurred recently and may reduce PR yield.",
        ),
    incidents: incidents.slice(0, 6),
  };
}

export function ImprovementSettingsPanel(props?: {
  initialWorkspaceId?: string;
  onOpenTask?: (taskId: string) => void;
}) {
  useLanguage();
  const [settings, setSettings] =
    useState<ImprovementLoopSettings>(DEFAULT_SETTINGS);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [candidates, setCandidates] = useState<ImprovementCandidate[]>([]);
  const [campaigns, setCampaigns] = useState<ImprovementCampaign[]>([]);
  const [eligibility, setEligibility] =
    useState<ImprovementEligibility>(DEFAULT_ELIGIBILITY);
  const [ownerEnrollmentSignatureInput, setOwnerEnrollmentSignatureInput] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [candidateStatusFilter, setCandidateStatusFilter] = useState("all");
  const [candidateSourceFilter, setCandidateSourceFilter] = useState("all");

  const pendingReviewCampaigns = useMemo(
    () =>
      campaigns.filter((campaign) => campaign.status === "ready_for_review"),
    [campaigns],
  );
  const recentPromotedCampaigns = useMemo(
    () =>
      [...campaigns]
        .filter((campaign) =>
          ["applied", "merged", "pr_opened"].includes(
            campaign.promotionStatus || "idle",
          ),
        )
        .sort(
          (a, b) =>
            (b.promotedAt || b.createdAt) - (a.promotedAt || a.createdAt),
        )
        .slice(0, 5),
    [campaigns],
  );
  const recentCampaigns = useMemo(
    () =>
      [...campaigns]
        .sort(
          (a, b) => (b.startedAt || b.createdAt) - (a.startedAt || a.createdAt),
        )
        .slice(0, 10),
    [campaigns],
  );
  const workspaceNameById = useMemo(
    () =>
      new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );
  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId),
    [workspaces, selectedWorkspaceId],
  );
  const selectedWorkspaceMode = useMemo(
    () => getWorkspaceModeMeta(selectedWorkspace),
    [selectedWorkspace],
  );
  const filteredCandidates = useMemo(
    () =>
      candidates.filter((candidate) => {
        const statusMatches =
          candidateStatusFilter === "all" ||
          candidate.status === candidateStatusFilter;
        const sourceMatches =
          candidateSourceFilter === "all" ||
          candidate.source === candidateSourceFilter;
        return statusMatches && sourceMatches;
      }),
    [candidateStatusFilter, candidateSourceFilter, candidates],
  );
  const overviewMetrics = useMemo(() => {
    const prOpened = campaigns.filter(
      (campaign) => campaign.promotionStatus === "pr_opened",
    ).length;
    const terminalCampaigns = campaigns.filter((campaign) =>
      ["pr_opened", "failed", "parked", "promoted"].includes(campaign.status),
    );
    const failedCampaigns = campaigns.filter(
      (campaign) => campaign.status === "failed",
    ).length;
    const parkedCampaigns = campaigns.filter(
      (campaign) => campaign.status === "parked",
    ).length;
    const activeCampaigns = campaigns.filter((campaign) =>
      [
        "queued",
        "preflight",
        "reproducing",
        "implementing",
        "verifying",
      ].includes(campaign.status),
    ).length;
    const parkedCandidates = candidates.filter(
      (candidate) => candidate.status === "parked",
    ).length;
    const coolingDownCandidates = candidates.filter(
      (candidate) =>
        typeof candidate.cooldownUntil === "number" &&
        candidate.cooldownUntil > Date.now(),
    ).length;
    const prYield =
      terminalCampaigns.length > 0 ? prOpened / terminalCampaigns.length : 0;
    const stageCounts = campaigns.reduce<Record<string, number>>(
      (acc, campaign) => {
        const key = campaign.stage || campaign.status;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {},
    );
    return {
      totalCampaigns: campaigns.length,
      prOpened,
      failedCampaigns,
      parkedCampaigns,
      activeCampaigns,
      parkedCandidates,
      coolingDownCandidates,
      prYield,
      stageCounts,
    };
  }, [campaigns, candidates]);
  const providerHealth = useMemo(
    () => getProviderHealthSummary(campaigns, candidates),
    [campaigns, candidates],
  );
  const topParkedCandidates = useMemo(
    () =>
      [...candidates]
        .filter(
          (candidate) =>
            candidate.status === "parked" || candidate.cooldownUntil,
        )
        .sort(
          (a, b) =>
            (b.failureStreak || 0) - (a.failureStreak || 0) ||
            (b.cooldownUntil || b.parkedAt || 0) -
              (a.cooldownUntil || a.parkedAt || 0),
        )
        .slice(0, 5),
    [candidates],
  );
  const eligibilityBlocked = !eligibility.eligible;
  const ownerEnrollmentStored =
    eligibility.checks.ownerEnrollment || eligibility.checks.ownerProofPresent;
  const worktreeForcedByVariants = settings.variantsPerCampaign > 1;

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    void refreshWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [nextSettings, nextWorkspaces, tempWorkspace, nextEligibility] =
        await Promise.all([
          window.electronAPI
            .getImprovementSettings()
            .catch(() => DEFAULT_SETTINGS),
          window.electronAPI.listWorkspaces().catch(() => [] as Workspace[]),
          window.electronAPI
            .getTempWorkspace()
            .catch(() => null as Workspace | null),
          window.electronAPI
            .getImprovementEligibility()
            .catch(() => DEFAULT_ELIGIBILITY),
        ]);
      const combined: Workspace[] = [
        {
          id: ALL_WORKSPACES_VALUE,
          name: translate(
            "improvementSettings.workspace.all",
            "All Workspaces",
          ),
          path: "",
          createdAt: 0,
          permissions: {
            read: true,
            write: true,
            delete: false,
            network: true,
            shell: false,
          },
        },
        ...(tempWorkspace ? [tempWorkspace] : []),
        ...nextWorkspaces.filter(
          (workspace) => workspace.id !== tempWorkspace?.id,
        ),
      ];
      setSettings(nextSettings);
      setEligibility(nextEligibility);
      setWorkspaces(combined);

      const defaultWorkspaceId =
        combined.find((workspace) => workspace.id === ALL_WORKSPACES_VALUE)
          ?.id ||
        combined[0]?.id ||
        "";
      let workspaceToLoad = defaultWorkspaceId;

      setSelectedWorkspaceId((current) => {
        const nextSelected =
          current && combined.some((workspace) => workspace.id === current)
            ? current
            : defaultWorkspaceId;
        workspaceToLoad = nextSelected;
        return nextSelected;
      });

      if (workspaceToLoad) await refreshWorkspaceData(workspaceToLoad);
    } finally {
      setLoading(false);
    }
  };

  const refreshWorkspaceData = async (workspaceId: string) => {
    const filterWorkspaceId =
      workspaceId === ALL_WORKSPACES_VALUE ? undefined : workspaceId;
    const [nextCandidates, nextCampaigns] = await Promise.all([
      window.electronAPI.listImprovementCandidates(filterWorkspaceId),
      window.electronAPI.listImprovementCampaigns(filterWorkspaceId),
    ]);
    setCandidates(nextCandidates);
    setCampaigns(nextCampaigns);
  };

  const saveSettings = async (updates: Partial<ImprovementLoopSettings>) => {
    const next = { ...settings, ...updates };
    try {
      setBusy(true);
      const saved = await window.electronAPI.saveImprovementSettings(next);
      setSettings(saved);
      if (
        saved.variantsPerCampaign > 1 &&
        !next.requireWorktree &&
        saved.requireWorktree
      ) {
        setActionMessage(
          translate(
            "improvementSettings.message.worktreeAutoEnabled",
            "Worktree isolation was enabled automatically because multi-variant campaigns require isolated worktrees.",
          ),
        );
      }
      if ((updates.enabled || updates.autoRun) && !eligibility.eligible) {
        setActionMessage(eligibility.reason);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.saveFailed",
                  "Unable to save self-improvement settings.",
                ),
            );
      setActionMessage(message);
      setSettings(
        await window.electronAPI
          .getImprovementSettings()
          .catch(() => DEFAULT_SETTINGS),
      );
    } finally {
      setBusy(false);
    }
  };

  const saveOwnerEnrollment = async () => {
    if (!ownerEnrollmentSignatureInput.trim()) {
      setActionMessage(
        translate(
          "improvementSettings.message.enterSignature",
          "Enter a maintainer-signed owner enrollment signature first.",
        ),
      );
      return;
    }

    try {
      setBusy(true);
      const nextEligibility =
        await window.electronAPI.saveImprovementOwnerEnrollment(
          ownerEnrollmentSignatureInput,
        );
      setEligibility(nextEligibility);
      setOwnerEnrollmentSignatureInput("");
      setSettings(
        await window.electronAPI
          .getImprovementSettings()
          .catch(() => DEFAULT_SETTINGS),
      );
      setActionMessage(nextEligibility.reason);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.saveSignatureFailed",
                  "Unable to save owner enrollment signature.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const clearOwnerEnrollment = async () => {
    try {
      setBusy(true);
      const nextEligibility =
        await window.electronAPI.clearImprovementOwnerEnrollment();
      setEligibility(nextEligibility);
      setOwnerEnrollmentSignatureInput("");
      setSettings(
        await window.electronAPI
          .getImprovementSettings()
          .catch(() => DEFAULT_SETTINGS),
      );
      setActionMessage(
        translate(
          "improvementSettings.message.enrollmentCleared",
          "Owner enrollment cleared.",
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.clearEnrollmentFailed",
                  "Unable to clear owner enrollment.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const refreshCandidates = async () => {
    try {
      setBusy(true);
      const result = await window.electronAPI.refreshImprovementCandidates();
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
      setActionMessage(
        translate(
          "improvementSettings.message.signalsRefreshed",
          "Signals refreshed. {count} candidate issue(s) currently in backlog.",
          { count: result.candidateCount },
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.refreshFailed",
                  "Unable to refresh self-improvement signals.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const runNextExperiment = async () => {
    try {
      setBusy(true);
      const campaign = await window.electronAPI.runNextImprovementExperiment();
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
      if (campaign) {
        setActionMessage(
          translate(
            "improvementSettings.message.campaignStarted",
            "Started campaign {id} with {count} variant lane(s).",
            { id: campaign.id.slice(0, 8), count: campaign.variants.length },
          ),
        );
      } else {
        setActionMessage(
          translate(
            "improvementSettings.message.noCampaignStarted",
            "No eligible campaign was started. Check that the loop is enabled, no other campaign is active, and at least one open candidate is available.",
          ),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.startCampaignFailed",
                  "Unable to start a self-improvement campaign.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const dismissCandidate = async (candidateId: string) => {
    try {
      setBusy(true);
      await window.electronAPI.dismissImprovementCandidate(candidateId);
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.dismissCandidateFailed",
                  "Unable to dismiss candidate.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const reviewCampaign = async (
    campaignId: string,
    reviewStatus: "accepted" | "dismissed",
  ) => {
    try {
      setBusy(true);
      await window.electronAPI.reviewImprovementCampaign(
        campaignId,
        reviewStatus,
      );
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.reviewCampaignFailed",
                  "Unable to review campaign.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const retryCampaign = async (campaignId: string) => {
    try {
      setBusy(true);
      const campaign =
        await window.electronAPI.retryImprovementCampaign(campaignId);
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
      if (campaign) {
        setActionMessage(
          translate(
            "improvementSettings.message.campaignRetried",
            "Retried campaign {id} with {count} variant lane(s).",
            { id: campaign.id.slice(0, 8), count: campaign.variants.length },
          ),
        );
      } else {
        setActionMessage(
          translate(
            "improvementSettings.message.retryNotStarted",
            "Retry could not start. Check that no other campaign is active and the candidate still exists.",
          ),
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.retryFailed",
                  "Retry could not start.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  const resetHistory = async () => {
    const confirmed = window.confirm(
      translate(
        "improvementSettings.message.resetConfirm",
        "Delete all self-improvement findings, campaigns, variants, and verdict history so the loop can start fresh? Existing code and general task history will not be removed.",
      ),
    );
    if (!confirmed) return;

    try {
      setBusy(true);
      const result = await window.electronAPI.resetImprovementHistory();
      if (selectedWorkspaceId) await refreshWorkspaceData(selectedWorkspaceId);
      const totalDeleted =
        result.deleted.candidates +
        result.deleted.campaigns +
        result.deleted.variantRuns +
        result.deleted.judgeVerdicts +
        result.deleted.legacyRuns;
      setActionMessage(
        translate(
          "improvementSettings.message.resetDone",
          "Reset self-improvement history. Removed {total} record(s) and cancelled {cancelled} active improvement task(s).",
          { total: totalDeleted, cancelled: result.cancelledTaskIds.length },
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(
              error ||
                translate(
                  "improvementSettings.message.resetFailed",
                  "Unable to reset self-improvement history.",
                ),
            );
      setActionMessage(message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-loading">
          {translate(
            "improvementSettings.loading",
            "Loading self-improvement settings...",
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">
        {translate("improvementSettings.title", "Self-Improvement")}
      </h2>
      <p className="settings-section-description">
        {translate(
          "improvementSettings.description",
          "Mine recurring failures, run a bounded scout-then-implement pipeline, and only succeed when a draft PR is opened.",
        )}
      </p>

      <div
        className="settings-form-group"
        style={{
          border: "1px solid var(--color-border-muted)",
          borderRadius: 12,
          padding: "14px 16px",
          background: "var(--color-bg-secondary)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: eligibility.eligible ? "#2f855a" : "#c53030",
          }}
        >
          {eligibility.eligible
            ? translate(
                "improvementSettings.eligibility.enabled",
                "Owner-only self-improvement is enabled",
              )
            : translate(
                "improvementSettings.eligibility.locked",
                "Self-improvement is locked",
              )}
        </div>
        <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
          {eligibility.reason}
        </p>
        <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
          {translate("improvementSettings.eligibility.app", "App:")}{" "}
          <code>
            {eligibility.checks.unpackagedApp
              ? translate(
                  "improvementSettings.eligibility.unpackaged",
                  "unpackaged",
                )
              : translate(
                  "improvementSettings.eligibility.packaged",
                  "packaged",
                )}
          </code>
          {" | "}
          {translate(
            "improvementSettings.eligibility.repoOrigin",
            "Canonical repo origin:",
          )}{" "}
          <code>
            {eligibility.checks.canonicalRepo
              ? translate("improvementSettings.eligibility.matched", "matched")
              : translate(
                  "improvementSettings.eligibility.notMatched",
                  "not matched",
                )}
          </code>
          {" | "}
          {translate(
            "improvementSettings.eligibility.ownerEnrollment",
            "Owner enrollment:",
          )}{" "}
          <code>
            {eligibility.checks.ownerEnrollment
              ? translate("improvementSettings.eligibility.present", "present")
              : translate("improvementSettings.eligibility.missing", "missing")}
          </code>
        </p>
        {eligibility.repoPath ? (
          <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
            {translate(
              "improvementSettings.eligibility.repoPath",
              "Repo path:",
            )}{" "}
            <code>{eligibility.repoPath}</code>
          </p>
        ) : null}
        {eligibility.machineFingerprint ? (
          <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
            {translate(
              "improvementSettings.eligibility.machineFingerprint",
              "Machine fingerprint:",
            )}{" "}
            <code>{eligibility.machineFingerprint}</code>
          </p>
        ) : null}
        {eligibility.ownerEnrollmentChallenge ? (
          <p
            className="settings-form-hint"
            style={{ margin: "6px 0 0 0", wordBreak: "break-all" }}
          >
            {translate(
              "improvementSettings.eligibility.signingChallenge",
              "Maintainer signing challenge:",
            )}{" "}
            <code>{eligibility.ownerEnrollmentChallenge}</code>
          </p>
        ) : null}
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label className="settings-label" style={{ marginBottom: 0 }}>
            {translate(
              "improvementSettings.enrollment.signatureLabel",
              "Maintainer-signed enrollment signature",
            )}
          </label>
          <input
            type="password"
            className="settings-input"
            value={ownerEnrollmentSignatureInput}
            onChange={(event) =>
              setOwnerEnrollmentSignatureInput(event.target.value)
            }
            placeholder={translate(
              "improvementSettings.enrollment.signaturePlaceholder",
              "Paste base64 Ed25519 signature from maintainer",
            )}
            disabled={busy}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="settings-button"
              onClick={() => void saveOwnerEnrollment()}
              disabled={busy || !ownerEnrollmentSignatureInput.trim()}
            >
              {translate(
                "improvementSettings.enrollment.save",
                "Save Enrollment Signature",
              )}
            </button>
            <button
              className="settings-button settings-button-secondary"
              onClick={() => void clearOwnerEnrollment()}
              disabled={busy || !ownerEnrollmentStored}
            >
              {translate(
                "improvementSettings.enrollment.clear",
                "Clear Enrollment",
              )}
            </button>
          </div>
          <p className="settings-form-hint" style={{ margin: 0 }}>
            {ownerEnrollmentStored
              ? translate(
                  "improvementSettings.enrollment.stored",
                  "A local owner enrollment is stored for this machine.",
                )
              : translate(
                  "improvementSettings.enrollment.notStored",
                  "No local owner enrollment is stored yet.",
                )}{" "}
            {translate(
              "improvementSettings.enrollment.securityNote",
              "Only the repo maintainer can generate a valid signature because verification is pinned to the maintainer public key shipped in the app. No private key is stored in the repo or database.",
            )}
          </p>
        </div>
      </div>

      <div className="settings-subsection">
        <h3>
          {translate("improvementSettings.howItWorks.title", "How It Works")}
        </h3>
        <HintBlock
          title={translate(
            "improvementSettings.howItWorks.observation.title",
            "1. Observation",
          )}
        >
          {translate(
            "improvementSettings.howItWorks.observation.description",
            "NeoWorker watches failed tasks, verification failures, user feedback, and optional dev logs to build a backlog of recurring issues.",
          )}
        </HintBlock>
        <HintBlock
          title={translate(
            "improvementSettings.howItWorks.campaign.title",
            "2. Campaign",
          )}
        >
          {translate(
            "improvementSettings.howItWorks.campaign.description",
            "For the top candidate, NeoWorker creates one campaign, runs a scout stage to reproduce the problem, then runs bounded implementation lanes and judges the most promotable result.",
          )}
        </HintBlock>
        <HintBlock
          title={translate(
            "improvementSettings.howItWorks.judge.title",
            "3. Judge",
          )}
        >
          {translate(
            "improvementSettings.howItWorks.judge.description",
            "Campaigns fail closed if reproduction, verification, or PR-readiness evidence is missing. Provider failures park the candidate with cooldown instead of retrying immediately.",
          )}
        </HintBlock>
        <HintBlock
          title={translate(
            "improvementSettings.howItWorks.promotion.title",
            "4. Promotion",
          )}
        >
          {translate(
            "improvementSettings.howItWorks.promotion.description",
            "The only automated success outcome is a draft PR candidate with verification evidence and stored PR metadata.",
          )}
        </HintBlock>
      </div>

      <div className="settings-subsection">
        <h3>{translate("improvementSettings.loop.title", "Loop Settings")}</h3>
        <ToggleRow
          label={translate(
            "improvementSettings.loop.enable.label",
            "Enable Self-Improvement Loop",
          )}
          description={translate(
            "improvementSettings.loop.enable.description",
            "Allow NeoWorker to build a backlog of recurring failures and run repair campaigns.",
          )}
          checked={settings.enabled}
          disabled={busy || eligibilityBlocked}
          onChange={(checked) => void saveSettings({ enabled: checked })}
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.autoRun.label",
            "Auto-Run Campaigns",
          )}
          description={translate(
            "improvementSettings.loop.autoRun.description",
            "Pick the highest-priority candidate on a schedule and launch one campaign.",
          )}
          checked={settings.autoRun}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) => void saveSettings({ autoRun: checked })}
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.requireWorktree.label",
            "Require Worktree Isolation",
          )}
          description={
            worktreeForcedByVariants
              ? translate(
                  "improvementSettings.loop.requireWorktree.forced",
                  "Automatically required while running multiple variants so each lane gets an isolated checkout.",
                )
              : translate(
                  "improvementSettings.loop.requireWorktree.description",
                  "Use git worktrees when available; otherwise the winner applies directly in the workspace.",
                )
          }
          checked={settings.requireWorktree}
          disabled={
            busy ||
            !settings.enabled ||
            eligibilityBlocked ||
            worktreeForcedByVariants
          }
          onChange={(checked) =>
            void saveSettings({ requireWorktree: checked })
          }
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.requireRepoChecks.label",
            "Require Repo Checks",
          )}
          description={translate(
            "improvementSettings.loop.requireRepoChecks.description",
            "Keep preflight strict about git-backed execution and PR-first promotability expectations.",
          )}
          checked={settings.requireRepoChecks}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) =>
            void saveSettings({ requireRepoChecks: checked })
          }
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.enforcePatchScope.label",
            "Enforce Patch Scope",
          )}
          description={translate(
            "improvementSettings.loop.enforcePatchScope.description",
            "Bias evaluation against oversized changes and keep fixes tightly bounded.",
          )}
          checked={settings.enforcePatchScope}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) =>
            void saveSettings({ enforcePatchScope: checked })
          }
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.includeDevLogs.label",
            "Include Dev Logs",
          )}
          description={translate(
            "improvementSettings.loop.includeDevLogs.description",
            "Parse `logs/dev-latest.log` when looking for recurring local runtime failures.",
          )}
          checked={settings.includeDevLogs}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) => void saveSettings({ includeDevLogs: checked })}
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.manualReview.label",
            "Manual Review Required",
          )}
          description={translate(
            "improvementSettings.loop.manualReview.description",
            "Legacy toggle. PR-first self-improvement opens a draft PR automatically when promotion gates pass.",
          )}
          checked={settings.reviewRequired}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) => void saveSettings({ reviewRequired: checked })}
        />
        <ToggleRow
          label={translate(
            "improvementSettings.loop.requireJudge.label",
            "Require Judge Verdict",
          )}
          description={translate(
            "improvementSettings.loop.requireJudge.description",
            "Legacy toggle. The new staged pipeline does not fan out multiple variants by default.",
          )}
          checked={settings.judgeRequired}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          onChange={(checked) => void saveSettings({ judgeRequired: checked })}
        />
        <SelectRow
          label={translate(
            "improvementSettings.loop.promotionMode",
            "Promotion Mode",
          )}
          value={settings.promotionMode}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          options={[
            {
              value: "github_pr",
              label: translate(
                "improvementSettings.loop.promotion.githubPr",
                "Open GitHub PR",
              ),
            },
            {
              value: "merge",
              label: translate(
                "improvementSettings.loop.promotion.merge",
                "Merge to Base Branch",
              ),
            },
          ]}
          onChange={(value) =>
            void saveSettings({
              promotionMode: value as ImprovementLoopSettings["promotionMode"],
            })
          }
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.runInterval",
            "Run Interval (minutes)",
          )}
          value={settings.intervalMinutes}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={15}
          max={10080}
          onChange={(value) => void saveSettings({ intervalMinutes: value })}
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.variantsPerCampaign",
            "Variants Per Campaign",
          )}
          value={settings.variantsPerCampaign}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={1}
          max={3}
          onChange={(value) =>
            void saveSettings({ variantsPerCampaign: value })
          }
        />
        {worktreeForcedByVariants && (
          <p className="settings-form-hint" style={{ marginTop: -4 }}>
            {translate(
              "improvementSettings.loop.multiVariantHint",
              "Multi-variant campaigns automatically force worktree isolation to keep each implementation lane in a separate checkout.",
            )}
          </p>
        )}
        <NumberRow
          label={translate(
            "improvementSettings.loop.maxConcurrentCampaigns",
            "Max Concurrent Campaigns",
          )}
          value={settings.maxConcurrentCampaigns}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={1}
          max={3}
          onChange={(value) =>
            void saveSettings({ maxConcurrentCampaigns: value })
          }
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.patchFileCap",
            "Patch File Cap",
          )}
          value={settings.maxPatchFiles}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={1}
          max={30}
          onChange={(value) => void saveSettings({ maxPatchFiles: value })}
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.campaignTimeout",
            "Campaign Timeout (minutes)",
          )}
          value={settings.campaignTimeoutMinutes}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={5}
          max={120}
          onChange={(value) =>
            void saveSettings({ campaignTimeoutMinutes: value })
          }
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.replaySetSize",
            "Replay Set Size",
          )}
          value={settings.replaySetSize}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={1}
          max={10}
          onChange={(value) => void saveSettings({ replaySetSize: value })}
        />
        <NumberRow
          label={translate(
            "improvementSettings.loop.evalWindow",
            "Eval Window (days)",
          )}
          value={settings.evalWindowDays}
          disabled={busy || !settings.enabled || eligibilityBlocked}
          min={1}
          max={90}
          onChange={(value) => void saveSettings({ evalWindowDays: value })}
        />
      </div>

      <div className="settings-subsection">
        <h3>
          {translate(
            "improvementSettings.overview.title",
            "Automation Overview",
          )}
        </h3>
        <p className="settings-form-hint" style={{ marginTop: 0 }}>
          {translate(
            "improvementSettings.overview.description",
            "Success is measured as draft PRs opened, not campaigns started.",
          )}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <MetricCard
            label={translate(
              "improvementSettings.overview.prYield",
              "PR Yield",
            )}
            value={
              overviewMetrics.totalCampaigns > 0
                ? formatPercent(overviewMetrics.prYield)
                : "n/a"
            }
            hint={translate(
              "improvementSettings.overview.prYieldHint",
              "{prs} PR candidate(s) opened from {campaigns} campaign(s).",
              {
                prs: overviewMetrics.prOpened,
                campaigns: overviewMetrics.totalCampaigns,
              },
            )}
            tone={overviewMetrics.prOpened > 0 ? "#2f855a" : "#9b2c2c"}
          />
          <MetricCard
            label={translate(
              "improvementSettings.overview.activeCampaigns",
              "Active Campaigns",
            )}
            value={String(overviewMetrics.activeCampaigns)}
            hint={
              overviewMetrics.activeCampaigns > 0
                ? Object.entries(overviewMetrics.stageCounts)
                    .filter(([, count]) => count > 0)
                    .map(([stage, count]) => `${stage}:${count}`)
                    .join(" | ")
                : translate(
                    "improvementSettings.overview.noActiveCampaigns",
                    "No active self-improvement campaigns.",
                  )
            }
            tone={
              overviewMetrics.activeCampaigns > 0
                ? "var(--color-accent-primary)"
                : "#6b7280"
            }
          />
          <MetricCard
            label={translate(
              "improvementSettings.overview.parkedBacklog",
              "Parked Backlog",
            )}
            value={String(overviewMetrics.parkedCandidates)}
            hint={translate(
              "improvementSettings.overview.parkedBacklogHint",
              "{cooling} candidate(s) cooling down, {parked} parked campaign(s).",
              {
                cooling: overviewMetrics.coolingDownCandidates,
                parked: overviewMetrics.parkedCampaigns,
              },
            )}
            tone={overviewMetrics.parkedCandidates > 0 ? "#b7791f" : "#2f855a"}
          />
          <MetricCard
            label={translate(
              "improvementSettings.overview.providerHealth",
              "Provider Health",
            )}
            value={providerHealth.label}
            hint={providerHealth.details}
            tone={
              providerHealth.status === "healthy"
                ? "#2f855a"
                : providerHealth.status === "degraded"
                  ? "#b7791f"
                  : "#c53030"
            }
          />
        </div>

        <div className="settings-form-group">
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
            {translate(
              "improvementSettings.overview.funnel",
              "PR Candidate Funnel",
            )}
          </div>
          <p className="settings-form-hint" style={{ margin: "4px 0 0 0" }}>
            {translate("improvementSettings.overview.campaigns", "Campaigns:")}{" "}
            <code>{overviewMetrics.totalCampaigns}</code>
            {" | "}
            {translate(
              "improvementSettings.overview.prOpened",
              "PR opened:",
            )}{" "}
            <code>{overviewMetrics.prOpened}</code>
            {" | "}
            {translate("improvementSettings.overview.failed", "Failed:")}{" "}
            <code>{overviewMetrics.failedCampaigns}</code>
            {" | "}
            {translate("improvementSettings.overview.parked", "Parked:")}{" "}
            <code>{overviewMetrics.parkedCampaigns}</code>
          </p>
        </div>

        <div className="settings-form-group">
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
            {translate(
              "improvementSettings.overview.providerAutomationHealth",
              "Provider / Automation Health",
            )}
          </div>
          <p className="settings-form-hint" style={{ margin: "4px 0 0 0" }}>
            {providerHealth.details}
          </p>
          {providerHealth.incidents.length > 0 ? (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {providerHealth.incidents.map((incident) => (
                <div
                  key={incident.id}
                  style={{
                    border: "1px solid var(--color-border-muted)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "var(--color-bg-secondary)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    <code>{incident.title}</code>
                  </div>
                  <p
                    className="settings-form-hint"
                    style={{ margin: "4px 0 0 0" }}
                  >
                    {incident.detail}
                  </p>
                  <p
                    className="settings-form-hint"
                    style={{ margin: "6px 0 0 0" }}
                  >
                    {translate(
                      "improvementSettings.overview.lastSeen",
                      "Last seen:",
                    )}{" "}
                    <code>{formatTimestamp(incident.at)}</code>
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="settings-form-group">
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
            {translate(
              "improvementSettings.overview.topParkedCandidates",
              "Top Parked Candidates",
            )}
          </div>
          {topParkedCandidates.length === 0 ? (
            <p className="settings-form-hint" style={{ margin: "4px 0 0 0" }}>
              {translate(
                "improvementSettings.overview.noParkedCandidates",
                "No candidates are currently parked or cooling down.",
              )}
            </p>
          ) : (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              {topParkedCandidates.map((candidate) => (
                <div
                  key={candidate.id}
                  style={{
                    border: "1px solid var(--color-border-muted)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    background: "var(--color-bg-secondary)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {candidate.title}
                  </div>
                  <p
                    className="settings-form-hint"
                    style={{ margin: "4px 0 0 0" }}
                  >
                    {translate(
                      "improvementSettings.candidates.status",
                      "Status:",
                    )}{" "}
                    <code>{candidate.status}</code>
                    {" | "}
                    {translate(
                      "improvementSettings.candidates.failureStreak",
                      "Failure streak:",
                    )}{" "}
                    <code>{candidate.failureStreak || 0}</code>
                    {candidate.lastFailureClass ? (
                      <>
                        {" "}
                        |{" "}
                        {translate(
                          "improvementSettings.candidates.lastFailure",
                          "Last failure:",
                        )}{" "}
                        <code>{candidate.lastFailureClass}</code>
                      </>
                    ) : null}
                  </p>
                  <p
                    className="settings-form-hint"
                    style={{ margin: "6px 0 0 0" }}
                  >
                    {candidate.parkReason || candidate.summary}
                  </p>
                  <p
                    className="settings-form-hint"
                    style={{ margin: "6px 0 0 0" }}
                  >
                    {translate(
                      "improvementSettings.candidates.cooldownUntil",
                      "Cooldown until:",
                    )}{" "}
                    <code>{formatTimestamp(candidate.cooldownUntil)}</code>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="settings-subsection">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ marginBottom: 4 }}>
              {translate(
                "improvementSettings.candidates.title",
                "Workspace Candidates",
              )}
            </h3>
            <p className="settings-form-hint" style={{ margin: 0 }}>
              {translate(
                "improvementSettings.candidates.description",
                "Refresh signals to update the backlog, then start the next campaign manually if you do not want to wait for auto-run.",
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="settings-button"
              onClick={() => void refreshCandidates()}
              disabled={busy}
            >
              {translate(
                "improvementSettings.candidates.refreshSignals",
                "Refresh Signals",
              )}
            </button>
            <button
              className="settings-button"
              onClick={() => void runNextExperiment()}
              disabled={busy || !settings.enabled || eligibilityBlocked}
            >
              {translate(
                "improvementSettings.candidates.runNextCampaign",
                "Run Next Campaign",
              )}
            </button>
            <button
              className="settings-button settings-button-secondary"
              onClick={() => void resetHistory()}
              disabled={busy}
            >
              {translate(
                "improvementSettings.candidates.resetHistory",
                "Reset History",
              )}
            </button>
          </div>
        </div>
        {actionMessage ? (
          <p
            className="settings-form-hint"
            style={{ marginTop: 10, marginBottom: 0 }}
          >
            {actionMessage}
          </p>
        ) : null}

        {workspaces.length > 0 ? (
          <div className="settings-form-group" style={{ maxWidth: 520 }}>
            <label className="settings-label">
              {translate(
                "improvementSettings.candidates.workspace",
                "Workspace",
              )}
            </label>
            <select
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              className="settings-select"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  color: selectedWorkspaceMode.tone,
                  background:
                    "color-mix(in srgb, currentColor 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, currentColor 25%, transparent)",
                }}
              >
                {selectedWorkspaceMode.label}
              </span>
              <span className="settings-form-hint" style={{ margin: 0 }}>
                {selectedWorkspaceMode.description}
              </span>
            </div>
          </div>
        ) : null}

        <div
          className="settings-form-group"
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <div style={{ width: 260, maxWidth: "100%" }}>
            <label className="settings-label">
              {translate(
                "improvementSettings.candidates.issueStatus",
                "Issue Status",
              )}
            </label>
            <select
              value={candidateStatusFilter}
              onChange={(event) => setCandidateStatusFilter(event.target.value)}
              className="settings-select"
            >
              <option value="all">
                {translate(
                  "improvementSettings.candidates.status.all",
                  "All Statuses",
                )}
              </option>
              <option value="open">
                {translate(
                  "improvementSettings.candidates.status.open",
                  "Open",
                )}
              </option>
              <option value="running">
                {translate(
                  "improvementSettings.candidates.status.running",
                  "Running",
                )}
              </option>
              <option value="review">
                {translate(
                  "improvementSettings.candidates.status.review",
                  "Review",
                )}
              </option>
              <option value="parked">
                {translate(
                  "improvementSettings.candidates.status.parked",
                  "Parked",
                )}
              </option>
              <option value="resolved">
                {translate(
                  "improvementSettings.candidates.status.resolved",
                  "Resolved",
                )}
              </option>
              <option value="dismissed">
                {translate(
                  "improvementSettings.candidates.status.dismissed",
                  "Dismissed",
                )}
              </option>
            </select>
          </div>
          <div style={{ width: 260, maxWidth: "100%" }}>
            <label className="settings-label">
              {translate(
                "improvementSettings.candidates.issueType",
                "Issue Type",
              )}
            </label>
            <select
              value={candidateSourceFilter}
              onChange={(event) => setCandidateSourceFilter(event.target.value)}
              className="settings-select"
            >
              <option value="all">
                {translate(
                  "improvementSettings.candidates.type.all",
                  "All Types",
                )}
              </option>
              <option value="task_failure">
                {translate(
                  "improvementSettings.candidates.type.taskFailure",
                  "Task Failure",
                )}
              </option>
              <option value="verification_failure">
                {translate(
                  "improvementSettings.candidates.type.verificationFailure",
                  "Verification Failure",
                )}
              </option>
              <option value="user_feedback">
                {translate(
                  "improvementSettings.candidates.type.userFeedback",
                  "User Feedback",
                )}
              </option>
              <option value="dev_log">
                {translate(
                  "improvementSettings.candidates.type.devLog",
                  "Dev Log",
                )}
              </option>
            </select>
          </div>
        </div>

        <p className="settings-form-hint" style={{ marginTop: 0 }}>
          {translate("improvementSettings.candidates.showing", "Showing")}{" "}
          <code>{filteredCandidates.length}</code>{" "}
          {translate("improvementSettings.candidates.of", "of")}{" "}
          <code>{candidates.length}</code>{" "}
          {translate(
            "improvementSettings.candidates.showingSuffix",
            "candidate issue(s) for the current workspace filter.",
          )}
        </p>

        <div style={SCROLL_PANEL_STYLE}>
          {filteredCandidates.length === 0 ? (
            <p className="settings-form-hint">
              {translate(
                "improvementSettings.candidates.empty",
                "No candidate issues match the current filters.",
              )}
            </p>
          ) : (
            filteredCandidates.map((candidate) => (
              <div key={candidate.id} className="settings-form-group">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {candidate.title}
                    </div>
                    <p
                      className="settings-form-hint"
                      style={{ margin: "4px 0 0 0" }}
                    >
                      {candidate.summary}
                    </p>
                    <p
                      className="settings-form-hint"
                      style={{ margin: "6px 0 0 0" }}
                    >
                      {translate(
                        "improvementSettings.candidates.source",
                        "Source:",
                      )}{" "}
                      <code>{candidate.source}</code>
                      {" | "}
                      {translate(
                        "improvementSettings.candidates.status",
                        "Status:",
                      )}{" "}
                      <code>{candidate.status}</code>
                      {" | "}
                      {translate(
                        "improvementSettings.candidates.priority",
                        "Priority:",
                      )}{" "}
                      <code>{candidate.priorityScore.toFixed(2)}</code>
                      {" | "}
                      {translate(
                        "improvementSettings.candidates.recurrence",
                        "Recurrence:",
                      )}{" "}
                      <code>{candidate.recurrenceCount}</code>
                      {candidate.readiness ? (
                        <>
                          {" "}
                          |{" "}
                          {translate(
                            "improvementSettings.candidates.readiness",
                            "Readiness:",
                          )}{" "}
                          <code>{candidate.readiness}</code>
                        </>
                      ) : null}
                      {selectedWorkspaceId === ALL_WORKSPACES_VALUE ? (
                        <>
                          {" "}
                          |{" "}
                          {translate(
                            "improvementSettings.candidates.workspace",
                            "Workspace:",
                          )}{" "}
                          <code>
                            {workspaceNameById.get(candidate.workspaceId) ||
                              candidate.workspaceId}
                          </code>
                        </>
                      ) : null}
                    </p>
                    {candidate.readinessReason || candidate.lastSkipReason ? (
                      <p
                        className="settings-form-hint"
                        style={{ margin: "6px 0 0 0" }}
                      >
                        {candidate.readinessReason || candidate.lastSkipReason}
                      </p>
                    ) : null}
                  </div>
                  {candidate.status !== "dismissed" ? (
                    <button
                      className="settings-button settings-button-secondary"
                      onClick={() => void dismissCandidate(candidate.id)}
                      disabled={busy}
                    >
                      {translate("common.dismiss", "Dismiss")}
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>
            {translate("improvementSettings.campaigns.title", "Campaigns")}
          </h3>
          <div style={SCROLL_PANEL_STYLE}>
            <SectionTitle
              title={translate(
                "improvementSettings.campaigns.reviewQueue",
                "Review Queue",
              )}
              hint={translate(
                "improvementSettings.campaigns.reviewQueueHint",
                "Judge-approved campaigns waiting for promotion or dismissal.",
              )}
            />
            {pendingReviewCampaigns.length === 0 ? (
              <p className="settings-form-hint">
                {translate(
                  "improvementSettings.campaigns.noReview",
                  "No campaigns are waiting for review.",
                )}
              </p>
            ) : (
              pendingReviewCampaigns.map((campaign) => (
                <CampaignCard
                  key={`review-${campaign.id}`}
                  campaign={campaign}
                  workspaceNameById={workspaceNameById}
                  showWorkspace={selectedWorkspaceId === ALL_WORKSPACES_VALUE}
                  onOpenTask={props?.onOpenTask}
                  primaryActionLabel={
                    campaign.promotionStatus === "promotion_failed"
                      ? settings.promotionMode === "github_pr"
                        ? translate(
                            "improvementSettings.campaigns.retryPr",
                            "Retry PR",
                          )
                        : translate(
                            "improvementSettings.campaigns.retryMerge",
                            "Retry Merge",
                          )
                      : settings.promotionMode === "github_pr"
                        ? translate(
                            "improvementSettings.campaigns.acceptOpenPr",
                            "Accept + Open PR",
                          )
                        : translate(
                            "improvementSettings.campaigns.acceptMerge",
                            "Accept + Merge",
                          )
                  }
                  onPrimaryAction={() =>
                    void reviewCampaign(campaign.id, "accepted")
                  }
                  onSecondaryAction={() =>
                    void reviewCampaign(campaign.id, "dismissed")
                  }
                  busy={busy || eligibilityBlocked}
                />
              ))
            )}

            <SectionTitle
              title={translate(
                "improvementSettings.campaigns.recentPromotions",
                "Recent Promotions",
              )}
              hint={translate(
                "improvementSettings.campaigns.recentPromotionsHint",
                "Recent PRs, merges, and direct-apply campaign promotions.",
              )}
            />
            {recentPromotedCampaigns.length === 0 ? (
              <p className="settings-form-hint">
                {translate(
                  "improvementSettings.campaigns.noPromotions",
                  "No campaign promotions have been recorded yet.",
                )}
              </p>
            ) : (
              recentPromotedCampaigns.map((campaign) => (
                <CampaignCard
                  key={`promo-${campaign.id}`}
                  campaign={campaign}
                  workspaceNameById={workspaceNameById}
                  showWorkspace={selectedWorkspaceId === ALL_WORKSPACES_VALUE}
                />
              ))
            )}

            <SectionTitle
              title={translate(
                "improvementSettings.campaigns.activity",
                "Campaign Activity",
              )}
              hint={translate(
                "improvementSettings.campaigns.activityHint",
                "Variant fan-out, current leader, and judge outcome for recent campaigns.",
              )}
            />
            {recentCampaigns.length === 0 ? (
              <p className="settings-form-hint">
                {translate(
                  "improvementSettings.campaigns.noActivity",
                  "No campaign activity has been recorded for this view yet.",
                )}
              </p>
            ) : (
              recentCampaigns.map((campaign) => (
                <CampaignCard
                  key={`campaign-${campaign.id}`}
                  campaign={campaign}
                  workspaceNameById={workspaceNameById}
                  showWorkspace={selectedWorkspaceId === ALL_WORKSPACES_VALUE}
                  onOpenTask={props?.onOpenTask}
                  showRetry={campaign.status === "failed"}
                  onRetry={() => void retryCampaign(campaign.id)}
                  busy={busy || eligibilityBlocked}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HintBlock(props: { title: string; children: ReactNode }) {
  return (
    <div className="settings-form-group">
      <p className="settings-form-hint" style={{ margin: 0 }}>
        <strong>{props.title}</strong> {props.children}
      </p>
    </div>
  );
}

function SectionTitle(props: { title: string; hint: string }) {
  return (
    <div className="settings-form-group">
      <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
        {props.title}
      </div>
      <p className="settings-form-hint" style={{ margin: "4px 0 0 0" }}>
        {props.hint}
      </p>
    </div>
  );
}

function MetricCard(props: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border-muted)",
        borderRadius: 12,
        padding: "14px 16px",
        background: "var(--color-bg-secondary)",
      }}
    >
      <div className="settings-form-hint" style={{ margin: 0 }}>
        {props.label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: props.tone,
          marginTop: 4,
        }}
      >
        {props.value}
      </div>
      <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
        {props.hint}
      </p>
    </div>
  );
}

function CampaignCard(props: {
  campaign: ImprovementCampaign;
  workspaceNameById: Map<string, string>;
  showWorkspace: boolean;
  onOpenTask?: (taskId: string) => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  showRetry?: boolean;
  onRetry?: () => void;
  busy?: boolean;
}) {
  useLanguage();
  const winner = props.campaign.variants.find(
    (variant) => variant.id === props.campaign.winnerVariantId,
  );
  return (
    <div className="settings-form-group">
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
            {props.campaign.verdictSummary ||
              translate(
                "improvementSettings.campaigns.fallbackTitle",
                "Improvement campaign",
              )}
          </div>
          <p className="settings-form-hint" style={{ margin: "4px 0 0 0" }}>
            {translate("improvementSettings.campaigns.campaign", "Campaign:")}{" "}
            <code>{props.campaign.status}</code>
            {" | "}
            {translate("improvementSettings.campaigns.review", "Review:")}{" "}
            <code>{props.campaign.reviewStatus}</code>
            {" | "}
            {translate(
              "improvementSettings.campaigns.promotion",
              "Promotion:",
            )}{" "}
            <code>{props.campaign.promotionStatus || "idle"}</code>
            {props.campaign.stage ? (
              <>
                {" "}
                | {translate(
                  "improvementSettings.campaigns.stage",
                  "Stage:",
                )}{" "}
                <code>{props.campaign.stage}</code>
              </>
            ) : null}
            {winner ? (
              <>
                {" "}
                | {translate(
                  "improvementSettings.campaigns.winner",
                  "Winner:",
                )}{" "}
                <code>{winner.lane}</code>
              </>
            ) : null}
            {props.showWorkspace ? (
              <>
                {" "}
                |{" "}
                {translate(
                  "improvementSettings.candidates.workspace",
                  "Workspace:",
                )}{" "}
                <code>
                  {props.workspaceNameById.get(props.campaign.workspaceId) ||
                    props.campaign.workspaceId}
                </code>
              </>
            ) : null}
          </p>
          <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
            {translate("improvementSettings.campaigns.variants", "Variants:")}{" "}
            {props.campaign.variants.map((variant) => (
              <span key={variant.id}>
                <code>{variant.lane}</code>=<code>{variant.status}</code>{" "}
              </span>
            ))}
          </p>
          {props.campaign.stopReason || props.campaign.promotionError ? (
            <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
              {translate(
                "improvementSettings.campaigns.stopReason",
                "Stop reason:",
              )}{" "}
              <code>{props.campaign.stopReason || "n/a"}</code>
              {props.campaign.promotionError
                ? ` | ${props.campaign.promotionError}`
                : ""}
            </p>
          ) : null}
          {props.campaign.providerHealthSnapshot ? (
            <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
              {translate(
                "improvementSettings.campaigns.providerSnapshot",
                "Provider snapshot:",
              )}{" "}
              {Object.entries(props.campaign.providerHealthSnapshot).map(
                ([key, value]) => (
                  <span key={key}>
                    <code>{key}</code>=<code>{String(value)}</code>{" "}
                  </span>
                ),
              )}
            </p>
          ) : null}
          {props.campaign.verificationCommands?.length ? (
            <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
              {translate(
                "improvementSettings.campaigns.verificationCommands",
                "Verification commands:",
              )}{" "}
              {props.campaign.verificationCommands.map((command) => (
                <span key={command}>
                  <code>{command}</code>{" "}
                </span>
              ))}
            </p>
          ) : null}
          {props.campaign.observability?.stageTransitions?.length ? (
            <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
              {translate(
                "improvementSettings.campaigns.latestStageNote",
                "Latest stage note:",
              )}{" "}
              <code>
                {props.campaign.observability.stageTransitions[
                  props.campaign.observability.stageTransitions.length - 1
                ]?.detail || "n/a"}
              </code>
            </p>
          ) : null}
          {props.campaign.judgeVerdict ? (
            <p className="settings-form-hint" style={{ margin: "6px 0 0 0" }}>
              {translate("improvementSettings.campaigns.judge", "Judge:")}{" "}
              <code>{props.campaign.judgeVerdict.status}</code>
              {" | "}
              {translate(
                "improvementSettings.campaigns.rankings",
                "Rankings:",
              )}{" "}
              {props.campaign.judgeVerdict.variantRankings.map((ranking) => (
                <span key={ranking.variantId}>
                  <code>{ranking.lane}</code>:
                  <code>{ranking.score.toFixed(2)}</code>{" "}
                </span>
              ))}
            </p>
          ) : null}
        </div>
        {props.primaryActionLabel || props.showRetry ? (
          <div
            style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}
          >
            {props.primaryActionLabel && props.onPrimaryAction ? (
              <button
                className="settings-button"
                onClick={props.onPrimaryAction}
                disabled={props.busy}
              >
                {props.primaryActionLabel}
              </button>
            ) : null}
            {props.onSecondaryAction ? (
              <button
                className="settings-button settings-button-secondary"
                onClick={props.onSecondaryAction}
                disabled={props.busy}
              >
                {translate("common.dismiss", "Dismiss")}
              </button>
            ) : null}
            {props.showRetry && props.onRetry ? (
              <button
                className="settings-button settings-button-secondary"
                onClick={props.onRetry}
                disabled={props.busy}
              >
                {translate(
                  "improvementSettings.campaigns.retryCampaign",
                  "Retry Campaign",
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {props.onOpenTask && winner?.taskId ? (
        <div
          style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          <button
            className="settings-button settings-button-secondary"
            onClick={() => props.onOpenTask?.(winner.taskId!)}
          >
            {translate(
              "improvementSettings.campaigns.openWinnerTask",
              "Open Winner Task",
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ToggleRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-form-group">
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
            {props.label}
          </div>
          <p
            className="settings-form-hint"
            style={{ marginTop: 4, marginBottom: 0 }}
          >
            {props.description}
          </p>
        </div>
        <label
          className="settings-toggle"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <input
            type="checkbox"
            checked={props.checked}
            disabled={props.disabled}
            onChange={(event) => props.onChange(event.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>
    </div>
  );
}

function NumberRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="settings-form-group">
      <label className="settings-label">{props.label}</label>
      <input
        type="number"
        className="settings-input"
        min={props.min}
        max={props.max}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) =>
          props.onChange(Number(event.target.value) || props.min)
        }
      />
    </div>
  );
}

function SelectRow(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-form-group">
      <label className="settings-label">{props.label}</label>
      <select
        className="settings-select"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
