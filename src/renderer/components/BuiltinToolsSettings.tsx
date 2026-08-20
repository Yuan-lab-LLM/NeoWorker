import React, { useState, useEffect } from "react";
import {
  FileText,
  Globe,
  Search,
  Monitor,
  Wrench,
  Terminal,
  Image,
  ChevronDown,
  Code,
  ArrowDownToLine,
  MousePointer2,
  History,
} from "lucide-react";
import { translate, useLanguage } from "../i18n";

interface ToolCategoryConfig {
  enabled: boolean;
  priority: "high" | "normal" | "low";
  description?: string;
}

interface BuiltinToolsSettingsData {
  categories: {
    code: ToolCategoryConfig;
    webfetch: ToolCategoryConfig;
    browser: ToolCategoryConfig;
    search: ToolCategoryConfig;
    system: ToolCategoryConfig;
    file: ToolCategoryConfig;
    skill: ToolCategoryConfig;
    shell: ToolCategoryConfig;
    image: ToolCategoryConfig;
    chronicle: ToolCategoryConfig;
    computer_use: ToolCategoryConfig;
  };
  toolOverrides: Record<
    string,
    { enabled: boolean; priority?: "high" | "normal" | "low" }
  >;
  toolTimeouts: Record<string, number>;
  toolAutoApprove: Record<string, boolean>;
  runCommandApprovalMode: "per_command" | "single_bundle";
  codexRuntimeMode: "native" | "acpx";
  computerUseAutomation: {
    browserAutomationMode: "background" | "visible" | "ask";
    nativeComputerUseMode: "background_first" | "ask_visible" | "visible";
  };
  version: string;
}

type CategoryKey = keyof BuiltinToolsSettingsData["categories"];

const IC = { size: 18, strokeWidth: 1.5 } as const;
const CATEGORY_INFO: Record<
  CategoryKey,
  { name: string; icon: React.ReactNode; description: string }
> = {
  code: {
    name: "Code & Search in Repo",
    icon: <Code {...IC} />,
    description: "Glob, grep, edit, and code navigation tools",
  },
  webfetch: {
    name: "Integrations & Web Fetch",
    icon: <ArrowDownToLine {...IC} />,
    description:
      "Lightweight HTTP and connector actions (Drive, Gmail, calendar, etc.)",
  },
  file: {
    name: "File Operations",
    icon: <FileText {...IC} />,
    description: "Read, write, copy, delete files and directories",
  },
  browser: {
    name: "Browser Automation",
    icon: <Globe {...IC} />,
    description: "Navigate websites, click, fill forms, take screenshots",
  },
  search: {
    name: "Web Search",
    icon: <Search {...IC} />,
    description:
      "Search the web using configured providers (Brave, Tavily, etc.)",
  },
  system: {
    name: "System Tools",
    icon: <Monitor {...IC} />,
    description: "Clipboard, screenshots, open apps and URLs",
  },
  skill: {
    name: "Document Skills",
    icon: <Wrench {...IC} />,
    description: "Create spreadsheets, documents, presentations",
  },
  shell: {
    name: "Shell Commands",
    icon: <Terminal {...IC} />,
    description: "Execute terminal commands (requires approval)",
  },
  image: {
    name: "Image Generation",
    icon: <Image {...IC} />,
    description: "Generate images using AI (requires Gemini API)",
  },
  chronicle: {
    name: "Chronicle",
    icon: <History {...IC} />,
    description: "Passive local screen-context disambiguation and recall",
  },
  computer_use: {
    name: "Computer Use (macOS)",
    icon: <MousePointer2 {...IC} />,
    description:
      "Native desktop control: mouse, keyboard, screenshots (last resort vs browser/shell)",
  },
};

/** Stable order for settings UI (matches backend category keys). */
const CATEGORY_ORDER: CategoryKey[] = [
  "code",
  "webfetch",
  "browser",
  "search",
  "system",
  "file",
  "skill",
  "shell",
  "image",
  "chronicle",
  "computer_use",
];

const CATEGORY_GROUPS: Array<{
  key: string;
  labelKey: string;
  label: string;
  categories: CategoryKey[];
}> = [
  {
    key: "build",
    labelKey: "builtinTools.group.build",
    label: "Build & files",
    categories: ["code", "file", "shell", "skill"],
  },
  {
    key: "research",
    labelKey: "builtinTools.group.research",
    label: "Research & web",
    categories: ["webfetch", "browser", "search"],
  },
  {
    key: "desktop",
    labelKey: "builtinTools.group.desktop",
    label: "Desktop & media",
    categories: ["system", "image", "chronicle", "computer_use"],
  },
];

const PRIORITY_OPTIONS: Array<{
  value: "high" | "normal" | "low";
  label: string;
  description: string;
}> = [
  {
    value: "high",
    label: "High",
    description: "Prefer these tools over others",
  },
  { value: "normal", label: "Normal", description: "Default priority" },
  {
    value: "low",
    label: "Low",
    description: "Use only when specifically needed",
  },
];

export function BuiltinToolsSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<BuiltinToolsSettingsData | null>(
    null,
  );
  const [categories, setCategories] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [loadedSettings, loadedCategories] = await Promise.all([
        window.electronAPI.getBuiltinToolsSettings(),
        window.electronAPI.getBuiltinToolsCategories(),
      ]);
      const mergedCategories = {
        ...loadedSettings.categories,
      } as BuiltinToolsSettingsData["categories"];
      for (const key of CATEGORY_ORDER) {
        if (!mergedCategories[key]) {
          mergedCategories[key] = {
            enabled: true,
            priority: key === "code" || key === "webfetch" ? "high" : "normal",
            description: CATEGORY_INFO[key].description,
          };
        }
      }
      setSettings({
        ...loadedSettings,
        categories: mergedCategories,
        computerUseAutomation: {
          browserAutomationMode:
            loadedSettings.computerUseAutomation?.browserAutomationMode ||
            "background",
          nativeComputerUseMode:
            loadedSettings.computerUseAutomation?.nativeComputerUseMode ||
            "background_first",
        },
      });
      setCategories(loadedCategories);
    } catch (error) {
      console.error("Failed to load built-in tools settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = async (
    category: CategoryKey,
    enabled: boolean,
  ) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...settings.categories[category],
          enabled,
        },
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryPriority = async (
    category: CategoryKey,
    priority: "high" | "normal" | "low",
  ) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      categories: {
        ...settings.categories,
        [category]: {
          ...settings.categories[category],
          priority,
        },
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRunCommandAutoApprove = async (enabled: boolean) => {
    if (!settings) return;

    const nextAutoApprove = { ...settings.toolAutoApprove };
    if (enabled) {
      nextAutoApprove.run_command = true;
    } else {
      delete nextAutoApprove.run_command;
    }

    const newSettings = {
      ...settings,
      toolAutoApprove: nextAutoApprove,
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRunCommandApprovalMode = async (
    mode: "per_command" | "single_bundle",
  ) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      runCommandApprovalMode: mode,
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleRunCommandTimeout = async (value: string) => {
    if (!settings) return;

    const parsed = Number(value);
    const nextTimeouts = { ...settings.toolTimeouts };

    if (!value || !Number.isFinite(parsed) || parsed <= 0) {
      delete nextTimeouts.run_command;
    } else {
      nextTimeouts.run_command = Math.round(parsed);
    }

    const newSettings = {
      ...settings,
      toolTimeouts: nextTimeouts,
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCodexRuntimeMode = async (mode: "native" | "acpx") => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      codexRuntimeMode: mode,
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleBrowserAutomationMode = async (
    mode: "background" | "visible" | "ask",
  ) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      computerUseAutomation: {
        ...settings.computerUseAutomation,
        browserAutomationMode: mode,
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleNativeComputerUseMode = async (
    mode: "background_first" | "ask_visible" | "visible",
  ) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      computerUseAutomation: {
        ...settings.computerUseAutomation,
        nativeComputerUseMode: mode,
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToolToggle = async (tool: string, enabled: boolean) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      toolOverrides: {
        ...settings.toolOverrides,
        [tool]: {
          ...settings.toolOverrides?.[tool],
          enabled,
        },
      },
    };

    setSettings(newSettings);

    try {
      setSaving(true);
      await window.electronAPI.saveBuiltinToolsSettings(newSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("builtinTools.loading", "Loading settings...")}
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-error">
        {t("builtinTools.error.load", "Failed to load settings")}
      </div>
    );
  }

  const enabledCount = CATEGORY_ORDER.filter(
    (category) => settings.categories[category]?.enabled,
  ).length;
  const preferredCount = CATEGORY_ORDER.filter(
    (category) =>
      settings.categories[category]?.enabled &&
      settings.categories[category]?.priority === "high",
  ).length;
  const disabledCount = CATEGORY_ORDER.length - enabledCount;
  return (
    <div className="builtin-tools-settings">
      <section className="builtin-tools-intro">
        <div className="builtin-tools-intro-copy">
          <h3>{t("builtinTools.title", "Built-in Tools")}</h3>
          <p className="settings-description">
            {t(
              "builtinTools.description",
              "Control which built-in tools are available to the agent. Disabling a category will prevent the agent from using those tools. Setting a lower priority makes the agent less likely to choose those tools when alternatives exist.",
            )}
          </p>
        </div>
        <dl
          className="builtin-tools-summary"
          aria-label={t("builtinTools.summary.aria", "Tool summary")}
        >
          <div>
            <dt>{t("builtinTools.summary.categories", "Categories")}</dt>
            <dd>{CATEGORY_ORDER.length}</dd>
          </div>
          <div>
            <dt>{t("builtinTools.summary.enabled", "Enabled")}</dt>
            <dd>{enabledCount}</dd>
          </div>
          <div>
            <dt>{t("builtinTools.summary.preferred", "High priority")}</dt>
            <dd>{preferredCount}</dd>
          </div>
          <div>
            <dt>{t("builtinTools.summary.disabled", "Disabled")}</dt>
            <dd>{disabledCount}</dd>
          </div>
        </dl>
      </section>

      <div className="builtin-tools-workbench">
        <div className="builtin-tools-categories">
          {CATEGORY_GROUPS.map((group) => (
            <section key={group.key} className="builtin-tool-group">
              <div className="builtin-tool-group-heading">
                <h4>{t(group.labelKey, group.label)}</h4>
                <span>
                  {t("builtinTools.group.count", "{count} categories", {
                    count: group.categories.length,
                  })}
                </span>
              </div>
              <div className="builtin-tool-group-list">
                {group.categories.map((category) => {
                  const info = CATEGORY_INFO[category];
                  const config = settings.categories[category];
                  const tools = categories[category] || [];
                  const runCommandAutoApprove =
                    category === "shell"
                      ? Boolean(settings.toolAutoApprove?.run_command)
                      : false;
                  const runCommandApprovalMode =
                    category === "shell"
                      ? settings.runCommandApprovalMode
                      : "per_command";
                  const runCommandTimeout =
                    category === "shell"
                      ? (settings.toolTimeouts?.run_command ?? "")
                      : "";
                  const browserAutomationMode =
                    settings.computerUseAutomation?.browserAutomationMode ||
                    "background";
                  const nativeComputerUseMode =
                    settings.computerUseAutomation?.nativeComputerUseMode ||
                    "background_first";

                  return (
                    <div
                      key={category}
                      className={`builtin-tool-category ${!config.enabled ? "disabled" : ""}`}
                      data-priority={config.priority}
                      data-expanded={expandedCategory === category}
                    >
                      <div className="builtin-tool-category-header">
                        <div className="builtin-tool-category-info">
                          <div className="builtin-tool-category-icon">
                            {info.icon}
                          </div>
                          <div className="builtin-tool-category-text">
                            <div className="builtin-tool-category-name">
                              {t(
                                `builtinTools.category.${category}.name`,
                                info.name,
                              )}
                            </div>
                            <div className="builtin-tool-category-desc">
                              {t(
                                `builtinTools.category.${category}.description`,
                                info.description,
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="builtin-tool-category-controls">
                          <div
                            className="builtin-tool-priority-control"
                            role="group"
                            aria-label={t(
                              "builtinTools.priority.title",
                              "Tool priority",
                            )}
                          >
                            {PRIORITY_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                className={
                                  config.priority === opt.value ? "active" : ""
                                }
                                onClick={() =>
                                  handleCategoryPriority(category, opt.value)
                                }
                                disabled={!config.enabled}
                                title={t(
                                  `builtinTools.aboutPriority.${opt.value}`,
                                  opt.description,
                                )}
                                aria-pressed={config.priority === opt.value}
                              >
                                {t(
                                  `builtinTools.priority.${opt.value}`,
                                  opt.label,
                                )}
                              </button>
                            ))}
                          </div>

                          <label className="builtin-tool-toggle">
                            <input
                              type="checkbox"
                              checked={config.enabled}
                              onChange={(e) =>
                                handleCategoryToggle(category, e.target.checked)
                              }
                            />
                            <span className="builtin-tool-toggle-slider"></span>
                          </label>

                          <button
                            className="builtin-tool-expand-btn"
                            onClick={() =>
                              setExpandedCategory(
                                expandedCategory === category ? null : category,
                              )
                            }
                            title={t(
                              "builtinTools.showTools",
                              "Show tools in this category",
                            )}
                            aria-label={t(
                              "builtinTools.showTools",
                              "Show tools in this category",
                            )}
                            aria-expanded={expandedCategory === category}
                          >
                            <ChevronDown
                              size={16}
                              strokeWidth={2}
                              style={{
                                transform:
                                  expandedCategory === category
                                    ? "rotate(180deg)"
                                    : "none",
                                transition: "transform 0.2s",
                              }}
                            />
                          </button>
                        </div>
                      </div>

                      {category === "shell" &&
                        expandedCategory === category && (
                          <div className="builtin-tool-advanced">
                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.shell.approvalMode",
                                    "Approval mode",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.shell.approvalModeHint",
                                    "Single bundle is the lower-noise option. It asks once and reuses approval for safe commands in this task.",
                                  )}
                                </div>
                              </div>
                              <select
                                className="builtin-tool-mode-select"
                                value={runCommandApprovalMode}
                                onChange={(e) =>
                                  handleRunCommandApprovalMode(
                                    e.target.value as
                                      "per_command" | "single_bundle",
                                  )
                                }
                                disabled={!config.enabled}
                              >
                                <option value="per_command">
                                  {t(
                                    "builtinTools.shell.perCommand",
                                    "Per command",
                                  )}
                                </option>
                                <option value="single_bundle">
                                  {t(
                                    "builtinTools.shell.singleBundle",
                                    "Single approval bundle (Recommended)",
                                  )}
                                </option>
                              </select>
                            </div>

                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.shell.codexRuntime",
                                    "Codex runtime",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.shell.codexRuntimeHint",
                                    "Native uses NeoWorker's current shell path. ACP routes explicit Codex child tasks through acpx with structured session output.",
                                  )}
                                </div>
                              </div>
                              <select
                                className="builtin-tool-mode-select"
                                value={settings.codexRuntimeMode}
                                onChange={(e) =>
                                  handleCodexRuntimeMode(
                                    e.target.value as "native" | "acpx",
                                  )
                                }
                                disabled={!config.enabled}
                              >
                                <option value="native">
                                  {t("builtinTools.shell.native", "Native")}
                                </option>
                                <option value="acpx">ACP via acpx</option>
                              </select>
                            </div>

                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.shell.autoApprove",
                                    "Auto-approve safe commands",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.shell.autoApproveHint",
                                    "Skips approval prompts for non-destructive commands.",
                                  )}
                                </div>
                              </div>
                              <label className="builtin-tool-toggle">
                                <input
                                  type="checkbox"
                                  checked={runCommandAutoApprove}
                                  onChange={(e) =>
                                    handleRunCommandAutoApprove(
                                      e.target.checked,
                                    )
                                  }
                                  disabled={!config.enabled}
                                />
                                <span className="builtin-tool-toggle-slider"></span>
                              </label>
                            </div>

                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.shell.timeout",
                                    "run_command timeout (ms)",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.shell.timeoutHint",
                                    "Used when the command doesn't set its own timeout.",
                                  )}
                                </div>
                              </div>
                              <input
                                className="builtin-tool-timeout-input"
                                type="number"
                                min={1000}
                                step={1000}
                                value={runCommandTimeout}
                                onChange={(e) =>
                                  handleRunCommandTimeout(e.target.value)
                                }
                                disabled={!config.enabled}
                                placeholder="30000"
                              />
                            </div>
                          </div>
                        )}

                      {category === "computer_use" &&
                        expandedCategory === category && (
                          <div className="builtin-tool-advanced">
                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.computerUse.browserAutomation",
                                    "Browser automation",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.computerUse.browserAutomationHint",
                                    "Background uses headless browser control unless a task already has a visible browser session.",
                                  )}
                                </div>
                              </div>
                              <select
                                className="builtin-tool-mode-select"
                                value={browserAutomationMode}
                                onChange={(e) =>
                                  handleBrowserAutomationMode(
                                    e.target.value as
                                      "background" | "visible" | "ask",
                                  )
                                }
                                disabled={!config.enabled}
                              >
                                <option value="background">
                                  {t(
                                    "builtinTools.computerUse.background",
                                    "Background (Recommended)",
                                  )}
                                </option>
                                <option value="visible">
                                  {t(
                                    "builtinTools.computerUse.visibleWorkbench",
                                    "Visible workbench",
                                  )}
                                </option>
                                <option value="ask">
                                  {t("builtinTools.computerUse.ask", "Ask")}
                                </option>
                              </select>
                            </div>

                            <div className="builtin-tool-advanced-row">
                              <div className="builtin-tool-advanced-text">
                                <div className="builtin-tool-advanced-label">
                                  {t(
                                    "builtinTools.computerUse.nativeDesktopControl",
                                    "Native desktop control",
                                  )}
                                </div>
                                <div className="builtin-tool-advanced-hint">
                                  {t(
                                    "builtinTools.computerUse.nativeDesktopHint",
                                    "Background first tries Accessibility actions before visible Mac control.",
                                  )}
                                </div>
                              </div>
                              <select
                                className="builtin-tool-mode-select"
                                value={nativeComputerUseMode}
                                onChange={(e) =>
                                  handleNativeComputerUseMode(
                                    e.target.value as
                                      | "background_first"
                                      | "ask_visible"
                                      | "visible",
                                  )
                                }
                                disabled={!config.enabled}
                              >
                                <option value="background_first">
                                  {t(
                                    "builtinTools.computerUse.backgroundFirst",
                                    "Background first (Recommended)",
                                  )}
                                </option>
                                <option value="ask_visible">
                                  {t(
                                    "builtinTools.computerUse.askVisible",
                                    "Ask before visible control",
                                  )}
                                </option>
                                <option value="visible">
                                  {t(
                                    "builtinTools.computerUse.visibleControl",
                                    "Visible control",
                                  )}
                                </option>
                              </select>
                            </div>
                          </div>
                        )}

                      {expandedCategory === category && tools.length > 0 && (
                        <div className="builtin-tool-list">
                          {tools.map((tool) => {
                            const toolOverride = settings.toolOverrides?.[tool];
                            const toolEnabled = toolOverride
                              ? toolOverride.enabled
                              : config.enabled;

                            return (
                              <div key={tool} className="builtin-tool-item">
                                <code>{tool}</code>
                                <label className="builtin-tool-toggle">
                                  <input
                                    type="checkbox"
                                    checked={toolEnabled}
                                    onChange={(e) =>
                                      handleToolToggle(tool, e.target.checked)
                                    }
                                    disabled={!config.enabled || saving}
                                  />
                                  <span className="builtin-tool-toggle-slider"></span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="builtin-tools-guide">
          <div className="builtin-tools-guide-icon">
            <Wrench size={18} strokeWidth={1.5} />
          </div>
          <h4>{t("builtinTools.guide.title", "How tools are selected")}</h4>
          <p>
            {t(
              "builtinTools.guide.description",
              "When multiple tools can complete the same task, priority determines which one the agent considers first.",
            )}
          </p>
          <dl className="builtin-tools-priority-guide">
            {PRIORITY_OPTIONS.map((opt) => (
              <div key={opt.value}>
                <dt className={`priority-${opt.value}`}>
                  {t(`builtinTools.priority.${opt.value}`, opt.label)}
                </dt>
                <dd>
                  {t(
                    `builtinTools.aboutPriority.${opt.value}`,
                    opt.description,
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="builtin-tools-guide-note">
            {t(
              "builtinTools.aboutPriority.example",
              "If an MCP server offers similar capabilities, lower the built-in tool priority so the agent considers the MCP version first.",
            )}
          </div>
        </aside>
      </div>

      {saving && (
        <div className="builtin-tools-saving">
          {t("builtinTools.saving", "Saving...")}
        </div>
      )}
    </div>
  );
}
