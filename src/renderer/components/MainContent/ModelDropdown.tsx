import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
  LLMReasoningEffort,
} from "../../../shared/types";
import {
  getLlmModelReasoningEfforts,
  LLM_REASONING_EFFORT_OPTIONS,
} from "../../../shared/llm-model-selection";
import { Sparkles } from "lucide-react";
import type { SettingsTab } from "./main-content-types";
import { translate, useLanguage } from "../../i18n";

// Searchable Model Dropdown Component
export interface ModelDropdownProps {
  models: LLMModelInfo[];
  selectedModel: string;
  selectedProvider: LLMProviderType;
  selectedReasoningEffort?: LLMReasoningEffort;
  providers?: LLMProviderInfo[];
  variant?: "button" | "label";
  align?: "left" | "right";
  showProviderSwitching?: boolean;
  onModelChange: (selection: {
    providerType?: LLMProviderType;
    modelKey: string;
    reasoningEffort?: LLMReasoningEffort;
  }) => void;
  onOpenSettings?: (tab?: SettingsTab) => void;
}

export function ModelDropdown({
  models,
  selectedModel,
  selectedProvider,
  selectedReasoningEffort,
  providers = [],
  variant = "button",
  align = "left",
  showProviderSwitching = true,
  onModelChange,
  onOpenSettings,
}: ModelDropdownProps) {
  useLanguage();
  const t = translate;
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeProviderMenu, setActiveProviderMenu] =
    useState<LLMProviderType | null>(null);
  const [providerModelCache, setProviderModelCache] = useState<
    Record<string, LLMModelInfo[]>
  >({});
  const [loadingProviderModels, setLoadingProviderModels] = useState<
    string | null
  >(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [submenuSide, setSubmenuSide] = useState<"left" | "right">("right");
  const [submenuShift, setSubmenuShift] = useState(0);
  const submenuShiftRef = useRef(0);

  useEffect(() => {
    setProviderModelCache((prev) => ({
      ...prev,
      [selectedProvider]: models,
    }));
  }, [models, selectedProvider]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch("");
        setActiveProviderMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const configuredProviders = useMemo(() => {
    const seen = new Set<string>();
    const list = providers.filter((provider) => provider.configured);
    return list.filter((provider) => {
      if (seen.has(provider.type)) return false;
      seen.add(provider.type);
      return true;
    });
  }, [providers, selectedProvider]);

  const currentProviderModels = providerModelCache[selectedProvider] || models;
  const hasConfiguredModelSelection =
    configuredProviders.length > 0 &&
    Boolean(selectedModel.trim()) &&
    currentProviderModels.some((model) => model.key === selectedModel);
  const selectedModelInfo =
    currentProviderModels.find((model) => model.key === selectedModel) ||
    models.find((model) => model.key === selectedModel);
  const selectedModelLabel =
    selectedModelInfo?.displayName ||
    selectedModel ||
    t("modelDropdown.selectModel", "Select Model");
  const currentProviderLabel =
    configuredProviders.find((provider) => provider.type === selectedProvider)
      ?.name || selectedProvider;

  const selectedReasoningEfforts =
    selectedModelInfo?.reasoningEfforts ||
    getLlmModelReasoningEfforts(selectedProvider, selectedModel);
  const effectiveReasoningEffort =
    selectedReasoningEffort &&
    selectedReasoningEfforts.includes(selectedReasoningEffort)
      ? selectedReasoningEffort
      : undefined;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredModels = currentProviderModels.filter((model) => {
    if (!normalizedSearch) return true;
    return (
      model.displayName.toLowerCase().includes(normalizedSearch) ||
      model.key.toLowerCase().includes(normalizedSearch) ||
      model.description.toLowerCase().includes(normalizedSearch)
    );
  });

  const otherProviders = showProviderSwitching
    ? configuredProviders.filter(
        (provider) => provider.type !== selectedProvider,
      )
    : [];

  const loadProviderModels = useCallback(
    async (providerType: LLMProviderType) => {
      if (providerModelCache[providerType]) return;
      try {
        setLoadingProviderModels(providerType);
        const providerModels =
          await window.electronAPI.getProviderModels(providerType);
        setProviderModelCache((prev) => ({
          ...prev,
          [providerType]: providerModels || [],
        }));
      } catch (error) {
        console.error("Failed to load provider models:", error);
        setProviderModelCache((prev) => ({
          ...prev,
          [providerType]: [],
        }));
      } finally {
        setLoadingProviderModels((current) =>
          current === providerType ? null : current,
        );
      }
    },
    [providerModelCache],
  );

  const selectModel = (
    providerType: LLMProviderType,
    modelKey: string,
    modelInfo?: LLMModelInfo,
  ) => {
    const reasoningEfforts =
      modelInfo?.reasoningEfforts ||
      getLlmModelReasoningEfforts(providerType, modelKey);
    const reasoningEffort =
      selectedReasoningEffort &&
      reasoningEfforts.includes(selectedReasoningEffort)
        ? selectedReasoningEffort
        : reasoningEfforts.includes("medium")
          ? "medium"
          : reasoningEfforts[0];

    onModelChange({
      providerType,
      modelKey,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });
    setIsOpen(false);
    setSearch("");
    setActiveProviderMenu(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        if (filteredModels[0]) {
          selectModel(
            selectedProvider,
            filteredModels[0].key,
            filteredModels[0],
          );
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearch("");
        setActiveProviderMenu(null);
        break;
    }
  };

  const handleOpenProviders = () => {
    setIsOpen(false);
    setSearch("");
    setActiveProviderMenu(null);
    onOpenSettings?.("llm");
  };
  const activeProvider = otherProviders.find(
    (provider) => provider.type === activeProviderMenu,
  );
  const activeProviderModels = activeProvider
    ? providerModelCache[activeProvider.type] || []
    : [];

  useEffect(() => {
    if (!activeProviderMenu) {
      setSubmenuSide("right");
      setSubmenuShift(0);
      submenuShiftRef.current = 0;
      return;
    }

    const positionSubmenu = () => {
      const dropdown = dropdownRef.current;
      if (!dropdown) return;

      const gap = 8;
      const submenuWidth = Math.min(320, window.innerWidth - 28);
      const bounds = dropdown.getBoundingClientRect();
      const currentShift = submenuShiftRef.current;
      const baseLeft = bounds.left + currentShift;
      const baseRight = bounds.right + currentShift;
      const rightOverflow = Math.max(
        0,
        baseRight + gap + submenuWidth - window.innerWidth,
      );

      // Keep cascading menus reading left-to-right whenever the viewport can
      // fit both panels. Moving the primary panel is less surprising than
      // covering the model selector with a submenu on its left.
      if (rightOverflow <= baseLeft) {
        setSubmenuSide("right");
        setSubmenuShift(rightOverflow);
        submenuShiftRef.current = rightOverflow;
        return;
      }

      if (baseLeft >= gap + submenuWidth) {
        setSubmenuSide("left");
        setSubmenuShift(0);
        submenuShiftRef.current = 0;
        return;
      }

      // On an exceptionally narrow window, keep the submenu in the direction
      // with the most available space and avoid shifting the main panel offscreen.
      const leftSpace = baseLeft;
      const rightSpace = window.innerWidth - baseRight;
      const side = rightSpace >= leftSpace ? "right" : "left";
      setSubmenuSide(side);
      setSubmenuShift(0);
      submenuShiftRef.current = 0;
    };

    positionSubmenu();
    window.addEventListener("resize", positionSubmenu);
    return () => window.removeEventListener("resize", positionSubmenu);
  }, [activeProviderMenu]);

  if (!hasConfiguredModelSelection) {
    const addModelLabel = t("modelDropdown.addModel", "Add model");
    const notConfiguredLabel = t(
      "modelDropdown.notConfigured",
      "No models configured. Add a model in settings.",
    );
    return (
      <div
        className={`model-dropdown-container ${align === "right" ? "align-right" : ""} ${variant === "label" ? "model-dropdown-container-label" : ""}`}
        ref={containerRef}
      >
        <button
          type="button"
          className={`${variant === "label" ? "model-label-subtle" : "model-selector"} model-selector-unconfigured`}
          title={notConfiguredLabel}
          aria-label={notConfiguredLabel}
          onClick={handleOpenProviders}
        >
          <Sparkles className="model-label-icon" size={14} aria-hidden="true" />
          <span className="model-label-text">{addModelLabel}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`model-dropdown-container ${align === "right" ? "align-right" : ""} ${variant === "label" ? "model-dropdown-container-label" : ""}`}
      ref={containerRef}
    >
      <button
        className={`${variant === "label" ? "model-label-subtle" : "model-selector"} ${isOpen ? "open" : ""}`}
        title={t("modelDropdown.title", "Model: {model}", {
          model: selectedModelLabel,
        })}
        aria-label={t("modelDropdown.aria", "Change model, currently {model}", {
          model: selectedModelLabel,
        })}
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 0);
          } else {
            setActiveProviderMenu(null);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        {variant === "label" ? (
          <Sparkles className="model-label-icon" size={14} aria-hidden="true" />
        ) : (
          <svg
            className="model-selector-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          </svg>
        )}
        <span className="model-label-text">{selectedModelLabel}</span>
        {effectiveReasoningEffort && (
          <span className="model-selector-effort">
            {
              LLM_REASONING_EFFORT_OPTIONS.find(
                (option) => option.value === effectiveReasoningEffort,
              )?.label
            }
          </span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`model-dropdown-chevron ${isOpen ? "chevron-up" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && (
        <div
          ref={dropdownRef}
          className={`model-dropdown ${align === "right" ? "align-right" : ""} ${
            activeProvider ? `submenu-opens-${submenuSide}` : ""
          }`}
          style={
            activeProvider && submenuSide === "right" && submenuShift > 0
              ? { marginLeft: -submenuShift }
              : undefined
          }
        >
          <div className="model-dropdown-panel">
            {selectedReasoningEfforts.length > 0 && (
              <div
                className="model-dropdown-section"
                onMouseEnter={() => setActiveProviderMenu(null)}
              >
                <div className="model-dropdown-section-label">
                  {t("modelDropdown.intelligence", "Intelligence")}
                </div>
                {LLM_REASONING_EFFORT_OPTIONS.filter((option) =>
                  selectedReasoningEfforts.includes(option.value),
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`model-dropdown-item compact ${option.value === effectiveReasoningEffort ? "selected" : ""}`}
                    onClick={() =>
                      onModelChange({
                        providerType: selectedProvider,
                        modelKey: selectedModel,
                        reasoningEffort: option.value,
                      })
                    }
                  >
                    <span className="model-dropdown-item-name">
                      {option.label}
                    </span>
                    {option.value === effectiveReasoningEffort && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
            <div
              className="model-dropdown-search"
              onMouseEnter={() => setActiveProviderMenu(null)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t(
                  "modelDropdown.searchPlaceholder",
                  "Search {provider} models...",
                  { provider: currentProviderLabel },
                )}
                autoFocus
              />
            </div>
            <div className="model-dropdown-section-label model-dropdown-provider-label">
              {currentProviderLabel}
            </div>
            <div
              className="model-dropdown-list"
              onMouseEnter={() => setActiveProviderMenu(null)}
            >
              {filteredModels.length === 0 ? (
                <div className="model-dropdown-no-results">
                  {t("modelDropdown.noModels", "No models found")}
                </div>
              ) : (
                filteredModels.map((model) => (
                  <button
                    key={model.key}
                    className={`model-dropdown-item ${model.key === selectedModel ? "selected" : ""}`}
                    onClick={() =>
                      selectModel(selectedProvider, model.key, model)
                    }
                  >
                    <div className="model-dropdown-item-content">
                      <span className="model-dropdown-item-name">
                        {model.displayName}
                      </span>
                      <span className="model-dropdown-item-desc">
                        {model.description}
                      </span>
                    </div>
                    {model.key === selectedModel && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
            {otherProviders.length > 0 && (
              <div className="model-dropdown-section model-dropdown-other-providers">
                <div className="model-dropdown-section-label">
                  {t("modelDropdown.otherProviders", "Other providers")}
                </div>
                <div className="model-dropdown-provider-list">
                  {otherProviders.map((provider) => {
                    const isActive = activeProviderMenu === provider.type;
                    return (
                      <div
                        key={provider.type}
                        className="model-dropdown-provider-row"
                        onMouseEnter={() => {
                          setActiveProviderMenu(provider.type);
                          void loadProviderModels(provider.type);
                        }}
                      >
                        <button
                          type="button"
                          className={`model-dropdown-item compact ${isActive ? "highlighted" : ""}`}
                          onClick={() => {
                            setActiveProviderMenu(
                              isActive ? null : provider.type,
                            );
                            void loadProviderModels(provider.type);
                          }}
                        >
                          <span className="model-dropdown-item-name">
                            {provider.name}
                          </span>
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div
              className="model-dropdown-footer"
              onMouseEnter={() => setActiveProviderMenu(null)}
            >
              <button
                type="button"
                className="model-dropdown-provider-btn"
                onClick={handleOpenProviders}
              >
                {t("modelDropdown.modelSettings", "Model settings")}
              </button>
            </div>
          </div>
          {activeProvider && (
            <div className="model-dropdown-submenu">
              {loadingProviderModels === activeProvider.type ? (
                <div className="model-dropdown-no-results">
                  {t("modelDropdown.loadingModels", "Loading models...")}
                </div>
              ) : activeProviderModels.length === 0 ? (
                <div className="model-dropdown-no-results">
                  {t("modelDropdown.noModels", "No models found")}
                </div>
              ) : (
                activeProviderModels.map((model) => (
                  <button
                    key={model.key}
                    type="button"
                    className="model-dropdown-item"
                    onClick={() =>
                      selectModel(activeProvider.type, model.key, model)
                    }
                  >
                    <div className="model-dropdown-item-content">
                      <span className="model-dropdown-item-name">
                        {model.displayName}
                      </span>
                      <span className="model-dropdown-item-desc">
                        {model.description}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
