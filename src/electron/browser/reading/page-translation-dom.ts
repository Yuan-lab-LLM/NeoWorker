import type { PageTextSegment } from "../../../shared/browser-page-translation";

export type PageDomCommand =
  | { action: "capture"; token: string }
  | { action: "apply"; token: string; segments: PageTextSegment[] }
  | { action: "restore" | "show" | "status"; token?: string };

export interface PageDomResult {
  token?: string;
  status: "idle" | "original" | "translated";
  segments?: PageTextSegment[];
  applied?: number;
  alreadyChinese?: boolean;
  error?: string;
}

/** Runs in an isolated world: the website cannot replace this state or our functions. */
export function pageTranslationDom(command: PageDomCommand): PageDomResult {
  type Entry = { node: Text; original: string; translated?: string };
  type State = {
    token: string;
    url: string;
    entries: Map<number, Entry>;
    status: "original" | "translated";
  };
  const host = globalThis as typeof globalThis & { __neoPageTranslation?: State };
  const url = location.href.split("#")[0];
  let state = host.__neoPageTranslation;
  if (state?.url !== url) state = undefined;
  if (command.action === "capture") {
    if (
      /pdf/i.test(document.contentType) ||
      document.querySelector('embed[type="application/pdf"], pdf-viewer')
    ) {
      return { status: "idle", error: "PDF 暂不支持原位全文翻译，可选中文字使用翻译功能。" };
    }
    if (!document.body) return { status: "idle", error: "页面尚未加载完成，请稍后重试。" };
    // If retrying a partial translation, restore only text still owned by us.
    for (const entry of state?.entries.values() || []) {
      if (
        entry.node.isConnected &&
        entry.translated !== undefined &&
        entry.node.nodeValue === entry.translated
      )
        entry.node.nodeValue = entry.original;
    }
    host.__neoPageTranslation = undefined;
    const entries = new Map<number, Entry>();
    const segments: PageTextSegment[] = [];
    const skip =
      'script,style,noscript,template,pre,code,kbd,samp,textarea,input,select,svg,math,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[hidden],[aria-hidden="true"]';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let characters = 0;
    let han = 0;
    let letters = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const parent = node.parentElement;
      const text = node.nodeValue || "";
      if (!parent || !/\p{L}/u.test(text) || parent.closest(skip) || parent.isContentEditable)
        continue;
      const style = getComputedStyle(parent);
      if (
        style.visibility === "hidden" ||
        style.display === "none" ||
        !parent.getClientRects().length
      )
        continue;
      han += (text.match(/[\u3400-\u9fff]/gu) || []).length;
      letters += (text.match(/\p{L}/gu) || []).length;
      // Already Chinese text stays exactly as authored, including embedded product names.
      const cjk = (text.match(/[\u3400-\u9fff]/gu) || []).length;
      if (cjk && cjk / Math.max(1, (text.match(/\p{L}/gu) || []).length) >= 0.35) continue;
      characters += text.length;
      if (text.length > 12000 || characters > 180000 || entries.size >= 4000) {
        return { status: "idle", error: "当前页面文字过多，暂无法完整翻译；原文已保留。" };
      }
      const id = entries.size;
      entries.set(id, { node, original: text });
      segments.push({ id, text });
    }
    if (han > 0 && han / Math.max(1, letters) >= 0.35) {
      host.__neoPageTranslation = undefined;
      return { status: "idle", alreadyChinese: true, segments: [] };
    }
    if (!segments.length)
      return { status: "idle", error: "没有可翻译的网页文字，请等待正文加载完成。" };
    state = { token: command.token, url, entries, status: "original" };
    host.__neoPageTranslation = state;
    return { status: state.status, token: state.token, segments };
  }
  if (!state || (command.token && state.token !== command.token)) return { status: "idle" };
  if (command.action === "apply") {
    let applied = 0;
    for (const row of command.segments) {
      const entry = state.entries.get(row.id);
      // A live site may replace a paragraph while the model is working. Never overwrite that change.
      if (!entry?.node.isConnected || entry.node.nodeValue !== entry.original) continue;
      const leading = entry.original.match(/^\s*/)?.[0] || "";
      const trailing = entry.original.match(/\s*$/)?.[0] || "";
      entry.translated = leading + row.text.trim() + trailing;
      entry.node.nodeValue = entry.translated;
      applied++;
    }
    state.status = "translated";
    return { status: state.status, token: state.token, applied };
  }
  if (command.action === "restore" || command.action === "show") {
    let applied = 0;
    for (const entry of state.entries.values()) {
      const showing = command.action === "show";
      const expected = showing ? entry.original : entry.translated;
      const next = showing ? entry.translated : entry.original;
      if (
        entry.node.isConnected &&
        expected !== undefined &&
        next !== undefined &&
        entry.node.nodeValue === expected
      ) {
        entry.node.nodeValue = next;
        applied++;
      }
    }
    state.status = command.action === "show" ? "translated" : "original";
    return { status: state.status, token: state.token, applied };
  }
  return { status: state.status, token: state.token };
}

export function pageTranslationScript(command: PageDomCommand): string {
  return `(${pageTranslationDom.toString()})(${JSON.stringify(command)})`;
}
