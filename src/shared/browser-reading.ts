/** Reading assistant data is source material, never executable instructions. */
export const READING_CHANNELS = {
  ask: "browser-reading:ask",
  cancel: "browser-reading:cancel",
  listen: "browser-reading:listen",
  probeSelection: "browser-reading:probe-selection",
  selection: "browser-reading:selection",
} as const;
export type ReadingAction = "ask" | "translate" | "explain";
export interface ReadingRequest {
  requestId: string;
  taskId: string;
  sessionId: string;
  url: string;
  question: string;
  action: ReadingAction;
  selection?: string;
  page?: number;
  history?: { question: string; answer: string }[];
}
export interface ReadingBlock {
  id: string;
  text: string;
  page?: number;
}
export interface ReadingContext {
  url: string;
  title: string;
  scope: "selection" | "webpage" | "pdf-page";
  blocks: ReadingBlock[];
  truncated: boolean;
  totalPages?: number;
}
export interface ReadingAnswer {
  text: string;
  context: ReadingContext;
  model: string;
}
export interface ReadingNote {
  id: string;
  url: string;
  title: string;
  text: string;
  quote?: string;
  page?: number;
  createdAt: number;
}
export function readingUrl(raw: string): string {
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("仅支持 HTTP(S) 网页和 PDF");
  url.hash = "";
  return url.href;
}
export function validateReadingRequest(input: ReadingRequest): ReadingRequest {
  if (!input || typeof input !== "object") throw new Error("无效的阅读请求");
  for (const field of ["requestId", "taskId", "sessionId"] as const) {
    if (
      typeof input[field] !== "string" ||
      !input[field] ||
      input[field].length > 200
    )
      throw new Error("无效的阅读会话");
  }
  if (
    !["ask", "translate", "explain"].includes(input.action) ||
    typeof input.question !== "string" ||
    !input.question.trim() ||
    input.question.length > 4000 ||
    (input.selection !== undefined &&
      (typeof input.selection !== "string" ||
        input.selection.length > 12000)) ||
    (input.page !== undefined &&
      (!Number.isInteger(input.page) || input.page < 1 || input.page > 10000))
  )
    throw new Error("问题、选文或页码超出范围");
  readingUrl(input.url);
  if (
    input.history &&
    (!Array.isArray(input.history) ||
      input.history.length > 4 ||
      input.history.some(
        (h) =>
          typeof h.question !== "string" ||
          typeof h.answer !== "string" ||
          h.question.length > 4000 ||
          h.answer.length > 12000,
      ))
  )
    throw new Error("对话过长，请开始新的提问");
  return input;
}
export function scopeLabel(context: ReadingContext): string {
  if (context.scope === "selection") return "选中段落";
  if (context.scope === "pdf-page")
    return `PDF 第 ${context.blocks[0]?.page || 1} 页 / 共 ${context.totalPages} 页`;
  return context.truncated ? "网页已读取内容（已截取）" : "网页已读取内容";
}

export interface ReadingSelectionEvent {
  text: string;
  x: number;
  y: number;
  pageURL: string;
  frameURL: string;
}

export interface ReadingSelectionRequest {
  taskId: string;
  sessionId: string;
  url: string;
}
export interface ReadingSelection {
  text: string;
  x: number;
  y: number;
}
