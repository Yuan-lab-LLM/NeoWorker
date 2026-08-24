import { useState, useEffect, useCallback } from "react";
import { ChatGPTImportWizard } from "./ChatGPTImportWizard";
import { PromptMemoryImportWizard } from "./PromptMemoryImportWizard";
import { translate, useLanguage } from "../i18n";

// Types inlined since preload types aren't directly importable in renderer
type PrivacyMode = "normal" | "strict" | "disabled";

interface MemorySettingsData {
  workspaceId: string;
  enabled: boolean;
  autoCapture: boolean;
  compressionEnabled: boolean;
  retentionDays: number;
  maxStorageMb: number;
  privacyMode: PrivacyMode;
  excludedPatterns?: string[];
}

interface MemoryStats {
  count: number;
  totalTokens: number;
  compressedCount: number;
  compressionRatio: number;
}

interface ImportedStats {
  count: number;
  totalTokens: number;
}

type UserFactCategory =
  | "identity"
  | "preference"
  | "bio"
  | "work"
  | "goal"
  | "operating"
  | "voice"
  | "accountability"
  | "constraint"
  | "other";

interface UserFact {
  id: string;
  category: UserFactCategory;
  value: string;
  confidence: number;
  source: "conversation" | "feedback" | "manual";
  pinned?: boolean;
  firstSeenAt: number;
  lastUpdatedAt: number;
  lastTaskId?: string;
}

interface UserProfile {
  summary?: string;
  facts: UserFact[];
  updatedAt: number;
}

type RelationshipLayer =
  "identity" | "preferences" | "context" | "history" | "commitments";

interface RelationshipMemoryItem {
  id: string;
  layer: RelationshipLayer;
  text: string;
  confidence: number;
  source: "conversation" | "feedback" | "task";
  createdAt: number;
  updatedAt: number;
  status?: "open" | "done";
  dueAt?: number;
}

interface MemoryItem {
  id: string;
  content: string;
  tokens: number;
  createdAt: number;
  type?: string;
}

interface ChronicleObservationItem {
  id: string;
  appName: string;
  windowTitle: string;
  localTextSnippet?: string;
  capturedAt: number;
  destinationHints?: string[];
  memoryId?: string;
}

interface MemorySettingsProps {
  workspaceId: string;
  onSettingsChanged?: () => void;
}

interface ToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Parse imported-memory tags from memory content */
function parseImportTag(content: string): {
  title: string;
  preview: string;
  ignoredForPromptRecall: boolean;
  isImported: boolean;
} {
  const ignoredForPromptRecall = /^\s*\[neoworker:prompt_recall=ignore\]/.test(
    content,
  );
  const normalizedContent = content.replace(
    /^\s*\[neoworker:prompt_recall=ignore\]\s*(?:\r?\n)?/,
    "",
  );

  const match = normalizedContent.match(
    /^\[Imported from\s+(.+?)\s*[-—]\s*"(.+?)"\s*(?:\([^)]+\))?\]\n?([\s\S]*)/,
  );
  if (match) {
    return {
      title: `${match[1]}: ${match[2]}`,
      preview: match[3].slice(0, 200),
      ignoredForPromptRecall,
      isImported: true,
    };
  }
  const fallback = normalizedContent.match(
    /^\[Imported from\s+([^\]]+)\]\n?([\s\S]*)/,
  );
  if (fallback) {
    return {
      title: translate("memory.importedFrom", "Imported from {source}", {
        source: fallback[1],
      }),
      preview: (fallback[2] || "").slice(0, 200),
      ignoredForPromptRecall,
      isImported: true,
    };
  }
  return {
    title: translate("memory.type.memory", "Memory"),
    preview: normalizedContent.slice(0, 200),
    ignoredForPromptRecall,
    isImported: false,
  };
}

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.floor(deltaMs / (60 * 1000));
  if (minutes < 1)
    return translate("memory.time.updatedJustNow", "Updated just now");
  if (minutes < 60) {
    return translate(
      "memory.time.updatedMinutesAgo",
      "Updated {count} minute(s) ago",
      {
        count: minutes,
      },
    );
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return translate(
      "memory.time.updatedHoursAgo",
      "Updated {count} hour(s) ago",
      {
        count: hours,
      },
    );
  }
  const days = Math.floor(hours / 24);
  return translate("memory.time.updatedDaysAgo", "Updated {count} day(s) ago", {
    count: days,
  });
}

function formatMemoryTypeLabel(type?: string): string {
  if (!type) return translate("memory.type.memory", "Memory");
  if (type === "screen_context")
    return translate("memory.type.screenContext", "Screen context");
  return `${type.charAt(0).toUpperCase()}${type.slice(1).replace(/_/g, " ")}`;
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: ToggleRowProps) {
  return (
    <div className="settings-form-group">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
            {title}
          </div>
          <p
            className="settings-form-hint"
            style={{ marginTop: "4px", marginBottom: 0 }}
          >
            {description}
          </p>
        </div>
        <label
          className="settings-toggle"
          style={{ flexShrink: 0, marginTop: "2px" }}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
          />
          <span className="toggle-slider" />
        </label>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

export function MemorySettings({
  workspaceId,
  onSettingsChanged,
}: MemorySettingsProps) {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<MemorySettingsData | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showPromptImportWizard, setShowPromptImportWizard] = useState(false);
  const [showManageMemories, setShowManageMemories] = useState(false);

  // Imported memories state
  const [importedStats, setImportedStats] = useState<ImportedStats | null>(
    null,
  );
  const [showImported, setShowImported] = useState(false);
  const [importedMemories, setImportedMemories] = useState<MemoryItem[]>([]);
  const [importedOffset, setImportedOffset] = useState(0);
  const [importedHasMore, setImportedHasMore] = useState(false);
  const [loadingImported, setLoadingImported] = useState(false);
  const [deletingImported, setDeletingImported] = useState(false);
  const [deletingImportedEntryId, setDeletingImportedEntryId] = useState<
    string | null
  >(null);
  const [updatingImportedEntryId, setUpdatingImportedEntryId] = useState<
    string | null
  >(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [newFact, setNewFact] = useState("");
  const [newFactCategory, setNewFactCategory] =
    useState<UserFactCategory>("preference");
  const [savingFact, setSavingFact] = useState(false);
  const [relationshipItems, setRelationshipItems] = useState<
    RelationshipMemoryItem[]
  >([]);
  const [dueSoonItems, setDueSoonItems] = useState<RelationshipMemoryItem[]>(
    [],
  );
  const [dueSoonReminder, setDueSoonReminder] = useState("");
  const [cleaningRecurringHistory, setCleaningRecurringHistory] =
    useState(false);
  const [recurringCleanupMessage, setRecurringCleanupMessage] = useState("");
  const [recentMemories, setRecentMemories] = useState<MemoryItem[]>([]);
  const [chronicleObservations, setChronicleObservations] = useState<
    ChronicleObservationItem[]
  >([]);
  const [memorySearchQuery, setMemorySearchQuery] = useState("");
  const [memorySearchResults, setMemorySearchResults] = useState<MemoryItem[]>(
    [],
  );
  const [searchingMemories, setSearchingMemories] = useState(false);
  const [clearingChronicle, setClearingChronicle] = useState(false);
  const [deletingChronicleId, setDeletingChronicleId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (workspaceId) {
      loadData();
    }
  }, [workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        loadedSettings,
        loadedStats,
        loadedImportedStats,
        loadedUserProfile,
        loadedRelationshipItems,
        loadedDueSoon,
        loadedRecentMemories,
        loadedChronicleObservations,
      ] = await Promise.all([
        window.electronAPI.getMemorySettings(workspaceId),
        window.electronAPI.getMemoryStats(workspaceId),
        window.electronAPI.getImportedMemoryStats(workspaceId),
        window.electronAPI.getUserProfile(),
        window.electronAPI.listRelationshipMemory({
          limit: 80,
          includeDone: false,
        }),
        window.electronAPI.getDueSoonCommitments(72),
        window.electronAPI.getRecentMemories({ workspaceId, limit: 20 }),
        window.electronAPI.listChronicleObservations({
          workspaceId,
          limit: 50,
        }),
      ]);
      setSettings(loadedSettings);
      setStats(loadedStats);
      setImportedStats(loadedImportedStats);
      setUserProfile(loadedUserProfile);
      setRelationshipItems(
        Array.isArray(loadedRelationshipItems) ? loadedRelationshipItems : [],
      );
      setDueSoonItems(
        Array.isArray(loadedDueSoon?.items) ? loadedDueSoon.items : [],
      );
      setDueSoonReminder(
        typeof loadedDueSoon?.reminderText === "string"
          ? loadedDueSoon.reminderText
          : "",
      );
      setRecentMemories(
        Array.isArray(loadedRecentMemories) ? loadedRecentMemories : [],
      );
      setChronicleObservations(
        Array.isArray(loadedChronicleObservations)
          ? loadedChronicleObservations
          : [],
      );
    } catch (error) {
      console.error("Failed to load memory settings:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const query = memorySearchQuery.trim();
    if (!query) {
      setMemorySearchResults([]);
      setSearchingMemories(false);
      return;
    }

    let cancelled = false;
    setSearchingMemories(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await window.electronAPI.searchMemories({
          workspaceId,
          query,
          limit: 30,
        });
        if (cancelled) return;
        const details = await window.electronAPI.getMemoryDetails(
          results.map((r) => r.id),
        );
        if (cancelled) return;
        setMemorySearchResults(Array.isArray(details) ? details : []);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to search memories:", error);
          setMemorySearchResults([]);
        }
      } finally {
        if (!cancelled) {
          setSearchingMemories(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [memorySearchQuery, workspaceId]);

  const loadImportedMemories = useCallback(
    async (offset = 0) => {
      try {
        setLoadingImported(true);
        const memories = await window.electronAPI.findImportedMemories({
          workspaceId,
          limit: PAGE_SIZE,
          offset,
        });
        if (offset === 0) {
          setImportedMemories(memories);
        } else {
          setImportedMemories((prev) => [...prev, ...memories]);
        }
        setImportedOffset(offset + memories.length);
        setImportedHasMore(memories.length === PAGE_SIZE);
      } catch (error) {
        console.error("Failed to load imported memories:", error);
      } finally {
        setLoadingImported(false);
      }
    },
    [workspaceId],
  );

  const handleToggleImported = () => {
    if (!showImported) {
      loadImportedMemories(0);
    }
    setShowImported(!showImported);
  };

  const handleDeleteImported = async () => {
    if (
      !confirm(
        t(
          "memory.confirm.deleteImported",
          "Are you sure you want to delete all imported memories? Native memories will not be affected. This cannot be undone.",
        ),
      )
    ) {
      return;
    }
    try {
      setDeletingImported(true);
      await window.electronAPI.deleteImportedMemories(workspaceId);
      setImportedMemories([]);
      setImportedOffset(0);
      setImportedHasMore(false);
      setShowImported(false);
      await loadData();
    } catch (error) {
      console.error("Failed to delete imported memories:", error);
    } finally {
      setDeletingImported(false);
    }
  };

  const handleDeleteImportedEntry = async (memoryId: string) => {
    if (
      !confirm(
        t(
          "memory.confirm.deleteImportedEntry",
          "Delete this imported memory entry? This cannot be undone.",
        ),
      )
    ) {
      return;
    }
    try {
      setDeletingImportedEntryId(memoryId);
      await window.electronAPI.deleteImportedMemoryEntry({
        workspaceId,
        memoryId,
      });
      await loadImportedMemories(0);
      await loadData();
    } catch (error) {
      console.error("Failed to delete imported memory entry:", error);
    } finally {
      setDeletingImportedEntryId(null);
    }
  };

  const handleToggleImportedPromptRecallIgnored = async (
    memoryId: string,
    currentlyIgnored: boolean,
  ) => {
    try {
      setUpdatingImportedEntryId(memoryId);
      const result =
        await window.electronAPI.setImportedMemoryPromptRecallIgnored({
          workspaceId,
          memoryId,
          ignored: !currentlyIgnored,
        });

      if (result?.memory) {
        setImportedMemories((prev) =>
          prev.map((entry) =>
            entry.id === memoryId
              ? {
                  ...entry,
                  content: result.memory?.content ?? entry.content,
                  tokens: result.memory?.tokens ?? entry.tokens,
                  createdAt: result.memory?.createdAt ?? entry.createdAt,
                  type: result.memory?.type ?? entry.type,
                }
              : entry,
          ),
        );
      } else {
        await loadImportedMemories(0);
      }

      await loadData();
    } catch (error) {
      console.error(
        "Failed to update imported memory prompt-recall state:",
        error,
      );
    } finally {
      setUpdatingImportedEntryId(null);
    }
  };

  const handleSave = async (updates: Partial<MemorySettingsData>) => {
    if (!settings) return;
    try {
      setSaving(true);
      await window.electronAPI.saveMemorySettings({
        workspaceId,
        settings: updates,
      });
      setSettings({ ...settings, ...updates });
      onSettingsChanged?.();
    } catch (error) {
      console.error("Failed to save memory settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (
      !confirm(
        t(
          "memory.confirm.clearAll",
          "Are you sure you want to clear all memories for this workspace? This cannot be undone.",
        ),
      )
    ) {
      return;
    }
    try {
      setClearing(true);
      await window.electronAPI.clearMemory(workspaceId);
      setImportedMemories([]);
      setImportedOffset(0);
      setImportedHasMore(false);
      setShowImported(false);
      await loadData();
    } catch (error) {
      console.error("Failed to clear memory:", error);
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteChronicleObservation = async (observationId: string) => {
    try {
      setDeletingChronicleId(observationId);
      await window.electronAPI.deleteChronicleObservation({
        workspaceId,
        observationId,
      });
      await loadData();
    } catch (error) {
      console.error("Failed to delete Chronicle observation:", error);
    } finally {
      setDeletingChronicleId(null);
    }
  };

  const handleClearChronicleObservations = async () => {
    try {
      setClearingChronicle(true);
      await window.electronAPI.clearChronicleObservations({ workspaceId });
      await loadData();
    } catch (error) {
      console.error("Failed to clear Chronicle observations:", error);
    } finally {
      setClearingChronicle(false);
    }
  };

  const handleAddFact = async () => {
    const trimmed = newFact.trim();
    if (!trimmed) return;
    try {
      setSavingFact(true);
      const created = await window.electronAPI.addUserFact({
        category: newFactCategory,
        value: trimmed,
        source: "manual",
        confidence: 1,
      });
      setUserProfile((prev) => ({
        summary: prev?.summary,
        updatedAt: Date.now(),
        facts: [created, ...(prev?.facts || [])],
      }));
      setNewFact("");
    } catch (error) {
      console.error("Failed to add user fact:", error);
    } finally {
      setSavingFact(false);
    }
  };

  const handleDeleteFact = async (factId: string) => {
    try {
      await window.electronAPI.deleteUserFact(factId);
      setUserProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          facts: prev.facts.filter((fact) => fact.id !== factId),
          updatedAt: Date.now(),
        };
      });
    } catch (error) {
      console.error("Failed to delete user fact:", error);
    }
  };

  const handleToggleFactPin = async (fact: UserFact) => {
    try {
      const updated = await window.electronAPI.updateUserFact({
        id: fact.id,
        pinned: !fact.pinned,
      });
      if (!updated) return;
      setUserProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          updatedAt: Date.now(),
          facts: prev.facts.map((existing) =>
            existing.id === updated.id ? updated : existing,
          ),
        };
      });
    } catch (error) {
      console.error("Failed to update user fact:", error);
    }
  };

  const handleDeleteRelationship = async (itemId: string) => {
    try {
      await window.electronAPI.deleteRelationshipMemory(itemId);
      setRelationshipItems((prev) => prev.filter((item) => item.id !== itemId));
      setDueSoonItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (error) {
      console.error("Failed to delete relationship memory:", error);
    }
  };

  const handleToggleCommitmentStatus = async (item: RelationshipMemoryItem) => {
    try {
      const nextStatus = item.status === "done" ? "open" : "done";
      const updated = await window.electronAPI.updateRelationshipMemory({
        id: item.id,
        status: nextStatus,
      });
      if (!updated) return;
      setRelationshipItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      if (nextStatus === "done") {
        setDueSoonItems((prev) => prev.filter((entry) => entry.id !== item.id));
      }
    } catch (error) {
      console.error("Failed to update commitment status:", error);
    }
  };

  const handleEditRelationship = async (item: RelationshipMemoryItem) => {
    const nextText = prompt(
      t("memory.relationship.editPrompt", "Edit memory item"),
      item.text,
    );
    if (nextText == null) return;
    const trimmed = nextText.trim();
    if (!trimmed) return;
    try {
      const updated = await window.electronAPI.updateRelationshipMemory({
        id: item.id,
        text: trimmed,
      });
      if (!updated) return;
      setRelationshipItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      setDueSoonItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? updated : entry)),
      );
    } catch (error) {
      console.error("Failed to edit relationship memory:", error);
    }
  };

  const handleCleanupRecurringHistory = async () => {
    if (
      !confirm(
        t(
          "memory.confirm.cleanupRecurring",
          "Collapse duplicate recurring completed-task history entries and keep only the latest per task title?",
        ),
      )
    ) {
      return;
    }
    try {
      setCleaningRecurringHistory(true);
      const result =
        await window.electronAPI.cleanupRecurringRelationshipHistory();
      setRecurringCleanupMessage(
        result.collapsed > 0
          ? t(
              "memory.relationship.cleanupSuccess",
              "Cleaned {collapsed} duplicate entries across {groups} recurring task title(s).",
              {
                collapsed: result.collapsed,
                groups: result.groupsCollapsed,
              },
            )
          : t(
              "memory.relationship.cleanupNone",
              "No duplicate recurring history entries found.",
            ),
      );
      await loadData();
    } catch (error) {
      console.error("Failed to cleanup recurring relationship history:", error);
      setRecurringCleanupMessage(
        t(
          "memory.relationship.cleanupFailed",
          "Failed to clean recurring history. Please try again.",
        ),
      );
    } finally {
      setCleaningRecurringHistory(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="settings-section">
        <div className="settings-loading">
          {t("memory.loading", "Loading memory settings...")}
        </div>
      </div>
    );
  }

  // Show import wizard full-screen in the settings panel
  if (showImportWizard) {
    return (
      <ChatGPTImportWizard
        workspaceId={workspaceId}
        onClose={() => {
          setShowImportWizard(false);
          loadData();
        }}
        onImportComplete={() => loadData()}
      />
    );
  }

  const latestMemory =
    recentMemories.find(
      (memory) => !/^\s*[{[]/.test((memory.content || "").trim()),
    ) || recentMemories[0];
  const selectedManageMemories = memorySearchQuery.trim()
    ? memorySearchResults
    : recentMemories;

  return (
    <div className="settings-section">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
        }}
      >
        <h3 className="settings-section-title" style={{ margin: 0 }}>
          {t("memory.title", "Memory")}
        </h3>
        <button
          className="settings-button"
          onClick={() => setShowManageMemories((prev) => !prev)}
          style={{ whiteSpace: "nowrap" }}
        >
          {showManageMemories
            ? t("memory.action.hideManage", "Hide Manage")
            : t("memory.action.manage", "Manage")}
        </button>
      </div>
      <p className="settings-section-description">
        {t(
          "memory.description",
          "Keep useful context over time, control what gets remembered, and review or delete memory whenever you want.",
        )}
      </p>

      <ToggleRow
        title={t("memory.toggle.use.title", "Use memory in responses")}
        description={t(
          "memory.toggle.use.description",
          "Allows the assistant to reference saved memories while responding.",
        )}
        checked={settings.enabled}
        onChange={(checked) => handleSave({ enabled: checked })}
        disabled={saving}
      />

      <ToggleRow
        title={t(
          "memory.toggle.autoCapture.title",
          "Generate memory from chat history",
        )}
        description={t(
          "memory.toggle.autoCapture.description",
          "Automatically stores useful context from chats/tasks. Turn this off to stop new memory creation.",
        )}
        checked={settings.autoCapture}
        onChange={(checked) => handleSave({ autoCapture: checked })}
        disabled={saving || !settings.enabled}
      />

      <div className="settings-form-group memory-preview-card">
        <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
          {t("memory.preview.title", "Memory from your chats")}
        </div>
        <p
          className="settings-form-hint"
          style={{ marginTop: "4px", marginBottom: "10px" }}
        >
          {latestMemory
            ? formatRelativeTime(latestMemory.createdAt)
            : t("memory.preview.emptyTime", "No memory captured yet")}
        </p>
        <div
          className="settings-card"
          style={{
            color: "var(--color-text-secondary)",
            fontSize: "13px",
            lineHeight: "1.45",
          }}
        >
          {latestMemory
            ? (() => {
                const preview =
                  parseImportTag(latestMemory.content).preview ||
                  latestMemory.content;
                return /^\s*[{[]/.test(preview.trim())
                  ? t(
                      "memory.preview.technical",
                      "Recent memory is technical/system content. Open Manage to inspect all memories.",
                    )
                  : preview;
              })()
            : t("memory.preview.empty", "No memory preview available yet.")}
        </div>
      </div>

      {/* Import from other AI providers */}
      <div className="settings-form-group memory-section">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: "4px",
              }}
            >
              {t(
                "memory.promptImport.title",
                "Import memory from other AI providers",
              )}
            </div>
            <p className="settings-form-hint" style={{ margin: 0 }}>
              {t(
                "memory.promptImport.description",
                "Bring relevant context and data from another AI provider. NeoWorker gives you a prompt to fetch memory from Claude, Gemini, Meta AI, and others.",
              )}
            </p>
          </div>
          <button
            className="chatgpt-import-btn chatgpt-import-btn-primary"
            onClick={() => setShowPromptImportWizard(true)}
            disabled={!settings.enabled}
            style={{
              opacity: settings.enabled ? 1 : 0.5,
              whiteSpace: "nowrap",
            }}
          >
            {t("memory.action.startImport", "Start Import")}
          </button>
        </div>
      </div>

      {showManageMemories && (
        <>
          <div className="settings-form-group memory-section">
            <div
              style={{
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: "8px",
              }}
            >
              {t("memory.manage.title", "Manage memories")}
            </div>
            <input
              className="settings-input"
              type="text"
              value={memorySearchQuery}
              onChange={(e) => setMemorySearchQuery(e.target.value)}
              placeholder={t(
                "memory.manage.searchPlaceholder",
                "Search memories",
              )}
              style={{ marginBottom: "10px" }}
            />
            <div className="memory-list" style={{ maxHeight: "220px" }}>
              {searchingMemories && (
                <div
                  className="memory-list-item"
                  style={{
                    color: "var(--color-text-secondary)",
                    fontSize: "13px",
                  }}
                >
                  {t("common.searching", "Searching...")}
                </div>
              )}
              {!searchingMemories && selectedManageMemories.length === 0 && (
                <div className="settings-empty">
                  {t("memory.manage.empty", "No memories found.")}
                </div>
              )}
              {!searchingMemories &&
                selectedManageMemories.slice(0, 30).map((memory) => {
                  const parsed = parseImportTag(memory.content);
                  const title = parsed.isImported
                    ? parsed.title
                    : memory.type
                      ? formatMemoryTypeLabel(memory.type)
                      : parsed.title;
                  return (
                    <div key={memory.id} className="memory-list-item">
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          fontSize: "13px",
                          marginBottom: "4px",
                        }}
                      >
                        {title}
                      </div>
                      <div
                        style={{
                          color: "var(--color-text-secondary)",
                          fontSize: "12px",
                        }}
                      >
                        {parsed.preview || memory.content.slice(0, 180)}
                      </div>
                      <div
                        style={{
                          color: "var(--color-text-tertiary)",
                          fontSize: "11px",
                          marginTop: "4px",
                        }}
                      >
                        {new Date(memory.createdAt).toLocaleDateString()}
                        {typeof memory.tokens === "number"
                          ? ` • ${t("memory.tokensCount", "{count} tokens", { count: memory.tokens })}`
                          : ""}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="settings-form-group memory-section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div
                style={{ fontWeight: 500, color: "var(--color-text-primary)" }}
              >
                {t("memory.chronicle.title", "Chronicle observations")}
              </div>
              <button
                className="settings-button"
                onClick={handleClearChronicleObservations}
                disabled={
                  clearingChronicle || chronicleObservations.length === 0
                }
              >
                {clearingChronicle
                  ? t("common.clearing", "Clearing...")
                  : t("memory.chronicle.clear", "Clear Chronicle")}
              </button>
            </div>
            <p className="settings-form-hint" style={{ marginTop: 0 }}>
              {t(
                "memory.chronicle.description",
                "Promoted Chronicle screen-context entries that were actually used by tasks.",
              )}
            </p>
            <div className="memory-list" style={{ maxHeight: "220px" }}>
              {chronicleObservations.length === 0 && (
                <div className="settings-empty">
                  {t(
                    "memory.chronicle.empty",
                    "No Chronicle observations stored yet.",
                  )}
                </div>
              )}
              {chronicleObservations.map((observation) => (
                <div
                  key={observation.id}
                  className="memory-list-item"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px",
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "var(--color-text-primary)",
                        fontSize: "13px",
                      }}
                    >
                      {observation.windowTitle ||
                        observation.appName ||
                        t("memory.type.screenContext", "Screen context")}
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-secondary)",
                        fontSize: "12px",
                      }}
                    >
                      {[observation.appName, observation.localTextSnippet]
                        .filter(Boolean)
                        .join(" • ")
                        .slice(0, 220) ||
                        t("memory.chronicle.noOcr", "No OCR text cached yet.")}
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-tertiary)",
                        fontSize: "11px",
                        marginTop: "4px",
                      }}
                    >
                      {new Date(observation.capturedAt).toLocaleString()}
                      {observation.destinationHints?.length
                        ? ` • ${observation.destinationHints.join(", ")}`
                        : ""}
                      {observation.memoryId
                        ? ` • ${t("memory.chronicle.memoryLinked", "memory linked")}`
                        : ""}
                    </div>
                  </div>
                  <button
                    className="memory-inline-btn danger"
                    disabled={deletingChronicleId === observation.id}
                    onClick={() =>
                      void handleDeleteChronicleObservation(observation.id)
                    }
                  >
                    {deletingChronicleId === observation.id
                      ? t("common.deleting", "Deleting...")
                      : t("common.delete", "Delete")}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* User Profile Facts */}
          <div className="settings-form-group memory-section">
            <div
              style={{
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: "4px",
              }}
            >
              {t("memory.facts.title", "User Memory Facts")}
            </div>
            <p className="settings-form-hint" style={{ marginTop: 0 }}>
              {t(
                "memory.facts.description",
                "Curate what the assistant remembers about preferences and context.",
              )}
            </p>

            <div className="memory-fact-form">
              <select
                className="settings-select"
                value={newFactCategory}
                onChange={(e) =>
                  setNewFactCategory(e.target.value as UserFactCategory)
                }
                disabled={savingFact}
              >
                <option value="identity">
                  {t("memory.category.identity", "Identity")}
                </option>
                <option value="preference">
                  {t("memory.category.preference", "Preference")}
                </option>
                <option value="bio">
                  {t("memory.category.bio", "Profile")}
                </option>
                <option value="work">
                  {t("memory.category.work", "Work")}
                </option>
                <option value="goal">
                  {t("memory.category.goal", "Goal")}
                </option>
                <option value="operating">
                  {t("memory.category.operating", "Operating Style")}
                </option>
                <option value="voice">
                  {t("memory.category.voice", "Voice")}
                </option>
                <option value="accountability">
                  {t("memory.category.accountability", "Accountability")}
                </option>
                <option value="constraint">
                  {t("memory.category.constraint", "Constraint")}
                </option>
                <option value="other">
                  {t("memory.category.other", "Other")}
                </option>
              </select>
              <input
                className="settings-input"
                type="text"
                value={newFact}
                onChange={(e) => setNewFact(e.target.value)}
                placeholder={t(
                  "memory.facts.placeholder",
                  "Add a fact (for example: Prefers concise responses)",
                )}
                disabled={savingFact}
              />
              <button
                className="settings-button"
                onClick={handleAddFact}
                disabled={savingFact || !newFact.trim()}
                style={{ minWidth: "74px" }}
              >
                {savingFact
                  ? t("common.saving", "Saving...")
                  : t("common.add", "Add")}
              </button>
            </div>

            <div className="memory-list" style={{ maxHeight: "220px" }}>
              {(!userProfile?.facts || userProfile.facts.length === 0) && (
                <div className="settings-empty">
                  {t("memory.facts.empty", "No user facts stored yet.")}
                </div>
              )}

              {(userProfile?.facts || [])
                .slice()
                .sort((a, b) => {
                  if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0))
                    return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                  if (a.confidence !== b.confidence)
                    return b.confidence - a.confidence;
                  return b.lastUpdatedAt - a.lastUpdatedAt;
                })
                .map((fact) => (
                  <div
                    key={fact.id}
                    className="memory-list-item"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: "8px",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          color: "var(--color-text-primary)",
                          fontSize: "13px",
                        }}
                      >
                        {fact.value}
                      </div>
                      <div
                        style={{
                          color: "var(--color-text-tertiary)",
                          fontSize: "11px",
                          marginTop: "2px",
                        }}
                      >
                        {fact.category} •{" "}
                        {t("memory.confidence", "{percent}% confidence", {
                          percent: Math.round(fact.confidence * 100),
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        className={`memory-inline-btn${fact.pinned ? " active" : ""}`}
                        onClick={() => handleToggleFactPin(fact)}
                      >
                        {fact.pinned
                          ? t("memory.facts.pinned", "Pinned")
                          : t("memory.facts.pin", "Pin")}
                      </button>
                      <button
                        className="memory-inline-btn danger"
                        onClick={() => handleDeleteFact(fact.id)}
                      >
                        {t("common.delete", "Delete")}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Relationship Memory */}
          <div className="settings-form-group memory-section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "6px",
              }}
            >
              <div
                style={{ fontWeight: 500, color: "var(--color-text-primary)" }}
              >
                {t("memory.relationship.title", "Relationship Memory")}
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <button
                  className="settings-button"
                  style={{ padding: "4px 10px" }}
                  onClick={handleCleanupRecurringHistory}
                  disabled={cleaningRecurringHistory}
                >
                  {cleaningRecurringHistory
                    ? t("memory.relationship.cleaning", "Cleaning...")
                    : t(
                        "memory.relationship.cleanOld",
                        "Clean Old Recurring History",
                      )}
                </button>
                <button
                  className="settings-button"
                  style={{ padding: "4px 10px" }}
                  onClick={() => loadData()}
                >
                  {t("common.refresh", "Refresh")}
                </button>
              </div>
            </div>
            <p className="settings-form-hint" style={{ marginTop: 0 }}>
              {t(
                "memory.relationship.description",
                "Continuity memory across identity, preferences, context, history, and commitments.",
              )}
            </p>
            {recurringCleanupMessage && (
              <div
                style={{
                  marginBottom: "8px",
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {recurringCleanupMessage}
              </div>
            )}

            <div
              style={{
                marginBottom: "8px",
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              {dueSoonReminder ||
                t("memory.relationship.noDueSoon", "No commitments due soon.")}
            </div>

            <div className="memory-list">
              {relationshipItems.length === 0 && (
                <div className="settings-empty">
                  {t(
                    "memory.relationship.empty",
                    "No relationship memory items stored yet.",
                  )}
                </div>
              )}
              {relationshipItems.map((item) => (
                <div
                  key={item.id}
                  className="memory-list-item"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "var(--color-text-primary)",
                        fontSize: "13px",
                      }}
                    >
                      {item.text}
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-tertiary)",
                        fontSize: "11px",
                        marginTop: "2px",
                      }}
                    >
                      {item.layer} •{" "}
                      {t("memory.confidence", "{percent}% confidence", {
                        percent: Math.round(item.confidence * 100),
                      })}
                      {item.status ? ` • ${item.status}` : ""}
                      {item.dueAt
                        ? ` • ${t("memory.relationship.due", "due {date}", {
                            date: new Date(item.dueAt).toLocaleDateString(),
                          })}`
                        : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {item.layer === "commitments" && (
                      <button
                        className={`memory-inline-btn${item.status === "done" ? " active" : ""}`}
                        onClick={() => handleToggleCommitmentStatus(item)}
                      >
                        {item.status === "done"
                          ? t("memory.relationship.reopen", "Reopen")
                          : t("memory.relationship.done", "Done")}
                      </button>
                    )}
                    <button
                      className="memory-inline-btn"
                      onClick={() => handleEditRelationship(item)}
                    >
                      {t("common.edit", "Edit")}
                    </button>
                    <button
                      className="memory-inline-btn danger"
                      onClick={() => handleDeleteRelationship(item.id)}
                    >
                      {t("memory.relationship.forget", "Forget")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {dueSoonItems.length > 0 && (
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "12px",
                  color: "var(--color-text-secondary)",
                }}
              >
                {t("memory.relationship.dueSoon", "Due soon:")}{" "}
                {dueSoonItems
                  .slice(0, 3)
                  .map((item) => item.text)
                  .join(" • ")}
              </div>
            )}
          </div>

          {/* Stats Display */}
          {stats && (
            <div className="memory-stats-grid">
              <div className="stat-card">
                <div className="stat-value">
                  {(stats.count ?? 0).toLocaleString()}
                </div>
                <div className="stat-label">
                  {t("memory.stats.memories", "Memories")}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {(stats.totalTokens ?? 0).toLocaleString()}
                </div>
                <div className="stat-label">
                  {t("memory.stats.tokens", "Tokens")}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {(stats.compressedCount ?? 0).toLocaleString()}
                </div>
                <div className="stat-label">
                  {t("memory.stats.compressed", "Compressed")}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {Math.round((stats.compressionRatio ?? 0) * 100)}%
                </div>
                <div className="stat-label">
                  {t("memory.stats.ratio", "Ratio")}
                </div>
              </div>
            </div>
          )}

          {/* Imported Memories Section */}
          {importedStats && importedStats.count > 0 && (
            <div className="settings-form-group memory-section">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "12px",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {t("memory.imported.title", "Imported Memories")}
                  </div>
                  <span className="settings-badge settings-badge--success">
                    {importedStats.count.toLocaleString()}
                  </span>
                </div>
                <button
                  className="memory-inline-btn"
                  onClick={handleToggleImported}
                >
                  {showImported
                    ? t("common.hide", "Hide")
                    : t("common.view", "View")}
                </button>
              </div>

              {/* Imported stats mini cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px",
                  marginBottom: showImported ? "12px" : 0,
                }}
              >
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {t("memory.imported.conversations", "Conversations")}
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {importedStats.count.toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--color-bg-tertiary)",
                    borderRadius: "6px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {t("memory.stats.tokens", "Tokens")}
                  </span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: "600",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {importedStats.totalTokens.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Expanded imported memories list */}
              {showImported && (
                <div>
                  <div className="memory-list" style={{ maxHeight: "300px" }}>
                    {importedMemories.map((memory) => {
                      const { title, preview, ignoredForPromptRecall } =
                        parseImportTag(memory.content);
                      const busy =
                        deletingImportedEntryId === memory.id ||
                        updatingImportedEntryId === memory.id;
                      return (
                        <div
                          key={memory.id}
                          className="memory-list-item"
                          style={{ fontSize: "13px" }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "4px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                minWidth: 0,
                                maxWidth: "70%",
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 500,
                                  color: "var(--color-text-primary)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {title}
                              </div>
                              {ignoredForPromptRecall && (
                                <span
                                  className="settings-badge settings-badge--warning"
                                  style={{ fontSize: "10px" }}
                                >
                                  {t(
                                    "memory.imported.ignoredInPrompts",
                                    "ignored in prompts",
                                  )}
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--color-text-tertiary)",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {new Date(memory.createdAt).toLocaleDateString()}{" "}
                              · {memory.tokens}{" "}
                              {t("memory.stats.tokensLower", "tokens")}
                            </div>
                          </div>
                          <div
                            style={{
                              color: "var(--color-text-secondary)",
                              fontSize: "12px",
                              lineHeight: "1.4",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical" as const,
                            }}
                          >
                            {preview}
                          </div>
                          <div
                            style={{
                              marginTop: "8px",
                              display: "flex",
                              gap: "8px",
                              justifyContent: "flex-end",
                            }}
                          >
                            <button
                              className="memory-inline-btn active"
                              onClick={() =>
                                handleToggleImportedPromptRecallIgnored(
                                  memory.id,
                                  ignoredForPromptRecall,
                                )
                              }
                              disabled={busy}
                              style={{ opacity: busy ? 0.6 : 1 }}
                            >
                              {updatingImportedEntryId === memory.id
                                ? t("common.saving", "Saving...")
                                : ignoredForPromptRecall
                                  ? t(
                                      "memory.imported.useInPrompts",
                                      "Use in prompts",
                                    )
                                  : t(
                                      "memory.imported.ignoreInPrompts",
                                      "Ignore in prompts",
                                    )}
                            </button>
                            <button
                              className="memory-inline-btn danger"
                              onClick={() =>
                                handleDeleteImportedEntry(memory.id)
                              }
                              disabled={busy}
                              style={{ opacity: busy ? 0.6 : 1 }}
                            >
                              {deletingImportedEntryId === memory.id
                                ? t("common.deleting", "Deleting...")
                                : t("common.delete", "Delete")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {importedMemories.length === 0 && !loadingImported && (
                      <div className="settings-empty">
                        {t(
                          "memory.imported.empty",
                          "No imported memories found.",
                        )}
                      </div>
                    )}
                    {loadingImported && (
                      <div
                        className="memory-list-item"
                        style={{
                          textAlign: "center",
                          color: "var(--color-text-secondary)",
                          fontSize: "13px",
                        }}
                      >
                        {t("common.loading", "Loading...")}
                      </div>
                    )}
                  </div>

                  {importedHasMore && !loadingImported && (
                    <button
                      className="memory-inline-btn"
                      onClick={() => loadImportedMemories(importedOffset)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: "8px",
                        textAlign: "center",
                      }}
                    >
                      {t("memory.action.loadMore", "Load more...")}
                    </button>
                  )}

                  <button
                    className="settings-button settings-button-danger"
                    onClick={handleDeleteImported}
                    disabled={deletingImported}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: "8px",
                      opacity: deletingImported ? 0.6 : 1,
                    }}
                  >
                    {deletingImported
                      ? t("common.deleting", "Deleting...")
                      : t(
                          "memory.imported.deleteAll",
                          "Delete All Imported Memories",
                        )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Import from ChatGPT */}
          <div className="settings-form-group memory-section">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    marginBottom: "4px",
                  }}
                >
                  {t(
                    "memory.chatgptImport.title",
                    "Import from ChatGPT (JSON export)",
                  )}
                </div>
                <p className="settings-form-hint" style={{ margin: 0 }}>
                  {importedStats && importedStats.count > 0
                    ? t(
                        "memory.chatgptImport.moreDescription",
                        "Import more conversations to append to existing imported memories. Duplicates are automatically skipped.",
                      )
                    : t(
                        "memory.chatgptImport.description",
                        "Import your ChatGPT conversation history to build richer context. Your data stays on your device.",
                      )}
                </p>
              </div>
              <button
                className="chatgpt-import-btn chatgpt-import-btn-primary"
                onClick={() => setShowImportWizard(true)}
                disabled={!settings.enabled}
                style={{
                  opacity: settings.enabled ? 1 : 0.5,
                  whiteSpace: "nowrap",
                }}
              >
                {importedStats && importedStats.count > 0
                  ? t("memory.action.importMore", "Import More")
                  : t("memory.action.import", "Import")}
              </button>
            </div>
          </div>

          {settings.enabled && (
            <>
              <div
                className="settings-form-group"
                style={{
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    marginBottom: "4px",
                  }}
                >
                  {t("memory.advanced.title", "Advanced memory settings")}
                </div>
                <p className="settings-form-hint" style={{ margin: 0 }}>
                  {t(
                    "memory.advanced.description",
                    "Tune memory quality, privacy, retention, and storage behavior.",
                  )}
                </p>
              </div>

              {/* Compression Toggle */}
              <ToggleRow
                title={t("memory.compression.title", "Enable compression")}
                description={t(
                  "memory.compression.description",
                  "Uses LLM to summarize memories, reducing token usage by ~10x.",
                )}
                checked={settings.compressionEnabled}
                onChange={(checked) =>
                  handleSave({ compressionEnabled: checked })
                }
                disabled={saving}
              />

              {/* Privacy Mode */}
              <div className="settings-form-group">
                <label className="settings-label">
                  {t("memory.privacy.title", "Privacy Mode")}
                </label>
                <select
                  value={settings.privacyMode}
                  onChange={(e) =>
                    handleSave({ privacyMode: e.target.value as PrivacyMode })
                  }
                  disabled={saving}
                  className="settings-select"
                >
                  <option value="normal">
                    {t(
                      "memory.privacy.normal",
                      "Normal - Auto-detect sensitive data",
                    )}
                  </option>
                  <option value="strict">
                    {t("memory.privacy.strict", "Strict - Mark all as private")}
                  </option>
                  <option value="disabled">
                    {t(
                      "memory.privacy.disabled",
                      "Disabled - No memory capture",
                    )}
                  </option>
                </select>
                <p className="settings-form-hint">
                  {t(
                    "memory.privacy.hint",
                    "Controls how sensitive data is handled in memories.",
                  )}
                </p>
              </div>

              {/* Retention Period */}
              <div className="settings-form-group">
                <label className="settings-label">
                  {t("memory.retention.title", "Retention Period")}
                </label>
                <select
                  value={settings.retentionDays}
                  onChange={(e) =>
                    handleSave({ retentionDays: parseInt(e.target.value) })
                  }
                  disabled={saving}
                  className="settings-select"
                >
                  <option value="7">
                    {t("memory.retention.days", "{count} days", { count: 7 })}
                  </option>
                  <option value="30">
                    {t("memory.retention.days", "{count} days", { count: 30 })}
                  </option>
                  <option value="90">
                    {t("memory.retention.days", "{count} days", { count: 90 })}
                  </option>
                  <option value="180">
                    {t("memory.retention.days", "{count} days", { count: 180 })}
                  </option>
                  <option value="365">
                    {t("memory.retention.year", "1 year")}
                  </option>
                </select>
                <p className="settings-form-hint">
                  {t(
                    "memory.retention.hint",
                    "Memories older than this will be automatically deleted.",
                  )}
                </p>
              </div>

              {/* Storage Cap */}
              <div className="settings-form-group">
                <label className="settings-label">
                  {t("memory.storage.title", "Storage Cap (MB)")}
                </label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  step={10}
                  value={settings.maxStorageMb}
                  onChange={(e) => {
                    const value = Math.max(
                      10,
                      Math.min(
                        5000,
                        parseInt(e.target.value || "0", 10) || 100,
                      ),
                    );
                    handleSave({ maxStorageMb: value });
                  }}
                  disabled={saving}
                  className="settings-input"
                />
                <p className="settings-form-hint">
                  {t(
                    "memory.storage.hint",
                    "Oldest memories are pruned automatically when this limit is exceeded.",
                  )}
                </p>
              </div>

              {/* Clear Button */}
              <div
                className="settings-form-group"
                style={{
                  marginTop: "24px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <button
                  className="settings-button settings-button-danger"
                  onClick={handleClear}
                  disabled={saving || clearing}
                  style={{ opacity: clearing ? 0.6 : 1 }}
                >
                  {clearing
                    ? t("common.clearing", "Clearing...")
                    : t("memory.action.clearAll", "Clear All Memories")}
                </button>
                <p className="settings-form-hint" style={{ marginTop: "8px" }}>
                  {t(
                    "memory.action.clearAllHint",
                    "Permanently deletes all memories for this workspace.",
                  )}
                </p>
              </div>
            </>
          )}
        </>
      )}
      {showPromptImportWizard && (
        <PromptMemoryImportWizard
          workspaceId={workspaceId}
          onClose={() => {
            setShowPromptImportWizard(false);
            loadData();
          }}
          onImportComplete={() => loadData()}
        />
      )}
    </div>
  );
}
