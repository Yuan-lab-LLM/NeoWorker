import type { ExecutionMode, TaskDomain } from "../../../shared/types";

export type ComposerModeSelection = "chat" | "auto" | "execute" | "research";

export const COMPOSER_MODE_ORDER: ComposerModeSelection[] = [
  "chat",
  "auto",
  "execute",
  "research",
];

export const COMPOSER_MODE_LABEL: Record<ComposerModeSelection, string> = {
  chat: "Chat",
  auto: "Auto",
  execute: "Execute",
  research: "Research",
};

export const COMPOSER_MODE_HINT: Record<ComposerModeSelection, string> = {
  chat: "Direct answers and web lookups without changing anything",
  auto: "Automatically chooses the best way to handle each request",
  execute: "Forces full task execution with tools",
  research: "Optimizes the task for research and synthesis",
};

export interface ComposerModeState {
  executionMode: ExecutionMode;
  executionModeDirty: boolean;
  taskDomain: TaskDomain;
  taskDomainDirty: boolean;
}

export function deriveComposerModeSelection(
  state: ComposerModeState,
): ComposerModeSelection {
  if (state.executionMode === "chat") {
    return "chat";
  }
  if (state.taskDomainDirty && state.taskDomain === "research") {
    return "research";
  }
  if (
    state.executionModeDirty &&
    state.executionMode === "execute" &&
    state.taskDomain === "auto"
  ) {
    return "execute";
  }
  return "auto";
}

export function resolveComposerModeSelection(
  selection: ComposerModeSelection,
): ComposerModeState {
  switch (selection) {
    case "chat":
      return {
        executionMode: "chat",
        executionModeDirty: true,
        taskDomain: "auto",
        taskDomainDirty: true,
      };
    case "execute":
      return {
        executionMode: "execute",
        executionModeDirty: true,
        taskDomain: "auto",
        taskDomainDirty: true,
      };
    case "research":
      return {
        executionMode: "execute",
        executionModeDirty: false,
        taskDomain: "research",
        taskDomainDirty: true,
      };
    case "auto":
    default:
      return {
        executionMode: "execute",
        executionModeDirty: false,
        taskDomain: "auto",
        taskDomainDirty: false,
      };
  }
}

const CHAT_ACTION_QUESTION_PREFIX =
  /^(?:为什么|为何|怎么(?:样)?|如何|请(?:告诉|解释|说明|分析|介绍)|why\b|how\b|what\b|explain\b|describe\b)/i;

const CHAT_ACTION_REQUEST_MARKERS = [
  /(?:帮我|替我|为我|请你?|直接|马上|现在).{0,24}(?:生成|创建|制作|导出|保存|写入|修改|编辑|删除|重命名|移动|复制|安装|部署|发布|提交|推送|运行|执行|修复|操作)/i,
  /(?:生成|创建|制作|导出|保存|写入|修改|编辑|删除|重命名|移动|复制|安装|部署|发布|提交|推送|运行|执行).{0,32}(?:文件|文档|表格|excel|xlsx|幻灯片|ppt|powerpoint|代码|脚本|命令|终端|仓库|项目|应用|网页|网站)/i,
  /(?:修复|解决).{0,24}(?:bug|错误|故障|问题|代码)/i,
  /(?:运行代码|执行命令|运行脚本|操作电脑|操作应用|打开应用|克隆仓库|提交代码|推送代码)/i,
  /\/(?:schedule|goal|skill|batch|simplify|llm-wiki|onboarding)\b/i,
  /\b(?:please\s+)?(?:create|generate|write|edit|modify|delete|rename|move|copy|save|export|install|deploy|publish|commit|push|run|execute|fix|launch)\b.{0,64}\b(?:file|document|spreadsheet|excel|xlsx|slides?|ppt|powerpoint|code|script|command|terminal|repository|repo|project|app|website|bug|error)\b/i,
  /\b(?:run\s+(?:this\s+)?code|execute\s+(?:this\s+)?command|operate\s+(?:the\s+)?computer|clone\s+(?:the\s+)?repo(?:sitory)?)\b/i,
];

/**
 * Detect requests that cannot be completed inside the deliberately read-only
 * chat surface. Explanatory questions stay in chat; concrete action requests
 * are offered a one-click switch to Execute before anything is sent.
 */
export function shouldSuggestExecuteForChat(prompt: string): boolean {
  const normalized = String(prompt || "").trim();
  if (!normalized) return false;

  const explicitlyDelegated =
    /(?:帮我|替我|为我|请你|直接|马上|现在)/i.test(normalized) ||
    /\bplease\b/i.test(normalized);
  if (CHAT_ACTION_QUESTION_PREFIX.test(normalized) && !explicitlyDelegated) {
    return false;
  }

  return CHAT_ACTION_REQUEST_MARKERS.some((pattern) => pattern.test(normalized));
}
