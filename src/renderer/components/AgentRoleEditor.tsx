import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { AgentRoleData, AgentCapability } from "../../electron/preload";
import { TWIN_ICON_KEYS, resolveTwinIcon } from "../utils/twin-icons";
import { translate, useLanguage } from "../i18n";

// Alias for UI usage
type AgentRole = AgentRoleData;

interface AgentRoleEditorProps {
  role: AgentRole;
  isCreating: boolean;
  onSave: (role: AgentRole) => void;
  onCancel: () => void;
  error: string | null;
}

const ALL_CAPABILITIES: {
  value: AgentCapability;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    value: "code",
    label: "Code",
    icon: "💻",
    description: "Write, modify, and understand code",
  },
  {
    value: "review",
    label: "Review",
    icon: "🔍",
    description: "Review code for quality and issues",
  },
  {
    value: "research",
    label: "Research",
    icon: "📚",
    description: "Research topics and gather information",
  },
  {
    value: "test",
    label: "Test",
    icon: "🧪",
    description: "Write and run tests",
  },
  {
    value: "document",
    label: "Document",
    icon: "📝",
    description: "Write documentation and comments",
  },
  {
    value: "plan",
    label: "Plan",
    icon: "📋",
    description: "Plan and break down tasks",
  },
  {
    value: "design",
    label: "Design",
    icon: "🎨",
    description: "Design systems and architectures",
  },
  {
    value: "analyze",
    label: "Analyze",
    icon: "📊",
    description: "Analyze data and performance",
  },
];

const PRESET_COLORS = [
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#22c55e", // Green
  "#f59e0b", // Amber
  "#ef4444", // Red
  "#ec4899", // Pink
  "#06b6d4", // Cyan
  "#6366f1", // Indigo
];

const AUTONOMY_LEVELS = [
  {
    value: "intern",
    label: "Intern",
    description: "Requires approval for most actions",
  },
  {
    value: "specialist",
    label: "Specialist",
    description: "Works independently on assigned tasks",
  },
  {
    value: "lead",
    label: "Lead",
    description: "Can delegate tasks to other agents",
  },
] as const;

function capabilityLabel(
  capability: (typeof ALL_CAPABILITIES)[number],
): string {
  return translate(
    `agentRoleEditor.capability.${capability.value}.label`,
    capability.label,
  );
}

function capabilityDescription(
  capability: (typeof ALL_CAPABILITIES)[number],
): string {
  return translate(
    `agentRoleEditor.capability.${capability.value}.description`,
    capability.description,
  );
}

function autonomyLabel(level: (typeof AUTONOMY_LEVELS)[number]): string {
  return translate(
    `agentRoleEditor.autonomy.${level.value}.label`,
    level.label,
  );
}

function autonomyDescription(level: (typeof AUTONOMY_LEVELS)[number]): string {
  return translate(
    `agentRoleEditor.autonomy.${level.value}.description`,
    level.description,
  );
}

export function AgentRoleEditor({
  role,
  isCreating,
  onSave,
  onCancel,
  error,
}: AgentRoleEditorProps) {
  useLanguage();
  const t = translate;
  const [editedRole, setEditedRole] = useState<AgentRole>(role);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "basic" | "capabilities" | "mission" | "advanced"
  >("basic");

  const handleChange = <K extends keyof AgentRole>(
    key: K,
    value: AgentRole[K],
  ) => {
    setEditedRole((prev) => ({ ...prev, [key]: value }));
  };

  const handleCapabilityToggle = (cap: AgentCapability) => {
    const newCapabilities = editedRole.capabilities.includes(cap)
      ? editedRole.capabilities.filter((c) => c !== cap)
      : [...editedRole.capabilities, cap];
    handleChange("capabilities", newCapabilities);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedRole);
  };

  const isValid =
    editedRole.name.trim() &&
    editedRole.displayName.trim() &&
    editedRole.capabilities.length > 0;

  return (
    <div className="agent-role-editor">
      <form onSubmit={handleSubmit}>
        <div className="editor-header">
          <button type="button" className="btn-back" onClick={onCancel}>
            <ArrowLeft size={18} strokeWidth={1.8} />
            {t("common.back", "Back")}
          </button>
          <div className="editor-title-block">
            <h3>
              {isCreating
                ? t("agentRoleEditor.title.create", "Create Agent Role")
                : t("agentRoleEditor.title.edit", "Edit Agent Role")}
            </h3>
            <p>
              {t(
                "agentRoleEditor.subtitle",
                "Define how this role appears and works in your agent team.",
              )}
            </p>
          </div>
          <button type="submit" className="btn-primary" disabled={!isValid}>
            {isCreating
              ? t("common.create", "Create")
              : t("common.saveChanges", "Save Changes")}
          </button>
        </div>

        {error && <div className="settings-error">{error}</div>}

        <div className="editor-tabs">
          <button
            type="button"
            className={`editor-tab ${activeTab === "basic" ? "active" : ""}`}
            onClick={() => setActiveTab("basic")}
          >
            {t("agentRoleEditor.tab.basic", "Basic Info")}
          </button>
          <button
            type="button"
            className={`editor-tab ${activeTab === "capabilities" ? "active" : ""}`}
            onClick={() => setActiveTab("capabilities")}
          >
            {t("agentRoleEditor.tab.capabilities", "Capabilities")}
          </button>
          <button
            type="button"
            className={`editor-tab ${activeTab === "mission" ? "active" : ""}`}
            onClick={() => setActiveTab("mission")}
          >
            {t("agentRoleEditor.tab.automation", "Automation")}
          </button>
          <button
            type="button"
            className={`editor-tab ${activeTab === "advanced" ? "active" : ""}`}
            onClick={() => setActiveTab("advanced")}
          >
            {t("agentRoleEditor.tab.advanced", "Advanced")}
          </button>
        </div>

        <div className="editor-content">
          {activeTab === "basic" && (
            <div className="editor-section">
              <div className="editor-section-heading">
                <div>
                  <h4>{t("agentRoleEditor.basic.heading", "Role identity")}</h4>
                  <p>
                    {t(
                      "agentRoleEditor.basic.description",
                      "Set the name and visual identity your team will recognize.",
                    )}
                  </p>
                </div>
              </div>
              <div className="form-row icon-color-row">
                <div className="icon-picker-container">
                  <label>{t("agentRoleEditor.field.icon", "Icon")}</label>
                  <button
                    type="button"
                    className="icon-button"
                    style={{ backgroundColor: editedRole.color }}
                    onClick={() => setShowIconPicker(!showIconPicker)}
                  >
                    {(() => {
                      const Icon = resolveTwinIcon(editedRole.icon);
                      return <Icon size={20} strokeWidth={2} />;
                    })()}
                  </button>
                  {showIconPicker && (
                    <div className="picker-dropdown">
                      <div className="picker-grid">
                        {TWIN_ICON_KEYS.map((iconKey) => {
                          const Icon = resolveTwinIcon(iconKey);
                          return (
                            <button
                              key={iconKey}
                              type="button"
                              className={`picker-item ${editedRole.icon === iconKey ? "selected" : ""}`}
                              onClick={() => {
                                handleChange("icon", iconKey);
                                setShowIconPicker(false);
                              }}
                            >
                              <Icon size={18} strokeWidth={2} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="color-picker-container">
                  <label>{t("agentRoleEditor.field.color", "Color")}</label>
                  <button
                    type="button"
                    className="color-button"
                    style={{ backgroundColor: editedRole.color }}
                    onClick={() => setShowColorPicker(!showColorPicker)}
                  />
                  {showColorPicker && (
                    <div className="picker-dropdown">
                      <div className="picker-grid">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            type="button"
                            className={`picker-item color ${editedRole.color === color ? "selected" : ""}`}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              handleChange("color", color);
                              setShowColorPicker(false);
                            }}
                          />
                        ))}
                      </div>
                      <input
                        type="color"
                        value={editedRole.color}
                        onChange={(e) => handleChange("color", e.target.value)}
                        className="custom-color-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.internalName", "Internal Name")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={editedRole.name}
                  onChange={(e) =>
                    handleChange(
                      "name",
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                    )
                  }
                  placeholder="e.g., code-reviewer"
                  disabled={!isCreating}
                  className={!isCreating ? "disabled" : ""}
                />
                <span className="form-hint">
                  {t(
                    "agentRoleEditor.hint.internalName",
                    "Unique identifier (lowercase, hyphens only)",
                  )}
                </span>
              </div>

              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.displayName", "Display Name")}{" "}
                  <span className="required">*</span>
                </label>
                <input
                  type="text"
                  value={editedRole.displayName}
                  onChange={(e) => handleChange("displayName", e.target.value)}
                  placeholder="e.g., Code Reviewer"
                />
              </div>

              <div className="form-row">
                <label>{t("common.description", "Description")}</label>
                <textarea
                  value={editedRole.description || ""}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder={t(
                    "agentRoleEditor.placeholder.description",
                    "Describe what this agent role specializes in...",
                  )}
                  rows={3}
                />
              </div>
            </div>
          )}

          {activeTab === "capabilities" && (
            <div className="editor-section">
              <p className="section-description">
                {t(
                  "agentRoleEditor.capabilities.description",
                  "Select the capabilities this agent role should have. At least one capability is required.",
                )}
              </p>
              <div className="capabilities-grid">
                {ALL_CAPABILITIES.map((cap) => (
                  <label
                    key={cap.value}
                    className={`capability-option ${editedRole.capabilities.includes(cap.value) ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={editedRole.capabilities.includes(cap.value)}
                      onChange={() => handleCapabilityToggle(cap.value)}
                    />
                    <span className="capability-icon">{cap.icon}</span>
                    <div className="capability-info">
                      <span className="capability-label">
                        {capabilityLabel(cap)}
                      </span>
                      <span className="capability-description">
                        {capabilityDescription(cap)}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {activeTab === "mission" && (
            <div className="editor-section">
              <p className="section-description">
                {t(
                  "agentRoleEditor.automation.description",
                  "Configure how this agent behaves when background automation is enabled.",
                )}
              </p>

              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.autonomyLevel", "Autonomy Level")}
                </label>
                <div className="autonomy-options">
                  {AUTONOMY_LEVELS.map((level) => (
                    <label
                      key={level.value}
                      className={`autonomy-option ${editedRole.autonomyLevel === level.value ? "selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="autonomyLevel"
                        value={level.value}
                        checked={editedRole.autonomyLevel === level.value}
                        onChange={(e) =>
                          handleChange(
                            "autonomyLevel",
                            e.target.value as "intern" | "specialist" | "lead",
                          )
                        }
                      />
                      <span className="autonomy-label">
                        {autonomyLabel(level)}
                      </span>
                      <span className="autonomy-description">
                        {autonomyDescription(level)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label>
                  {t(
                    "agentRoleEditor.field.soul",
                    "Soul (Extended Personality)",
                  )}
                </label>
                <textarea
                  value={editedRole.soul || ""}
                  onChange={(e) =>
                    handleChange("soul", e.target.value || undefined)
                  }
                  placeholder={`{
  "communicationStyle": "concise and technical",
  "focusAreas": ["performance", "architecture"],
  "preferences": {
    "codeStyle": "functional",
    "testingApproach": "TDD"
  },
  "avoids": ["over-engineering", "premature optimization"]
}`}
                  rows={8}
                  className="code-textarea"
                />
                <span className="form-hint">
                  {t(
                    "agentRoleEditor.hint.soul",
                    "JSON object defining extended personality traits, communication style, and preferences",
                  )}
                </span>
              </div>

              <div className="heartbeat-section">
                <div className="section-header">
                  <h4>
                    {t(
                      "agentRoleEditor.coreAutomation.title",
                      "Core Automation",
                    )}
                  </h4>
                </div>
                <p className="section-description">
                  {t(
                    "agentRoleEditor.coreAutomation.description",
                    "Heartbeat, subconscious, and memory are configured separately in Mission Control. Agent roles define operator identity and mandate, but they do not own core automation policy inline anymore.",
                  )}
                </p>
              </div>
            </div>
          )}

          {activeTab === "advanced" && (
            <div className="editor-section">
              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.systemPrompt", "System Prompt")}
                </label>
                <textarea
                  value={editedRole.systemPrompt || ""}
                  onChange={(e) => handleChange("systemPrompt", e.target.value)}
                  placeholder={t(
                    "agentRoleEditor.placeholder.systemPrompt",
                    "Optional custom system prompt for this agent role...",
                  )}
                  rows={6}
                />
                <span className="form-hint">
                  {t(
                    "agentRoleEditor.hint.systemPrompt",
                    "Override the default system prompt with custom instructions",
                  )}
                </span>
              </div>

              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.modelOverride", "Model Override")}
                </label>
                <input
                  type="text"
                  value={editedRole.modelKey || ""}
                  onChange={(e) =>
                    handleChange("modelKey", e.target.value || undefined)
                  }
                  placeholder="e.g., claude-3-opus-20240229"
                />
                <span className="form-hint">
                  {t(
                    "agentRoleEditor.hint.modelOverride",
                    "Leave empty to use the default model",
                  )}
                </span>
              </div>

              <div className="form-row">
                <label>
                  {t("agentRoleEditor.field.sortOrder", "Sort Order")}
                </label>
                <input
                  type="number"
                  value={editedRole.sortOrder}
                  onChange={(e) =>
                    handleChange("sortOrder", parseInt(e.target.value) || 100)
                  }
                  min={1}
                  max={999}
                />
                <span className="form-hint">
                  {t(
                    "agentRoleEditor.hint.sortOrder",
                    "Lower numbers appear first (1-999)",
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </form>

      <style>{`
        .agent-role-editor {
          width: min(100%, 980px);
          margin: 0 auto;
          padding: 28px 32px 36px;
          color: var(--color-text-primary);
        }

        .editor-header {
          display: flex;
          align-items: center;
          gap: 18px;
          min-height: 56px;
          padding-bottom: 22px;
          margin-bottom: 18px;
          border-bottom: 1px solid var(--color-border-subtle);
        }

        .editor-header h3 {
          margin: 0;
          color: var(--color-text-primary);
          font-size: 25px;
          font-weight: 720;
          letter-spacing: -0.025em;
          line-height: 1.2;
        }

        .editor-title-block {
          flex: 1;
          min-width: 0;
        }

        .editor-title-block p {
          margin: 5px 0 0;
          color: var(--color-text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .btn-back {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          min-height: 38px;
          padding: 0 11px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          color: var(--color-text-secondary);
          cursor: pointer;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 650;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 160ms ease;
        }

        .btn-back:hover {
          background: var(--color-bg-hover);
          border-color: color-mix(in srgb, var(--color-accent) 42%, var(--color-border));
          color: var(--color-text-primary);
        }

        .btn-back:active,
        .agent-role-editor .btn-primary:active {
          transform: translateY(1px);
        }

        .agent-role-editor .btn-primary {
          flex: 0 0 auto;
          min-height: 42px;
          padding: 0 18px;
          border-radius: var(--radius-sm);
          box-shadow: none;
          font-size: 13px;
          font-weight: 700;
        }

        .agent-role-editor .btn-primary:disabled {
          cursor: not-allowed;
          opacity: 0.48;
        }

        .editor-tabs {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          max-width: 100%;
          padding: 4px;
          overflow-x: auto;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          margin: 0 0 20px;
        }

        .editor-tab {
          background: transparent;
          border: none;
          padding: 8px 14px;
          color: var(--color-text-secondary);
          cursor: pointer;
          font-size: 13px;
          font-weight: 650;
          line-height: 20px;
          border-radius: 8px;
          white-space: nowrap;
          transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .editor-tab:hover {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
        }

        .editor-tab.active {
          background: var(--color-bg-primary);
          box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text-primary) 9%, transparent);
          color: var(--color-accent-dark);
        }

        .editor-content {
          background: transparent;
        }

        .editor-section {
          display: flex;
          flex-direction: column;
          gap: 18px;
          padding: 26px 28px 28px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: 0 12px 30px color-mix(in srgb, var(--color-text-primary) 5%, transparent);
        }

        .editor-section-heading h4 {
          margin: 0;
          color: var(--color-text-primary);
          font-size: 16px;
          font-weight: 720;
          letter-spacing: -0.01em;
        }

        .editor-section-heading p {
          margin: 5px 0 0;
          color: var(--color-text-secondary);
          font-size: 13px;
          line-height: 1.5;
        }

        .section-description {
          color: var(--color-text-secondary);
          font-size: 13px;
          margin: 0 0 8px 0;
        }

        .form-row {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .form-row label {
          font-size: 13px;
          font-weight: 680;
          color: var(--color-text-primary);
        }

        .required {
          color: var(--color-error);
        }

        .form-row input,
        .form-row textarea,
        .form-row select {
          padding: 10px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-input);
          color: var(--color-text-primary);
          font-size: 14px;
          line-height: 1.45;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .form-row input:focus,
        .form-row textarea:focus,
        .form-row select:focus {
          outline: none;
          border-color: var(--color-accent);
          background: var(--color-bg-primary);
          box-shadow: 0 0 0 3px var(--color-accent-subtle);
        }

        .form-row input.disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .form-hint {
          font-size: 12px;
          color: var(--color-text-muted);
          line-height: 1.45;
        }

        .icon-color-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          padding: 16px;
          background: color-mix(in srgb, var(--color-accent-subtle) 44%, var(--color-bg-secondary));
          border: 1px solid color-mix(in srgb, var(--color-accent) 22%, var(--color-border));
          border-radius: 12px;
        }

        .icon-picker-container,
        .color-picker-container {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .icon-button {
          width: 54px;
          height: 54px;
          border: 1px solid color-mix(in srgb, var(--color-text-primary) 15%, transparent);
          border-radius: 12px;
          color: var(--color-text-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 1px 0 color-mix(in srgb, white 30%, transparent);
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .icon-button:hover,
        .color-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px color-mix(in srgb, var(--color-text-primary) 12%, transparent);
        }

        .color-button {
          width: 54px;
          height: 54px;
          border: 3px solid var(--color-bg-primary);
          outline: 1px solid color-mix(in srgb, var(--color-text-primary) 18%, transparent);
          border-radius: 12px;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease;
        }

        .picker-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 10px;
          z-index: 100;
          box-shadow: 0 16px 34px color-mix(in srgb, var(--color-text-primary) 18%, transparent);
          margin-top: 6px;
        }

        .picker-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }

        .picker-item {
          width: 32px;
          height: 32px;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          background: var(--color-bg-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .picker-item:hover {
          background: var(--color-bg-tertiary);
        }

        .picker-item.selected {
          border-color: var(--color-accent);
        }

        .picker-item.color {
          border-width: 2px;
        }

        .custom-color-input {
          width: 100%;
          height: 32px;
          margin-top: 8px;
          cursor: pointer;
        }

        .capabilities-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 10px;
        }

        .capability-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px;
          background: var(--color-bg-input);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }

        .capability-option:hover {
          border-color: color-mix(in srgb, var(--color-accent) 48%, var(--color-border));
          transform: translateY(-1px);
        }

        .capability-option.selected {
          border-color: var(--color-accent);
          background: var(--color-accent-subtle);
        }

        .capability-option input {
          display: none;
        }

        .capability-icon {
          font-size: 20px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-secondary);
          border-radius: 8px;
        }

        .capability-info {
          flex: 1;
        }

        .capability-label {
          display: block;
          font-weight: 600;
          font-size: 14px;
          color: var(--color-text-primary);
        }

        .capability-description {
          display: block;
          font-size: 11px;
          color: var(--color-text-secondary);
          margin-top: 2px;
        }

        /* Mission Control Styles */
        .autonomy-options {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .autonomy-option {
          display: flex;
          flex-direction: column;
          min-height: 104px;
          padding: 14px;
          background: var(--color-bg-input);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          cursor: pointer;
          transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
        }

        .autonomy-option:hover {
          border-color: color-mix(in srgb, var(--color-accent) 48%, var(--color-border));
          transform: translateY(-1px);
        }

        .autonomy-option.selected {
          border-color: var(--color-accent);
          background: var(--color-accent-subtle);
        }

        .autonomy-option input {
          display: none;
        }

        .autonomy-label {
          font-weight: 700;
          font-size: 14px;
          color: var(--color-text-primary);
        }

        .autonomy-description {
          font-size: 12px;
          color: var(--color-text-secondary);
          margin-top: 4px;
        }

        .code-textarea {
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.5;
        }

        .heartbeat-section {
          background: var(--color-bg-input);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 18px;
          margin-top: 8px;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .section-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary);
        }

        .toggle-switch {
          position: relative;
          width: 44px;
          height: 24px;
          cursor: pointer;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--color-bg-tertiary);
          border-radius: 24px;
          transition: 0.2s;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: var(--color-text-secondary);
          border-radius: 50%;
          transition: 0.2s;
        }

        .toggle-switch input:checked + .toggle-slider {
          background-color: var(--color-accent);
        }

        .toggle-switch input:checked + .toggle-slider:before {
          transform: translateX(20px);
          background-color: white;
        }

        .heartbeat-options {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--color-border);
        }

        @media (max-width: 680px) {
          .agent-role-editor {
            padding: 20px 16px 28px;
          }

          .editor-header {
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 12px;
          }

          .editor-title-block {
            order: 3;
            flex-basis: 100%;
          }

          .editor-header h3 {
            font-size: 22px;
          }

          .agent-role-editor .btn-primary {
            margin-left: auto;
          }

          .editor-section {
            padding: 20px;
          }

          .icon-color-row,
          .autonomy-options {
            grid-template-columns: 1fr;
          }

          .editor-tabs {
            display: flex;
            width: 100%;
          }

          .editor-tab {
            flex: 1 0 auto;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
