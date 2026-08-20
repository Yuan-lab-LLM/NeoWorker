import { useState, useEffect, useMemo } from "react";
import { FolderOpen, RefreshCw, Plus } from "lucide-react";
import { CustomSkill, SkillParameter } from "../../shared/types";
import { getEmojiIcon } from "../utils/emoji-icon-map";
import { translate, useLanguage } from "../i18n";
import { getSemanticIconVisual } from "../utils/semantic-icon-map";
import {
  getLocalizedSkillCategory,
  getLocalizedSkillSource,
  getLocalizedSkillText,
} from "../utils/localized-skills";
import { notifySkillInventoryUpdated } from "../utils/skill-inventory-events";
import { isSkillVisibleForCurrentProductSupport } from "../utils/product-availability";
import "./skills-settings.css";

interface SkillsSettingsProps {
  onSkillSelect?: (skill: CustomSkill) => void;
}

const SKILL_CATEGORY_ORDER = [
  "Guidelines",
  "Research",
  "Writing",
  "Productivity",
  "Development",
  "Engineering",
  "Documentation",
  "Data",
  "Marketing",
  "Finance",
  "Legal",
  "Security",
  "Automation",
  "Tools",
  "Utilities",
  "__uncategorized__",
];

export function SkillsSettings({ onSkillSelect }: SkillsSettingsProps) {
  useLanguage();
  const t = translate;
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [externalSkillDirectories, setExternalSkillDirectories] = useState<
    string[]
  >([]);
  const [externalSkillDirectoryInput, setExternalSkillDirectoryInput] =
    useState("");
  const [loading, setLoading] = useState(true);
  const [editingSkill, setEditingSkill] = useState<CustomSkill | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("__all__");

  // Load skills on mount
  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const [loadedSkills, settings] = await Promise.all([
        window.electronAPI.listCustomSkills(),
        window.electronAPI.getCustomSkillSettings(),
      ]);
      setSkills(loadedSkills.filter(isSkillVisibleForCurrentProductSupport));
      setExternalSkillDirectories(settings.externalSkillDirectories || []);
      setError(null);
    } catch (err) {
      setError(t("skills.error.load", "Failed to load skills"));
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReload = async () => {
    try {
      const reloadedSkills = await window.electronAPI.reloadCustomSkills();
      setSkills(reloadedSkills.filter(isSkillVisibleForCurrentProductSupport));
      setError(null);
      notifySkillInventoryUpdated();
    } catch {
      setError(t("skills.error.reload", "Failed to reload skills"));
    }
  };

  const handleOpenFolder = async () => {
    await window.electronAPI.openCustomSkillsFolder();
  };

  const handleAddExternalDirectory = async () => {
    const nextDir = externalSkillDirectoryInput.trim();
    if (!nextDir) return;

    try {
      const settings = await window.electronAPI.setExternalSkillDirectories([
        ...externalSkillDirectories,
        nextDir,
      ]);
      setExternalSkillDirectories(settings.externalSkillDirectories || []);
      setExternalSkillDirectoryInput("");
      await loadSkills();
      notifySkillInventoryUpdated();
    } catch (err: Any) {
      setError(
        err?.message ||
          t(
            "skills.error.addExternalDirectory",
            "Failed to add external skill directory",
          ),
      );
    }
  };

  const handleRemoveExternalDirectory = async (dir: string) => {
    try {
      const settings = await window.electronAPI.setExternalSkillDirectories(
        externalSkillDirectories.filter((entry) => entry !== dir),
      );
      setExternalSkillDirectories(settings.externalSkillDirectories || []);
      await loadSkills();
      notifySkillInventoryUpdated();
    } catch (err: Any) {
      setError(
        err?.message ||
          t(
            "skills.error.removeExternalDirectory",
            "Failed to remove external skill directory",
          ),
      );
    }
  };

  const handleOpenExternalDirectory = async (dir: string) => {
    try {
      await window.electronAPI.openExternalSkillFolder(dir);
    } catch (err: Any) {
      setError(
        err?.message ||
          t(
            "skills.error.openExternalDirectory",
            "Failed to open external skill directory",
          ),
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        t(
          "skills.confirm.delete",
          "Are you sure you want to delete this skill?",
        ),
      )
    )
      return;

    try {
      await window.electronAPI.deleteCustomSkill(id);
      setSkills((prev) => prev.filter((s) => s.id !== id));
      notifySkillInventoryUpdated();
    } catch {
      setError(t("skills.error.delete", "Failed to delete skill"));
    }
  };

  const handleEdit = (skill: CustomSkill) => {
    setEditingSkill({ ...skill });
    setIsCreating(false);
  };

  const handleCreate = () => {
    setEditingSkill({
      id: "",
      name: "",
      description: "",
      icon: "⚡",
      prompt: "",
      category: "",
      enabled: true,
      parameters: [],
    });
    setIsCreating(true);
  };

  const handleSave = async () => {
    if (!editingSkill) return;

    try {
      if (isCreating) {
        const created =
          await window.electronAPI.createCustomSkill(editingSkill);
        if (isSkillVisibleForCurrentProductSupport(created)) {
          setSkills((prev) => [...prev, created]);
        }
      } else {
        const updated = await window.electronAPI.updateCustomSkill(
          editingSkill.id,
          editingSkill,
        );
        setSkills((prev) =>
          prev
            .map((s) => (s.id === updated.id ? updated : s))
            .filter(isSkillVisibleForCurrentProductSupport),
        );
      }
      setEditingSkill(null);
      setIsCreating(false);
      setError(null);
      notifySkillInventoryUpdated();
    } catch (err: Any) {
      setError(err.message || t("skills.error.save", "Failed to save skill"));
    }
  };

  const handleCancel = () => {
    setEditingSkill(null);
    setIsCreating(false);
  };

  const skillCategories = useMemo(() => {
    const grouped = skills.reduce(
      (acc, skill) => {
        const category = skill.category || "__uncategorized__";
        if (!acc[category]) acc[category] = [];
        acc[category].push(skill);
        return acc;
      },
      {} as Record<string, CustomSkill[]>,
    );

    return Object.entries(grouped)
      .map(([id, categorySkills]) => ({
        id,
        skills: categorySkills,
        label:
          id === "__uncategorized__"
            ? t("skills.uncategorized", "Uncategorized")
            : getLocalizedSkillCategory(id) || id,
      }))
      .sort((a, b) => {
        const aIndex = SKILL_CATEGORY_ORDER.indexOf(a.id);
        const bIndex = SKILL_CATEGORY_ORDER.indexOf(b.id);
        const aOrder = aIndex === -1 ? SKILL_CATEGORY_ORDER.length : aIndex;
        const bOrder = bIndex === -1 ? SKILL_CATEGORY_ORDER.length : bIndex;
        return aOrder - bOrder || a.label.localeCompare(b.label, "zh-CN");
      });
  }, [skills, t]);

  const visibleSkillCategories =
    activeCategory === "__all__"
      ? skillCategories
      : skillCategories.filter((category) => category.id === activeCategory);

  if (loading) {
    return (
      <div className="settings-loading">
        {t("skills.loading", "Loading skills...")}
      </div>
    );
  }

  // Edit/Create form
  if (editingSkill) {
    return (
      <SkillEditor
        skill={editingSkill}
        isCreating={isCreating}
        onChange={setEditingSkill}
        onSave={handleSave}
        onCancel={handleCancel}
        error={error}
      />
    );
  }

  return (
    <div className="skills-settings">
      <div className="settings-section skills-settings-intro">
        <div className="settings-section-header skills-settings-header">
          <div className="skills-settings-heading-copy">
            <h3>{t("skills.title", "Custom Skills")}</h3>
            <p className="settings-description">
              {t(
                "skills.description",
                "Create custom prompt templates for things we do often. Skills are stored as JSON files and can be shared or version controlled.",
              )}
            </p>
          </div>
          <div className="settings-section-actions">
            <button className="btn-secondary btn-sm" onClick={handleOpenFolder}>
              <FolderOpen size={14} strokeWidth={2} />
              {t("skills.openFolder", "Open Folder")}
            </button>
            <button className="btn-secondary btn-sm" onClick={handleReload}>
              <RefreshCw size={14} strokeWidth={2} />
              {t("skills.reload", "Reload")}
            </button>
            <button className="btn-primary btn-sm" onClick={handleCreate}>
              <Plus size={14} strokeWidth={2} />
              {t("skills.newSkill", "New Skill")}
            </button>
          </div>
        </div>
        <div className="form-group skills-external-directory">
          <label>
            {t("skills.externalDirectories", "External Skill Directories")}
          </label>
          <div className="settings-section-actions skills-directory-actions">
            <input
              type="text"
              value={externalSkillDirectoryInput}
              onChange={(e) => setExternalSkillDirectoryInput(e.target.value)}
              placeholder="/absolute/path/to/shared/skills"
            />
            <button
              className="btn-secondary btn-sm"
              onClick={handleAddExternalDirectory}
            >
              {t("skills.addDirectory", "Add Directory")}
            </button>
          </div>
          <p className="form-hint">
            {t(
              "skills.externalDirectoriesHint",
              "External directories are loaded read-only. Managed installs still go to the main NeoWorker skills folder and take precedence over these shared paths.",
            )}
          </p>
          {externalSkillDirectories.length > 0 && (
            <div className="parameters-list">
              {externalSkillDirectories.map((dir) => (
                <div key={dir} className="parameter-item">
                  <div className="parameter-main">
                    <div className="parameter-row">
                      <input type="text" value={dir} readOnly />
                    </div>
                  </div>
                  <div className="parameter-actions">
                    <button
                      className="btn-secondary btn-xs"
                      onClick={() => handleOpenExternalDirectory(dir)}
                    >
                      {t("skills.open", "Open")}
                    </button>
                    <button
                      className="btn-danger btn-xs"
                      onClick={() => handleRemoveExternalDirectory(dir)}
                    >
                      {t("skills.remove", "Remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="settings-error">{error}</div>}

      {skills.length === 0 ? (
        <div className="skills-empty">
          <p>{t("skills.empty.title", "No custom skills found.")}</p>
          <p>
            {t(
              "skills.empty.hint",
              'Click "New Skill" to create your first skill, or "Open Folder" to add skill JSON files manually.',
            )}
          </p>
        </div>
      ) : (
        <div className="skills-list">
          <div
            className="skills-category-filter"
            role="tablist"
            aria-label={t("skills.categoryFilter", "Skill categories")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === "__all__"}
              className={`skills-category-filter-item ${activeCategory === "__all__" ? "active" : ""}`}
              onClick={() => setActiveCategory("__all__")}
            >
              {t("skills.category.all", "All")}
              <span>{skills.length}</span>
            </button>
            {skillCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === category.id}
                className={`skills-category-filter-item ${activeCategory === category.id ? "active" : ""}`}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.label}
                <span>{category.skills.length}</span>
              </button>
            ))}
          </div>

          {visibleSkillCategories.map((category) => (
            <div key={category.id} className="skills-category">
              <h4 className="skills-category-title">
                {category.label}
                <span>
                  {t("skills.category.count", "{count} skills", {
                    count: category.skills.length,
                  })}
                </span>
              </h4>
              <div className="skills-grid">
                {category.skills.map((skill) => {
                  const localizedSkill = getLocalizedSkillText(skill);
                  const skillVisual = getSemanticIconVisual({
                    name: localizedSkill.name,
                    description: localizedSkill.description,
                    category: getLocalizedSkillCategory(skill.category),
                    fallback: getEmojiIcon(skill.icon),
                  });
                  const SkillIcon = skillVisual.Icon;
                  return (
                    <div
                      key={skill.id}
                      className={`skill-card ${skill.type === "guideline" ? "skill-card-guideline" : ""}`}
                    >
                      <div className="skill-card-header">
                        <span
                          className="skill-icon semantic-icon"
                          data-icon-tone={skillVisual.tone}
                        >
                          <SkillIcon size={18} strokeWidth={1.65} />
                        </span>
                        <div className="skill-info">
                          <span className="skill-name">
                            {localizedSkill.name}
                            {skill.source && (
                              <span className="skill-type-badge">
                                {getLocalizedSkillSource(skill.source)}
                              </span>
                            )}
                            {skill.type === "guideline" && (
                              <span className="skill-type-badge">
                                {t("skills.badge.behavior", "Behavior")}
                              </span>
                            )}
                          </span>
                          <span className="skill-description">
                            {localizedSkill.description}
                          </span>
                        </div>
                        {skill.type === "guideline" &&
                          skill.source !== "bundled" &&
                          skill.source !== "external" && (
                            <label className="settings-toggle">
                              <input
                                type="checkbox"
                                checked={skill.enabled !== false}
                                onChange={async (e) => {
                                  try {
                                    const updated =
                                      await window.electronAPI.updateCustomSkill(
                                        skill.id,
                                        { enabled: e.target.checked },
                                      );
                                    setSkills((prev) =>
                                      prev.map((s) =>
                                        s.id === updated.id ? updated : s,
                                      ),
                                    );
                                    notifySkillInventoryUpdated();
                                  } catch (err) {
                                    console.error(
                                      "Failed to toggle skill:",
                                      err,
                                    );
                                  }
                                }}
                              />
                              <span className="toggle-slider"></span>
                            </label>
                          )}
                      </div>
                      <div className="skill-card-actions">
                        {onSkillSelect && skill.type !== "guideline" && (
                          <button
                            className="btn-primary btn-xs"
                            onClick={() => onSkillSelect(skill)}
                          >
                            {t("skills.use", "Use")}
                          </button>
                        )}
                        {skill.source !== "bundled" &&
                          skill.source !== "external" && (
                            <button
                              className="btn-secondary btn-xs"
                              onClick={() => handleEdit(skill)}
                            >
                              {t("skills.edit", "Edit")}
                            </button>
                          )}
                        {skill.source !== "bundled" &&
                          skill.source !== "external" && (
                            <button
                              className="btn-danger btn-xs"
                              onClick={() => handleDelete(skill.id)}
                            >
                              {t("skills.delete", "Delete")}
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Skill Editor Component
interface SkillEditorProps {
  skill: CustomSkill;
  isCreating: boolean;
  onChange: (skill: CustomSkill) => void;
  onSave: () => void;
  onCancel: () => void;
  error: string | null;
}

function SkillEditor({
  skill,
  isCreating,
  onChange,
  onSave,
  onCancel,
  error,
}: SkillEditorProps) {
  useLanguage();
  const t = translate;
  const updateField = <K extends keyof CustomSkill>(
    field: K,
    value: CustomSkill[K],
  ) => {
    onChange({ ...skill, [field]: value });
  };

  const addParameter = () => {
    const newParam: SkillParameter = {
      name: "",
      type: "string",
      description: "",
      required: false,
    };
    onChange({ ...skill, parameters: [...(skill.parameters || []), newParam] });
  };

  const updateParameter = (index: number, updates: Partial<SkillParameter>) => {
    const params = [...(skill.parameters || [])];
    params[index] = { ...params[index], ...updates };
    onChange({ ...skill, parameters: params });
  };

  const removeParameter = (index: number) => {
    const params = [...(skill.parameters || [])];
    params.splice(index, 1);
    onChange({ ...skill, parameters: params });
  };

  return (
    <div className="skill-editor">
      <div className="settings-section">
        <h3>
          {isCreating
            ? t("skills.editor.createTitle", "Create New Skill")
            : t("skills.editor.editTitle", "Edit Skill")}
        </h3>
      </div>

      {error && <div className="settings-error">{error}</div>}

      <div className="skill-editor-form">
        <div className="form-row">
          <div className="form-group form-group-icon">
            <label>{t("skills.editor.icon", "Icon")}</label>
            <input
              type="text"
              value={skill.icon}
              onChange={(e) => updateField("icon", e.target.value)}
              placeholder="⚡"
              maxLength={2}
            />
          </div>
          <div className="form-group form-group-flex">
            <label>{t("skills.editor.name", "Name *")}</label>
            <input
              type="text"
              value={skill.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={t(
                "skills.editor.namePlaceholder",
                "My Custom Skill",
              )}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group-flex">
            <label>{t("skills.editor.category", "Category")}</label>
            <input
              type="text"
              value={skill.category || ""}
              onChange={(e) => updateField("category", e.target.value)}
              placeholder={t(
                "skills.editor.categoryPlaceholder",
                "Development, Documentation, etc.",
              )}
            />
          </div>
        </div>

        <div className="form-group">
          <label>{t("skills.editor.description", "Description *")}</label>
          <input
            type="text"
            value={skill.description}
            onChange={(e) => updateField("description", e.target.value)}
            placeholder={t(
              "skills.editor.descriptionPlaceholder",
              "What does this skill do?",
            )}
          />
        </div>

        <div className="form-group">
          <label>
            {t("skills.editor.promptTemplate", "Prompt Template *")}
          </label>
          <textarea
            value={skill.prompt}
            onChange={(e) => updateField("prompt", e.target.value)}
            placeholder={t(
              "skills.editor.promptPlaceholder",
              "Enter the prompt template. Use {{parameterName}} for placeholders.",
            )}
            rows={8}
          />
          <p className="form-hint">
            {t(
              "skills.editor.promptHint",
              "Use {{parameterName}} syntax to insert parameter values into the prompt.",
            )}
          </p>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <h4>{t("skills.editor.parameters", "Parameters")}</h4>
            <button className="btn-secondary btn-xs" onClick={addParameter}>
              {t("skills.editor.addParameter", "+ Add Parameter")}
            </button>
          </div>

          {(skill.parameters || []).length === 0 ? (
            <p className="form-hint">
              {t(
                "skills.editor.noParameters",
                "No parameters defined. Add parameters to make your skill configurable.",
              )}
            </p>
          ) : (
            <div className="parameters-list">
              {(skill.parameters || []).map((param, index) => (
                <div key={index} className="parameter-item">
                  <div className="parameter-row">
                    <div className="form-group form-group-sm">
                      <label>{t("skills.editor.parameterName", "Name")}</label>
                      <input
                        type="text"
                        value={param.name}
                        onChange={(e) =>
                          updateParameter(index, { name: e.target.value })
                        }
                        placeholder="paramName"
                      />
                    </div>
                    <div className="form-group form-group-sm">
                      <label>{t("skills.editor.parameterType", "Type")}</label>
                      <select
                        value={param.type}
                        onChange={(e) =>
                          updateParameter(index, {
                            type: e.target.value as SkillParameter["type"],
                          })
                        }
                      >
                        <option value="string">
                          {t("skills.editor.type.string", "String")}
                        </option>
                        <option value="number">
                          {t("skills.editor.type.number", "Number")}
                        </option>
                        <option value="boolean">
                          {t("skills.editor.type.boolean", "Boolean")}
                        </option>
                        <option value="select">
                          {t("skills.editor.type.select", "Select")}
                        </option>
                      </select>
                    </div>
                    <div className="form-group form-group-sm">
                      <label>{t("skills.editor.required", "Required")}</label>
                      <input
                        type="checkbox"
                        checked={param.required || false}
                        onChange={(e) =>
                          updateParameter(index, { required: e.target.checked })
                        }
                      />
                    </div>
                    <button
                      className="btn-danger btn-xs"
                      onClick={() => removeParameter(index)}
                    >
                      {t("skills.remove", "Remove")}
                    </button>
                  </div>
                  <div className="parameter-row">
                    <div className="form-group form-group-flex">
                      <label>
                        {t("skills.editor.parameterDescription", "Description")}
                      </label>
                      <input
                        type="text"
                        value={param.description}
                        onChange={(e) =>
                          updateParameter(index, {
                            description: e.target.value,
                          })
                        }
                        placeholder={t(
                          "skills.editor.parameterDescriptionPlaceholder",
                          "What is this parameter for?",
                        )}
                      />
                    </div>
                    <div className="form-group form-group-sm">
                      <label>
                        {t("skills.editor.defaultValue", "Default")}
                      </label>
                      <input
                        type="text"
                        value={String(param.default || "")}
                        onChange={(e) =>
                          updateParameter(index, { default: e.target.value })
                        }
                        placeholder={t(
                          "skills.editor.defaultValuePlaceholder",
                          "Default value",
                        )}
                      />
                    </div>
                  </div>
                  {param.type === "select" && (
                    <div className="parameter-row">
                      <div className="form-group form-group-flex">
                        <label>
                          {t(
                            "skills.editor.options",
                            "Options (comma-separated)",
                          )}
                        </label>
                        <input
                          type="text"
                          value={(param.options || []).join(", ")}
                          onChange={(e) =>
                            updateParameter(index, {
                              options: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="option1, option2, option3"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="skill-editor-actions">
        <button className="btn-secondary" onClick={onCancel}>
          {t("skills.cancel", "Cancel")}
        </button>
        <button
          className="btn-primary"
          onClick={onSave}
          disabled={!skill.name || !skill.description || !skill.prompt}
        >
          {isCreating
            ? t("skills.editor.createAction", "Create Skill")
            : t("skills.editor.saveChanges", "Save Changes")}
        </button>
      </div>
    </div>
  );
}
