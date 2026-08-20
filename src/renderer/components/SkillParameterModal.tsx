import { useState, useEffect, useRef } from "react";
import { ChevronDown, FileUp, FolderOpen, Save, Sparkles } from "lucide-react";
import { CustomSkill, SkillParameter } from "../../shared/types";
import { getCurrentLanguage, translate, useLanguage } from "../i18n";
import {
  buildLocalizedSkillComposerPrompt,
  getLocalizedSkillParameterText,
  getLocalizedSkillText,
} from "../utils/localized-skills";

export type SkillParameterFormValue = string | number | boolean;
export type SkillParameterFormValues = Record<string, SkillParameterFormValue>;

interface SkillParameterModalProps {
  skill: CustomSkill;
  onSubmit: (values: SkillParameterFormValues) => void;
  onAskInChat?: (values: SkillParameterFormValues) => void;
  onCancel: () => void;
}

const ARTIFACT_DIR_FALLBACK = "artifacts";

export type SkillPathParameterKind =
  "file" | "folder" | "file-or-folder" | "output-file";
type PathPickerAction = "file" | "folder" | "save";

function normalizeTemplateDefault(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.replace(/\{artifactDir\}/g, ARTIFACT_DIR_FALLBACK);
}

export function getSkillPathParameterKind(
  _skill: CustomSkill,
  param: SkillParameter,
): SkillPathParameterKind | null {
  if (param.type !== "string") return null;
  if (param.input === "file") return "file";
  if (param.input === "folder") return "folder";

  const name = param.name.trim().toLowerCase().replace(/-/g, "_");
  const description = (param.description || "").trim().toLowerCase();

  // URLs and web routes are text values even though their descriptions may
  // contain words such as "path".
  if (
    /(^|_)(url|uri)($|_)/.test(name) ||
    /\bhttps?:\/\//.test(description) ||
    /\burl\b/.test(description)
  ) {
    return null;
  }

  const mentionsFileAndFolder =
    /file\s+or\s+folder|files?\s*\/\s*folders?|directories\s*\/\s*files|directories\s+and\s+files/.test(
      description,
    ) ||
    (/\bfiles?\b/.test(description) &&
      /\b(folder|director(?:y|ies))\b/.test(description));
  if (mentionsFileAndFolder) return "file-or-folder";

  const isOutputPath =
    /(^|_)(output|destination|save)(?:_[a-z0-9]+)*_(path|file)$/.test(name) ||
    /(^|_)(output|destination|save)_path$/.test(name) ||
    /\b(output path|where to write|writes? output|save(?:d)? (?:to|as)|destination path)\b/.test(
      description,
    );
  const isDirectory =
    /(^|_)(dir|directory|folder)($|_)/.test(name) ||
    /\b(folder|directory|project directory|output directory|wiki vault)\b/.test(
      description,
    );

  if (isOutputPath && !isDirectory) return "output-file";
  if (isDirectory) return "folder";

  const isFile =
    /(^|_)(file\d*|document|agreement|attachment)($|_)/.test(name) ||
    /(^|_)(csv|data_csv|source_material_path)($|_)/.test(name) ||
    /\b(file|document|agreement|redline|demand letter|side letter|memo|docx|pdf|txt|csv|pptx|xlsx)\b/.test(
      description,
    );
  if (isFile) return "file";

  // Generic path/scope fields often accept either a file or a directory. The
  // two actions preserve that flexibility while keeping manual entry possible.
  if (
    /(^|_)(path|scope_hint|reference_assets)($|_)/.test(name) ||
    /\b(local path|workspace path|path to search|paths? or notes)\b/.test(
      description,
    )
  ) {
    return "file-or-folder";
  }

  return null;
}

export function isFileSkillParameter(
  skill: CustomSkill,
  param: SkillParameter,
): boolean {
  return getSkillPathParameterKind(skill, param) === "file";
}

export function collectSkillParameterValues(
  skill: CustomSkill,
  values: SkillParameterFormValues,
  touched: Record<string, boolean> = {},
): SkillParameterFormValues {
  const collected: SkillParameterFormValues = {};
  for (const param of skill.parameters || []) {
    const value = values[param.name];
    const hasDefault = param.default !== undefined;
    const wasTouched = touched[param.name] === true;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        collected[param.name] = trimmed;
      } else if (hasDefault) {
        collected[param.name] = normalizeTemplateDefault(
          param.default,
        ) as SkillParameterFormValue;
      }
      continue;
    }
    if (value !== undefined && (wasTouched || hasDefault)) {
      collected[param.name] = hasDefault
        ? (normalizeTemplateDefault(value) as SkillParameterFormValue)
        : value;
    }
  }
  return collected;
}

export function collectSkillParameterSubmissionValues(
  skill: CustomSkill,
  values: SkillParameterFormValues,
  touched: Record<string, boolean> = {},
): SkillParameterFormValues {
  if (skill.id !== "ppt-master") {
    return collectSkillParameterValues(skill, values, touched);
  }

  const collected: SkillParameterFormValues = {};
  for (const param of skill.parameters || []) {
    if (!param.required && touched[param.name] !== true) continue;
    const value = values[param.name];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) collected[param.name] = trimmed;
      else if (param.required && param.default !== undefined) {
        collected[param.name] = normalizeTemplateDefault(
          param.default,
        ) as SkillParameterFormValue;
      }
      continue;
    }
    if (value !== undefined) collected[param.name] = value;
  }
  return collected;
}

export function expandSkillPrompt(
  skill: CustomSkill,
  values: SkillParameterFormValues,
): string {
  if (getCurrentLanguage() === "zh-CN") {
    const parameterLines = (skill.parameters || [])
      .map((param) => {
        const value =
          values[param.name] ?? normalizeTemplateDefault(param.default);
        if (value === undefined || value === "") return null;
        const localizedParameter = getLocalizedSkillParameterText(skill, param);
        return `- ${localizedParameter.name}：${String(value)}`;
      })
      .filter((line): line is string => Boolean(line));
    return buildLocalizedSkillComposerPrompt(skill, {
      parameterLines,
      includeTaskPlaceholder: parameterLines.length === 0,
    });
  }

  let prompt = skill.prompt;
  skill.parameters?.forEach((param) => {
    const value =
      values[param.name] ?? normalizeTemplateDefault(param.default) ?? "";
    const placeholder = new RegExp(`\\{\\{${param.name}\\}\\}`, "g");
    const normalizedValue =
      typeof value === "string"
        ? value.replace(/\{artifactDir\}/g, ARTIFACT_DIR_FALLBACK)
        : value;
    prompt = prompt.replace(placeholder, String(normalizedValue));
  });
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, "");
  prompt = prompt.replace(/\{artifactDir\}/g, ARTIFACT_DIR_FALLBACK);
  return prompt.trim();
}

export function SkillParameterModal({
  skill,
  onSubmit,
  onAskInChat,
  onCancel,
}: SkillParameterModalProps) {
  useLanguage();
  const t = translate;
  const localizedSkill = getLocalizedSkillText(skill);
  const isPptMaster = skill.id === "ppt-master";
  const isChinese = getCurrentLanguage() === "zh-CN";
  const [values, setValues] = useState<SkillParameterFormValues>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectingPathParameter, setSelectingPathParameter] = useState<
    string | null
  >(null);
  const [pathPickerError, setPathPickerError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Initialize with default values
  useEffect(() => {
    const initialValues: SkillParameterFormValues = {};
    skill.parameters?.forEach((param) => {
      if (param.default !== undefined) {
        initialValues[param.name] = normalizeTemplateDefault(param.default) as
          string | number | boolean;
      } else if (param.type === "boolean") {
        initialValues[param.name] = false;
      } else if (param.type === "number") {
        initialValues[param.name] = 0;
      } else {
        initialValues[param.name] = "";
      }
    });
    setValues(initialValues);
    setTouched({});
    setAdvancedOpen(false);
  }, [skill]);

  // Focus first input on mount
  useEffect(() => {
    if (isPptMaster && !advancedOpen) return;
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 100);
  }, [advancedOpen, isPptMaster]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  const handleChange = (name: string, value: string | number | boolean) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectPath = async (
    param: SkillParameter,
    action: PathPickerAction,
  ) => {
    const selectionKey = `${param.name}:${action}`;
    setSelectingPathParameter(selectionKey);
    setPathPickerError(null);
    try {
      const currentValue = values[param.name];
      const defaultPath =
        typeof currentValue === "string" && currentValue.trim()
          ? currentValue.trim()
          : undefined;

      if (action === "file") {
        const selectedFiles = await window.electronAPI.selectFiles(defaultPath);
        const selectedFile = selectedFiles?.[0];
        if (selectedFile?.path) handleChange(param.name, selectedFile.path);
      } else if (action === "folder") {
        const selectedFolder =
          await window.electronAPI.selectFolder(defaultPath);
        if (selectedFolder) handleChange(param.name, selectedFolder);
      } else {
        const selectedOutput =
          await window.electronAPI.selectSavePath(defaultPath);
        if (selectedOutput) handleChange(param.name, selectedOutput);
      }
    } catch (error) {
      console.error("Failed to select skill parameter path:", error);
      setPathPickerError(param.name);
    } finally {
      setSelectingPathParameter(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(collectSkillParameterSubmissionValues(skill, values, touched));
  };

  const handleAskInChat = () => {
    if (!onAskInChat) return;
    onAskInChat(
      collectSkillParameterSubmissionValues(skill, values, touched),
    );
  };

  const isValid = () => {
    return (
      skill.parameters?.every((param) => {
        if (param.required && param.default === undefined) {
          const value = values[param.name];
          if (value === undefined) return false;
          if (typeof value === "string" && value.trim() === "") return false;
          if (
            (param.type === "number" || param.type === "boolean") &&
            touched[param.name] !== true
          ) {
            return false;
          }
        }
        return true;
      }) ?? true
    );
  };

  const renderInput = (param: SkillParameter, index: number) => {
    const localizedParameter = getLocalizedSkillParameterText(skill, param);
    const pathKind = getSkillPathParameterKind(skill, param);
    const commonProps = {
      id: `param-${param.name}`,
      ref: index === 0 ? firstInputRef : undefined,
    };

    if (pathKind) {
      const actions: PathPickerAction[] =
        pathKind === "file-or-folder"
          ? ["file", "folder"]
          : pathKind === "folder"
            ? ["folder"]
            : pathKind === "output-file"
              ? ["save"]
              : ["file"];
      const placeholder =
        pathKind === "folder"
          ? t(
              "skillParameter.folderPlaceholder",
              "Choose a folder, or paste its path",
            )
          : pathKind === "file-or-folder"
            ? t(
                "skillParameter.pathPlaceholder",
                "Choose a file or folder, or paste its path",
              )
            : pathKind === "output-file"
              ? t(
                  "skillParameter.outputPathPlaceholder",
                  "Choose where to save the output",
                )
              : t(
                  "skillParameter.filePlaceholder",
                  "Choose a file, or paste its path",
                );
      return (
        <div
          className={`skill-param-file-control${actions.length > 1 ? " has-multiple-actions" : ""}`}
        >
          <input
            {...commonProps}
            ref={
              index === 0
                ? (firstInputRef as React.RefObject<HTMLInputElement>)
                : undefined
            }
            type="text"
            className="skill-param-input"
            value={String(values[param.name] ?? "")}
            onChange={(e) => handleChange(param.name, e.target.value)}
            placeholder={placeholder || localizedParameter.description}
            title={String(values[param.name] ?? "")}
          />
          <div className="skill-param-picker-actions">
            {actions.map((action) => {
              const isSelecting =
                selectingPathParameter === `${param.name}:${action}`;
              const label =
                action === "folder"
                  ? t("skillParameter.chooseFolder", "Choose folder")
                  : action === "save"
                    ? t("skillParameter.chooseSavePath", "Choose save location")
                    : t("skillParameter.chooseFile", "Choose file");
              const Icon =
                action === "folder"
                  ? FolderOpen
                  : action === "save"
                    ? Save
                    : FileUp;
              return (
                <button
                  key={action}
                  type="button"
                  className="skill-param-file-button"
                  onClick={() => void handleSelectPath(param, action)}
                  disabled={selectingPathParameter !== null}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>
                    {isSelecting
                      ? t("skillParameter.selectingPath", "Selecting…")
                      : label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    switch (param.type) {
      case "select":
        return (
          <select
            {...commonProps}
            ref={
              index === 0
                ? (firstInputRef as React.RefObject<HTMLSelectElement>)
                : undefined
            }
            className="skill-param-select"
            value={String(values[param.name] ?? param.default ?? "")}
            onChange={(e) => handleChange(param.name, e.target.value)}
          >
            {param.options?.map((option, optionIndex) => (
              <option key={option} value={option}>
                {localizedParameter.options?.[optionIndex] || option}
              </option>
            ))}
          </select>
        );

      case "boolean":
        return (
          <label className="skill-param-checkbox">
            <input
              type="checkbox"
              checked={Boolean(values[param.name])}
              onChange={(e) => handleChange(param.name, e.target.checked)}
            />
            <span>{localizedParameter.description}</span>
          </label>
        );

      case "number":
        return (
          <input
            {...commonProps}
            ref={
              index === 0
                ? (firstInputRef as React.RefObject<HTMLInputElement>)
                : undefined
            }
            type="number"
            className="skill-param-input"
            value={Number(values[param.name] ?? param.default ?? 0)}
            onChange={(e) =>
              handleChange(param.name, parseFloat(e.target.value) || 0)
            }
            placeholder={localizedParameter.description}
          />
        );

      case "string":
      default:
        return (
          <input
            {...commonProps}
            ref={
              index === 0
                ? (firstInputRef as React.RefObject<HTMLInputElement>)
                : undefined
            }
            type="text"
            className="skill-param-input"
            value={String(values[param.name] ?? "")}
            onChange={(e) => handleChange(param.name, e.target.value)}
            placeholder={localizedParameter.description}
          />
        );
    }
  };

  const renderParameterFields = () =>
    skill.parameters?.map((param, index) => (
      <div key={param.name} className="skill-param-field">
        {param.type !== "boolean" && (
          <label htmlFor={`param-${param.name}`}>
            {getLocalizedSkillParameterText(skill, param).name}
            {param.required && <span className="required">*</span>}
          </label>
        )}
        {renderInput(param, index)}
        {param.type !== "boolean" &&
          (param.description || getSkillPathParameterKind(skill, param)) && (
            <span className="skill-param-hint">
              {getSkillPathParameterKind(skill, param)
                ? getSkillPathParameterKind(skill, param) === "folder"
                  ? t(
                      "skillParameter.folderPathHint",
                      "Choose a folder, or paste its full path.",
                    )
                  : getSkillPathParameterKind(skill, param) === "file-or-folder"
                    ? t(
                        "skillParameter.anyPathHint",
                        "Choose a file or folder, or paste its full path.",
                      )
                    : getSkillPathParameterKind(skill, param) === "output-file"
                      ? t(
                          "skillParameter.outputPathHint",
                          "Choose the output filename and save location.",
                        )
                      : t(
                          "skillParameter.filePathHint",
                          "Choose a file, or paste its full path.",
                        )
                : getLocalizedSkillParameterText(skill, param).description}
            </span>
          )}
        {pathPickerError === param.name && (
          <span className="skill-param-error" role="alert">
            {t(
              "skillParameter.pathPickerError",
              "Could not select the path. Try again.",
            )}
          </span>
        )}
      </div>
    ));

  return (
    <div className="skill-param-modal-overlay" onClick={onCancel}>
      <div
        className={`skill-param-modal${isPptMaster ? " skill-param-modal--ppt-master" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="skill-param-modal-header">
          <span className="skill-param-modal-icon">{skill.icon}</span>
          <div className="skill-param-modal-title">
            <h3>{localizedSkill.name}</h3>
            <p>{localizedSkill.description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="skill-param-modal-body">
            {isPptMaster ? (
              <>
                <div className="skill-param-master-intro">
                  <Sparkles size={20} aria-hidden="true" />
                  <div>
                    <strong>
                      {isChinese ? "智能默认模式" : "Smart defaults"}
                    </strong>
                    <p>
                      {isChinese
                        ? "直接使用即可。PPT Master 会自动选择高级路线、完整质量模式和演示语言。"
                        : "Use it immediately. PPT Master will choose the advanced route, quality profile, and deck language."}
                    </p>
                    <span>
                      {isChinese
                        ? "自动路由 · 原生可编辑 · 深度质检"
                        : "Automatic routing · Native editing · Deep QA"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`skill-param-advanced-toggle${advancedOpen ? " is-open" : ""}`}
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  <span>
                    <strong>
                      {isChinese
                        ? "高级设置（可选）"
                        : "Advanced settings (optional)"}
                    </strong>
                    <small>
                      {isChinese
                        ? "模板、输出路径、动画和旁白"
                        : "Template, output path, animation, and narration"}
                    </small>
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                {advancedOpen && (
                  <div className="skill-param-advanced-fields">
                    {renderParameterFields()}
                  </div>
                )}
              </>
            ) : (
              renderParameterFields()
            )}
          </div>

          <div className="skill-param-modal-footer">
            <button
              type="button"
              className="button-secondary"
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
            {onAskInChat && !isPptMaster && (
              <button
                type="button"
                className="button-secondary"
                onClick={handleAskInChat}
              >
                {t("skillParameter.askInChat", "Ask In Chat")}
              </button>
            )}
            <button
              type="submit"
              className="button-primary"
              disabled={!isValid()}
            >
              {isPptMaster
                ? isChinese
                  ? "使用 PPT Master"
                  : "Use PPT Master"
                : t("skillParameter.fillDraft", "Fill task draft")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
