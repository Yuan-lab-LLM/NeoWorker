import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { resolveOfficeFontPlan } from "../../utils/office-font-resolver";
import {
  defaultOfficeCliOfficialProfile,
  officeCliProfileFormat,
  type OfficeCliOfficialProfile,
} from "./officecli-official-skills";

export interface OfficeCliContentBlock {
  type: string;
  text: string;
  level?: number;
  items?: string[];
  rows?: string[][];
  language?: string;
}

export interface OfficeCliSheetData {
  name: string;
  data: unknown[][];
  columnWidths?: number[];
  hasHeader?: boolean;
}

export interface OfficeCliSlideContent {
  title: string;
  content?: string[];
  subtitle?: string;
  imagePath?: string;
  layout?: string;
  slideType?: string;
  visualBrief?: string;
  notes?: string;
  data?: {
    categories?: string[];
    series?: Array<{ name?: string; values?: Array<string | number> }>;
    headers?: string[];
    rows?: unknown[][];
    items?: Array<{
      label?: string;
      value?: string | number;
      detail?: string;
    }>;
  };
}

export interface OfficeCliPresentationOptions {
  title?: string;
  author?: string;
  subject?: string;
  themeColor?: string;
  accentColor?: string;
  titleColor?: string;
  audience?: string;
  tone?: string;
  visualMode?: string;
  styleBrief?: string;
  officialProfile?: OfficeCliOfficialProfile;
  generationMode?: "default" | "ppt-master";
  presentationWorkflow?: string;
}

export interface OfficeCliDocumentOptions {
  primaryColor?: string;
  accentColor?: string;
  titleColor?: string;
  templateId?: string;
  title?: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  reportDate?: string;
  subject?: string;
  officialProfile?: OfficeCliOfficialProfile;
}

export interface OfficeCliSpreadsheetOptions {
  primaryColor?: string;
  accentColor?: string;
  titleColor?: string;
  officialProfile?: OfficeCliOfficialProfile;
}

type OfficeCliCommand = {
  command: "add" | "set" | "remove";
  parent?: string;
  path?: string;
  type?: string;
  props?: Record<string, string | number | boolean>;
};

type OfficeCliPayload = {
  success?: boolean;
  message?: string;
  data?: {
    summary?: {
      failed?: number;
    };
  };
};

type OfficeCliResult = {
  stdout: string;
  stderr: string;
};

export type OfficeCliInvoker = (
  executable: string,
  args: string[],
  input?: string,
  signal?: AbortSignal,
) => Promise<OfficeCliResult>;

const OFFICECLI_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_FONT_PLAN = resolveOfficeFontPlan();
const BODY_FONT = DEFAULT_FONT_PLAN.body;
const HEADING_FONT = DEFAULT_FONT_PLAN.heading;
const CJK_FONT = DEFAULT_FONT_PLAN.eastAsia;
const MONOSPACE_FONT = DEFAULT_FONT_PLAN.monospace;
const SERIF_FONT = DEFAULT_FONT_PLAN.serif;

function officeCliBinaryName(): string {
  return process.platform === "win32" ? "officecli.exe" : "officecli";
}

function officeCliBundleKey(): string {
  const osName = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux";
  return `${osName}-${process.arch}`;
}

function executableCandidates(): string[] {
  const binaryName = officeCliBinaryName();
  const resourcesPath = process.resourcesPath;
  const candidates = [
    process.env.NEOWORKER_OFFICECLI_PATH,
    process.env.OFFICECLI_PATH,
    resourcesPath ? path.join(resourcesPath, "officecli", binaryName) : undefined,
    resourcesPath ? path.join(resourcesPath, "app.asar.unpacked", "build", "officecli", officeCliBundleKey(), binaryName) : undefined,
    path.join(process.cwd(), "build", "officecli", officeCliBundleKey(), binaryName),
    path.join(os.homedir(), ".local", "bin", binaryName),
    process.platform === "darwin" ? path.join("/opt/homebrew/bin", binaryName) : undefined,
    process.platform !== "win32" ? path.join("/usr/local/bin", binaryName) : undefined,
    binaryName,
  ].filter((value): value is string => Boolean(value?.trim()));
  return Array.from(new Set(candidates));
}

function defaultInvoker(
  executable: string,
  args: string[],
  input?: string,
  signal?: AbortSignal,
): Promise<OfficeCliResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Office tools operation was cancelled.", "AbortError"));
      return;
    }
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        OFFICECLI_RESIDENT_FLUSH: "each",
      },
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      settle(() => reject(new DOMException("Office tools operation was cancelled.", "AbortError")));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new Error(`OfficeCLI timed out after ${OFFICECLI_TIMEOUT_MS / 1000} seconds.`)));
    }, OFFICECLI_TIMEOUT_MS);

    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    if (!stdoutStream || !stderrStream) {
      child.kill("SIGKILL");
      settle(() => reject(new Error("OfficeCLI output streams were not available.")));
      return;
    }
    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");
    stdoutStream.on("data", (chunk) => {
      stdout += chunk;
    });
    stderrStream.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle(() => reject(error));
    });
    child.on("close", (code) => {
      if (code === 0) {
        settle(() => resolve({ stdout, stderr }));
        return;
      }
      settle(() => reject(
        new Error(
          `OfficeCLI exited with code ${code}: ${stderr.trim() || stdout.trim() || "unknown error"}`,
        ),
      ));
    });
    if (input !== undefined) {
      child.stdin?.end(input, "utf8");
    }
  });
}

function parsePayload(output: string): OfficeCliPayload | null {
  const trimmed = output.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as OfficeCliPayload;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as OfficeCliPayload;
    } catch {
      return null;
    }
  }
}

function normalizeHex(value: string | undefined, fallback: string): string {
  const normalized = String(value || "")
    .trim()
    .replace(/^#/, "")
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function toCsvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toTableData(rows: unknown[][]): string {
  return rows.map((row) => row.map(toCsvCell).join(",")).join(";");
}

function excelColumnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function sanitizeSheetName(name: string, index: number): string {
  const sanitized = String(name || `Sheet${index + 1}`)
    .replace(/[\\/?*\[\]:]/g, " ")
    .trim()
    .slice(0, 31);
  return sanitized || `Sheet${index + 1}`;
}

function inferExcelProps(value: unknown): Record<string, string | number | boolean> {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value, type: "number" };
  }
  if (typeof value === "boolean") {
    return { value: value ? "true" : "false", type: "boolean" };
  }
  if (value instanceof Date) {
    return { value: value.toISOString(), type: "date", numberformat: "yyyy-mm-dd" };
  }
  const text = value === null || value === undefined ? "" : String(value);
  if (text.startsWith("=") && text.length > 1) {
    return { formula: text.slice(1) };
  }
  return { value: text };
}

function slideColors(options: OfficeCliPresentationOptions): {
  primary: string;
  accent: string;
  title: string;
  background: string;
  muted: string;
  dark: string;
} {
  const profile = options.officialProfile || "pptx";
  const primary = normalizeHex(
    options.themeColor,
    profile === "pitch-deck"
      ? "3056D3"
      : profile.startsWith("morph-ppt")
        ? "7157FF"
        : "176B87",
  );
  const accent = normalizeHex(
    options.accentColor,
    profile === "pitch-deck"
      ? "FFB020"
      : profile.startsWith("morph-ppt")
        ? "2DD4BF"
        : "F59E0B",
  );
  const title = normalizeHex(options.titleColor, "172033");
  const mode = options.visualMode || "work";
  if (mode === "premium" || profile === "pitch-deck") {
    return { primary, accent, title: "F8FAFC", background: "0D1321", muted: "A7B0C0", dark: "0D1321" };
  }
  if (mode === "playful") {
    return { primary, accent, title, background: "FFF8F1", muted: "64748B", dark: "172033" };
  }
  return { primary, accent, title, background: "F6F8FB", muted: "657184", dark: "172033" };
}

const PPT_MASTER_COLORS = {
  ink: "101522",
  paper: "F7F3EB",
  white: "FFFDF8",
  cobalt: "3457F1",
  coral: "F46F5E",
  cyan: "53D6C8",
  gold: "F2BF62",
  mist: "E8E3D9",
  muted: "737986",
  mutedOnDark: "AEB8CF",
  hairline: "D8D1C5",
};

const PPT_MASTER_DARK_TYPES = new Set([
  "cover",
  "title",
  "section",
  "chart",
  "quote",
  "closing",
]);

function pptMasterUsesDarkCanvas(type: string, cover: boolean, section: boolean): boolean {
  return cover || section || PPT_MASTER_DARK_TYPES.has(type);
}

function pptMasterTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    metric: "SIGNALS",
    table: "EVIDENCE",
    chart: "MOMENTUM",
    timeline: "SEQUENCE",
    process: "SYSTEM",
    quote: "POINT OF VIEW",
    comparison: "CHOICES",
    product: "PORTFOLIO",
    closing: "DECISION",
    content: "BRIEFING",
  };
  return labels[type] || String(type || "briefing").toUpperCase();
}

function pptMasterText(value: unknown, fallback = ""): string {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

function appendPptMasterSlide(
  commands: OfficeCliCommand[],
  parent: string,
  slide: OfficeCliSlideContent,
  slideNumber: number,
  slideCount: number,
  type: string,
  cover: boolean,
  section: boolean,
): void {
  const content = slide.content || (slide.subtitle ? [slide.subtitle] : []);
  const data = slide.data || {};
  const items = (data.items || []).slice(0, 6);
  const folio = `${String(slideNumber).padStart(2, "0")} / ${String(slideCount).padStart(2, "0")}`;

  if (cover || section) {
    const subtitle = slide.subtitle || content.slice(0, 2).join("  /  ");
    const editionLabel = section ? "SECTION / ADVANCED BRIEF" : "NEOWORKER / ADVANCED EDITORIAL";
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master canvas field",
          x: "9.38in",
          y: "0in",
          width: "3.95in",
          height: "7.5in",
          fill: `#${section ? PPT_MASTER_COLORS.coral : PPT_MASTER_COLORS.cobalt}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master engine mark",
          text: editionLabel,
          x: "0.78in",
          y: "0.62in",
          width: "4.7in",
          height: "0.34in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "9.5pt",
          bold: true,
          color: `#${section ? PPT_MASTER_COLORS.coral : PPT_MASTER_COLORS.cyan}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master title marker",
          x: "0.78in",
          y: section ? "2.04in" : "1.72in",
          width: "0.1in",
          height: section ? "1.52in" : "2.18in",
          fill: `#${PPT_MASTER_COLORS.coral}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master title",
          text: slide.title,
          x: "1.15in",
          y: section ? "2.02in" : "1.68in",
          width: "7.55in",
          height: section ? "1.58in" : "2.25in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: section ? "42pt" : "46pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
          valign: "middle",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master edition numeral",
          text: section ? String(slideNumber).padStart(2, "0") : String(slideCount).padStart(2, "0"),
          x: "9.82in",
          y: section ? "1.58in" : "1.28in",
          width: "2.95in",
          height: "2.3in",
          fill: "none",
          line: "none",
          font: HEADING_FONT,
          size: "88pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          align: "right",
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master edition caption",
          text: section ? "SECTION" : "SLIDES / EDITION 01",
          x: "10.02in",
          y: "4.08in",
          width: "2.62in",
          height: "0.32in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "9pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          align: "right",
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master folio",
          text: folio,
          x: "11.65in",
          y: "6.78in",
          width: "0.9in",
          height: "0.25in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "8pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          align: "right",
          margin: "0in",
        },
      },
    );
    if (subtitle) {
      commands.push({
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master subtitle",
          text: subtitle,
          x: "1.15in",
          y: section ? "4.08in" : "4.38in",
          width: "6.9in",
          height: "1.08in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "20pt",
          color: `#${PPT_MASTER_COLORS.mutedOnDark}`,
          margin: "0in",
        },
      });
    }
    return;
  }

  const darkCanvas = pptMasterUsesDarkCanvas(type, cover, section);
  const titleColor = darkCanvas ? PPT_MASTER_COLORS.white : PPT_MASTER_COLORS.ink;
  const accentColor = type === "chart" ? PPT_MASTER_COLORS.cyan : PPT_MASTER_COLORS.coral;

  commands.push(
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master title marker",
        x: "0.68in",
        y: "0.55in",
        width: "0.09in",
        height: "0.92in",
        fill: `#${accentColor}`,
        line: "none",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master overline",
        text: `${pptMasterTypeLabel(type)}  /  ADVANCED EDITORIAL`,
        x: "0.96in",
        y: "0.46in",
        width: "5.2in",
        height: "0.28in",
        fill: "none",
        line: "none",
        font: MONOSPACE_FONT,
        size: "8.5pt",
        bold: true,
        color: `#${darkCanvas ? PPT_MASTER_COLORS.cyan : PPT_MASTER_COLORS.cobalt}`,
        margin: "0in",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master page title",
        text: slide.title,
        x: "0.96in",
        y: "0.76in",
        width: "10.5in",
        height: "0.94in",
        fill: "none",
        line: "none",
        font: CJK_FONT,
        size: "36pt",
        bold: true,
        color: `#${titleColor}`,
        margin: "0in",
        valign: "middle",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master signature field",
        x: "12.18in",
        y: "0in",
        width: "1.15in",
        height: "1.78in",
        fill: `#${darkCanvas ? PPT_MASTER_COLORS.cobalt : PPT_MASTER_COLORS.ink}`,
        line: "none",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master page folio",
        text: folio,
        x: "12.32in",
        y: "0.68in",
        width: "0.72in",
        height: "0.24in",
        fill: "none",
        line: "none",
        font: MONOSPACE_FONT,
        size: "8pt",
        bold: true,
        color: `#${PPT_MASTER_COLORS.white}`,
        align: "right",
        margin: "0in",
      },
    },
  );

  if (type === "metric" && items.length > 0) {
    const hero = items[0];
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master metric hero",
          x: "0.72in",
          y: "2.02in",
          width: "4.18in",
          height: "4.48in",
          fill: `#${PPT_MASTER_COLORS.ink}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master metric hero value",
          text: pptMasterText(hero.value, "—"),
          x: "1.12in",
          y: "2.72in",
          width: "3.36in",
          height: "1.45in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "58pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master metric hero label",
          text: pptMasterText(hero.label, "关键指标"),
          x: "1.14in",
          y: "4.3in",
          width: "3.28in",
          height: "0.48in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "18pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master metric hero detail",
          text: pptMasterText(hero.detail, "核心信号"),
          x: "1.14in",
          y: "4.9in",
          width: "3.28in",
          height: "0.72in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "13pt",
          color: `#${PPT_MASTER_COLORS.mutedOnDark}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master metric divider",
          x: "4.52in",
          y: "2.42in",
          width: "0.12in",
          height: "0.72in",
          fill: `#${PPT_MASTER_COLORS.coral}`,
          line: "none",
        },
      },
    );
    items.slice(1, 5).forEach((item, itemIndex) => {
      const column = itemIndex % 2;
      const row = Math.floor(itemIndex / 2);
      const x = 5.3 + column * 3.64;
      const y = 2.02 + row * 2.26;
      const cardFill = itemIndex === 0
        ? PPT_MASTER_COLORS.cobalt
        : itemIndex === 3
          ? PPT_MASTER_COLORS.mist
          : PPT_MASTER_COLORS.white;
      const cardText = itemIndex === 0
        ? PPT_MASTER_COLORS.white
        : PPT_MASTER_COLORS.ink;
      commands.push(
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master metric card ${itemIndex + 2}`,
            x: `${x}in`,
            y: `${y}in`,
            width: "3.32in",
            height: "1.98in",
            fill: `#${cardFill}`,
            line: "none",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master metric value ${itemIndex + 2}`,
            text: pptMasterText(item.value, "—"),
            x: `${x + 0.28}in`,
            y: `${y + 0.24}in`,
            width: "2.74in",
            height: "0.72in",
            fill: "none",
            line: "none",
            font: CJK_FONT,
            size: "31pt",
            bold: true,
            color: `#${cardText}`,
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master metric label ${itemIndex + 2}`,
            text: pptMasterText(item.label, "指标"),
            x: `${x + 0.28}in`,
            y: `${y + 1.06}in`,
            width: "2.74in",
            height: "0.38in",
            fill: "none",
            line: "none",
            font: CJK_FONT,
            size: "14pt",
            bold: true,
            color: `#${cardText}`,
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master metric detail ${itemIndex + 2}`,
            text: pptMasterText(item.detail),
            x: `${x + 0.28}in`,
            y: `${y + 1.46}in`,
            width: "2.74in",
            height: "0.32in",
            fill: "none",
            line: "none",
            font: CJK_FONT,
            size: "10.5pt",
            color: `#${itemIndex === 0 ? PPT_MASTER_COLORS.mutedOnDark : PPT_MASTER_COLORS.muted}`,
            margin: "0in",
          },
        },
      );
    });
    return;
  }

  if (type === "table" && (data.rows?.length || 0) > 0) {
    const rowCount = data.rows?.length || 0;
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master evidence rail",
          x: "0.72in",
          y: "2.0in",
          width: "1.32in",
          height: "4.78in",
          fill: `#${PPT_MASTER_COLORS.ink}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master evidence index",
          text: `${String(slideNumber).padStart(2, "0")}\nDATA\n${String(rowCount).padStart(2, "0")} ROWS`,
          x: "0.92in",
          y: "2.36in",
          width: "0.94in",
          height: "2.65in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "13pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master evidence accent",
          x: "0.72in",
          y: "2.0in",
          width: "1.32in",
          height: "0.12in",
          fill: `#${PPT_MASTER_COLORS.coral}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "table",
        props: {
          name: "PPT Master data table",
          data: toTableData([data.headers || [], ...(data.rows || [])]),
          x: "2.28in",
          y: "2.0in",
          width: "10.32in",
          height: "4.78in",
          style: "medium2",
          font: CJK_FONT,
          size: rowCount > 8 ? "12pt" : "15.5pt",
          headerFill: `#${PPT_MASTER_COLORS.cobalt}`,
          headerColor: `#${PPT_MASTER_COLORS.white}`,
          border: `1pt solid #${PPT_MASTER_COLORS.hairline}`,
        },
      },
    );
    return;
  }

  if (type === "chart" && (data.series?.length || 0) > 0) {
    const categories = data.categories || [];
    const series = data.series?.[0];
    const values = (series?.values || []).map((value) => Number(value) || 0).slice(0, 7);
    const maxValue = Math.max(1, ...values.map((value) => Math.abs(value)));
    const maxIndex = values.findIndex((value) => Math.abs(value) === maxValue);
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master chart thesis field",
          x: "0.72in",
          y: "2.03in",
          width: "3.52in",
          height: "4.62in",
          fill: `#${PPT_MASTER_COLORS.cobalt}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master chart thesis",
          text: pptMasterText(series?.name || content[0], "关键趋势"),
          x: "1.1in",
          y: "2.46in",
          width: "2.75in",
          height: "0.72in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "18pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master chart peak",
          text: pptMasterText(values[maxIndex], "—"),
          x: "1.1in",
          y: "3.36in",
          width: "2.75in",
          height: "1.25in",
          fill: "none",
          line: "none",
          font: HEADING_FONT,
          size: "54pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master chart peak label",
          text: `${pptMasterText(categories[maxIndex], "峰值")}  /  PEAK SIGNAL`,
          x: "1.1in",
          y: "4.78in",
          width: "2.75in",
          height: "0.68in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "10pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.cyan}`,
          margin: "0in",
        },
      },
    );
    values.forEach((value, valueIndex) => {
      const y = 2.2 + valueIndex * 0.61;
      const barColor = valueIndex === maxIndex
        ? PPT_MASTER_COLORS.coral
        : valueIndex % 2 === 0
          ? PPT_MASTER_COLORS.cyan
          : PPT_MASTER_COLORS.cobalt;
      commands.push(
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master chart bar ${valueIndex + 1}`,
            x: "6.18in",
            y: `${y}in`,
            width: `${Math.max(0.36, (Math.abs(value) / maxValue) * 5.72)}in`,
            height: "0.3in",
            fill: `#${barColor}`,
            line: "none",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master chart label ${valueIndex + 1}`,
            text: pptMasterText(categories[valueIndex], String(valueIndex + 1)),
            x: "4.62in",
            y: `${y - 0.03}in`,
            width: "1.28in",
            height: "0.32in",
            fill: "none",
            line: "none",
            font: CJK_FONT,
            size: "11.5pt",
            bold: valueIndex === maxIndex,
            color: `#${PPT_MASTER_COLORS.mutedOnDark}`,
            align: "right",
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master chart value ${valueIndex + 1}`,
            text: pptMasterText(value),
            x: "12.08in",
            y: `${y - 0.03}in`,
            width: "0.54in",
            height: "0.32in",
            fill: "none",
            line: "none",
            font: MONOSPACE_FONT,
            size: "10.5pt",
            bold: true,
            color: `#${PPT_MASTER_COLORS.white}`,
            align: "right",
            margin: "0in",
          },
        },
      );
    });
    return;
  }

  if (["timeline", "process"].includes(type)) {
    const steps = items.length > 0
      ? items
      : content.slice(0, 5).map((text, index) => ({ label: `0${index + 1}`, value: text, detail: "" }));
    commands.push({
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master vertical timeline",
        x: "1.48in",
        y: "2.05in",
        width: "0.04in",
        height: "4.4in",
        fill: `#${PPT_MASTER_COLORS.coral}`,
        line: "none",
      },
    });
    steps.slice(0, 5).forEach((item, itemIndex) => {
      const y = 2.03 + itemIndex * 0.88;
      commands.push(
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master timeline index ${itemIndex + 1}`,
            text: String(itemIndex + 1).padStart(2, "0"),
            x: "0.72in",
            y: `${y}in`,
            width: "0.55in",
            height: "0.42in",
            fill: "none",
            line: "none",
            font: MONOSPACE_FONT,
            size: "12pt",
            bold: true,
            color: `#${PPT_MASTER_COLORS.cobalt}`,
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master timeline item ${itemIndex + 1}`,
            text: [item.label, item.value, item.detail].filter(Boolean).join("  /  "),
            x: "1.92in",
            y: `${y - 0.05}in`,
            width: "10.3in",
            height: "0.58in",
            fill: itemIndex % 2 === 0 ? `#${PPT_MASTER_COLORS.white}` : "none",
            line: "none",
            font: CJK_FONT,
            size: "16pt",
            bold: itemIndex === 0,
            color: `#${PPT_MASTER_COLORS.ink}`,
            margin: "0.08in",
          },
        },
      );
    });
    return;
  }

  if (type === "quote") {
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master quote mark",
          text: "“",
          x: "0.62in",
          y: "1.75in",
          width: "1.35in",
          height: "1.5in",
          fill: "none",
          line: "none",
          font: SERIF_FONT,
          size: "92pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.coral}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master quotation",
          text: content[0] || slide.subtitle || slide.title,
          x: "1.95in",
          y: "2.08in",
          width: "9.28in",
          height: "2.95in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "34pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
          valign: "middle",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master quote caption",
          text: pptMasterText(content[1], "POINT OF VIEW / EDITORIAL NOTE"),
          x: "1.98in",
          y: "5.48in",
          width: "7.8in",
          height: "0.42in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "10pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.cyan}`,
          margin: "0in",
        },
      },
    );
    return;
  }

  if (["comparison", "product"].includes(type)) {
    const comparisons = items.length > 0
      ? items
      : content.slice(0, 3).map((text, index) => ({ label: `0${index + 1}`, value: text, detail: "" }));
    const count = Math.max(1, Math.min(comparisons.length, 3));
    const width = (11.9 - (count - 1) * 0.24) / count;
    comparisons.slice(0, count).forEach((item, itemIndex) => {
      const x = 0.7 + itemIndex * (width + 0.24);
      commands.push(
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master comparison band ${itemIndex + 1}`,
            x: `${x}in`,
            y: "2.0in",
            width: `${width}in`,
            height: "0.12in",
            fill: `#${itemIndex === 0 ? PPT_MASTER_COLORS.coral : PPT_MASTER_COLORS.cobalt}`,
            line: "none",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: `PPT Master comparison ${itemIndex + 1}`,
            text: [item.label, item.value, item.detail].filter(Boolean).join("\n\n"),
            x: `${x}in`,
            y: "2.12in",
            width: `${width}in`,
            height: "4.18in",
            fill: itemIndex === 0 ? `#${PPT_MASTER_COLORS.ink}` : `#${PPT_MASTER_COLORS.white}`,
            line: `#${PPT_MASTER_COLORS.hairline}`,
            font: CJK_FONT,
            size: "18pt",
            bold: itemIndex === 0,
            color: itemIndex === 0 ? `#${PPT_MASTER_COLORS.white}` : `#${PPT_MASTER_COLORS.ink}`,
            margin: "0.32in",
            valign: "middle",
          },
        },
      );
    });
    return;
  }

  if (slide.imagePath) {
    commands.push(
      {
        command: "add",
        parent,
        type: "picture",
        props: {
          name: "PPT Master visual",
          src: path.resolve(slide.imagePath),
          x: "6.45in",
          y: "1.95in",
          width: "6.15in",
          height: "4.85in",
          alt: slide.visualBrief || slide.title,
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master visual narrative",
          text: content.slice(0, 5).map((item, index) => `${String(index + 1).padStart(2, "0")}  ${item}`).join("\n\n"),
          x: "0.7in",
          y: "2.0in",
          width: "5.25in",
          height: "4.65in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "17pt",
          color: `#${PPT_MASTER_COLORS.ink}`,
          margin: "0in",
        },
      },
    );
    return;
  }

  if (type === "closing") {
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master closing field",
          x: "8.92in",
          y: "1.78in",
          width: "4.41in",
          height: "5.72in",
          fill: `#${PPT_MASTER_COLORS.coral}`,
          line: "none",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master closing block",
          text: pptMasterText(content[0], slide.title),
          x: "0.96in",
          y: "2.18in",
          width: "7.18in",
          height: "2.38in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "34pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          margin: "0in",
          valign: "middle",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master closing accent",
          text: pptMasterText(content.slice(1, 3).join("\n\n"), "READY FOR DECISION"),
          x: "0.98in",
          y: "4.82in",
          width: "6.8in",
          height: "1.6in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "18pt",
          color: `#${PPT_MASTER_COLORS.mutedOnDark}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: "PPT Master closing numeral",
          text: String(slideCount).padStart(2, "0"),
          x: "9.42in",
          y: "2.55in",
          width: "3.18in",
          height: "1.92in",
          fill: "none",
          line: "none",
          font: HEADING_FONT,
          size: "76pt",
          bold: true,
          color: `#${PPT_MASTER_COLORS.white}`,
          align: "right",
          margin: "0in",
        },
      },
    );
    return;
  }

  const rows = content.slice(0, 6);
  if (rows.length === 0) rows.push(slide.subtitle || slide.title);
  commands.push(
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master narrative field",
        x: "0.72in",
        y: "2.02in",
        width: "4.02in",
        height: "4.58in",
        fill: `#${PPT_MASTER_COLORS.ink}`,
        line: "none",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master narrative index",
        text: "01",
        x: "1.08in",
        y: "2.38in",
        width: "0.76in",
        height: "0.44in",
        fill: "none",
        line: "none",
        font: MONOSPACE_FONT,
        size: "12pt",
        bold: true,
        color: `#${PPT_MASTER_COLORS.coral}`,
        margin: "0in",
      },
    },
    {
      command: "add",
      parent,
      type: "shape",
      props: {
        name: "PPT Master narrative lead",
        text: rows[0],
        x: "1.08in",
        y: "3.02in",
        width: "3.3in",
        height: "2.65in",
        fill: "none",
        line: "none",
        font: CJK_FONT,
        size: "21pt",
        bold: true,
        color: `#${PPT_MASTER_COLORS.white}`,
        margin: "0in",
        valign: "middle",
      },
    },
  );
  const detailRows = rows.slice(1);
  if (detailRows.length === 0) detailRows.push("围绕核心判断展开下一步行动与验证。");
  detailRows.forEach((text, rowIndex) => {
    const y = 2.14 + rowIndex * 0.9;
    commands.push(
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: `PPT Master content index ${rowIndex + 1}`,
          text: String(rowIndex + 2).padStart(2, "0"),
          x: "5.28in",
          y: `${y + 0.02}in`,
          width: "0.55in",
          height: "0.36in",
          fill: "none",
          line: "none",
          font: MONOSPACE_FONT,
          size: "10.5pt",
          bold: true,
          color: `#${rowIndex === 0 ? PPT_MASTER_COLORS.coral : PPT_MASTER_COLORS.cobalt}`,
          margin: "0in",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: `PPT Master content row ${rowIndex + 1}`,
          text,
          x: "6.02in",
          y: `${y}in`,
          width: "6.15in",
          height: "0.58in",
          fill: "none",
          line: "none",
          font: CJK_FONT,
          size: "18pt",
          bold: rowIndex === 0,
          color: `#${PPT_MASTER_COLORS.ink}`,
          margin: "0in",
          valign: "middle",
        },
      },
      {
        command: "add",
        parent,
        type: "shape",
        props: {
          name: `PPT Master content rule ${rowIndex + 1}`,
          x: "6.02in",
          y: `${y + 0.68}in`,
          width: "6.15in",
          height: "0.012in",
          fill: `#${PPT_MASTER_COLORS.hairline}`,
          line: "none",
        },
      },
    );
  });
}

/**
 * Creates new editable Office artifacts through NeoWorker's bundled OfficeCLI.
 * The legacy npm builders remain available for editing and PDF compatibility,
 * but DOCX/XLSX/PPTX creation is deliberately routed through this class.
 */
export class OfficeCliArtifactBuilder {
  private executablePromise?: Promise<string>;

  constructor(
    private readonly invoker: OfficeCliInvoker = defaultInvoker,
    private readonly execution: { signal?: AbortSignal } = {},
  ) {}

  private async resolveExecutable(): Promise<string> {
    this.executablePromise ||= (async () => {
      for (const candidate of executableCandidates()) {
        try {
          await this.invoker(
            candidate,
            ["--version"],
            undefined,
            this.execution.signal,
          );
          return candidate;
        } catch {
          // Try the packaged, development, user, and system candidates in order.
        }
      }
      throw new Error(
        "Office工具不可用，无法创建 Word、Excel 或 PowerPoint。请重新安装 NeoWorker 后重试。",
      );
    })();
    return this.executablePromise;
  }

  private async run(args: string[], input?: string): Promise<OfficeCliPayload | null> {
    const executable = await this.resolveExecutable();
    const result = await this.invoker(executable, args, input, this.execution.signal);
    const payload = parsePayload(result.stdout);
    if (payload?.success === false || (payload?.data?.summary?.failed || 0) > 0) {
      throw new Error(payload?.message || result.stderr.trim() || "OfficeCLI command failed.");
    }
    return payload;
  }

  async loadOfficialSkill(profile: OfficeCliOfficialProfile): Promise<string> {
    const executable = await this.resolveExecutable();
    const result = await this.invoker(
      executable,
      ["load_skill", profile],
      undefined,
      this.execution.signal,
    );
    const instructions = result.stdout.trim();
    if (!instructions) {
      throw new Error(`OfficeCLI 官方规则 ${profile} 加载失败。`);
    }
    return instructions;
  }

  private resolveProfile(
    kind: "docx" | "xlsx" | "pptx",
    requested?: OfficeCliOfficialProfile,
  ): OfficeCliOfficialProfile {
    if (requested && officeCliProfileFormat(requested) === kind) {
      return requested;
    }
    return defaultOfficeCliOfficialProfile(kind);
  }

  private async createBlank(outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await this.run(["create", path.resolve(outputPath), "--locale", "zh-CN", "--force", "--json"]);
  }

  private async applyBatch(outputPath: string, commands: OfficeCliCommand[]): Promise<void> {
    if (commands.length === 0) return;
    await this.run(
      ["batch", path.resolve(outputPath), "--stop-on-error", "--json"],
      JSON.stringify(commands),
    );
  }

  private async close(outputPath: string): Promise<void> {
    await this.run(["close", path.resolve(outputPath), "--json"]);
  }

  async createDocument(
    outputPath: string,
    content: OfficeCliContentBlock[],
    options: OfficeCliDocumentOptions = {},
  ): Promise<void> {
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error("Document content cannot be empty.");
    }
    const officialProfile = this.resolveProfile("docx", options.officialProfile);
    await this.loadOfficialSkill(officialProfile);
    await this.createBlank(outputPath);
    const primary = normalizeHex(
      options.primaryColor,
      options.templateId === "neoworker-docx-business-report"
        ? "1F4E78"
        : officialProfile === "academic-paper"
          ? "34495E"
          : officialProfile === "word-form"
            ? "2563EB"
            : "176B87",
    );
    const accent = normalizeHex(
      options.accentColor,
      options.templateId === "neoworker-docx-business-report"
        ? "2E85C1"
        : "F59E0B",
    );
    const titleColor = normalizeHex(
      options.titleColor,
      options.templateId === "neoworker-docx-business-report"
        ? "173A5E"
        : "172B4D",
    );
    const isBusinessReport =
      options.templateId === "neoworker-docx-business-report" &&
      officialProfile === "word";
    const leadingHeadingIndex = content.findIndex(
      (block) =>
        block.type === "heading" &&
        Math.min(Math.max(block.level || 1, 1), 6) === 1 &&
        String(block.text || "").trim().length > 0,
    );
    const reportTitle =
      String(options.title || "").trim() ||
      (leadingHeadingIndex >= 0
        ? String(content[leadingHeadingIndex].text || "").trim()
        : "专业分析报告");
    const reportSubtitle =
      String(options.subtitle || options.subject || "").trim() ||
      "专业分析与决策参考";
    const reportAuthor = String(options.author || "NeoWorker").trim();
    const reportOrganization = String(options.organization || "NeoWorker").trim();
    const reportDate =
      String(options.reportDate || "").trim() ||
      new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date());
    const reportHeadings = content.filter(
      (block, index) =>
        block.type === "heading" &&
        index !== leadingHeadingIndex &&
        String(block.text || "").trim().length > 0,
    );
    const includeToc = isBusinessReport && reportHeadings.length >= 3;
    const commands: OfficeCliCommand[] = [
      {
        command: "set",
        path: "/document",
        props: {
          title: reportTitle,
          author: reportAuthor,
          subject: String(options.subject || reportSubtitle).trim(),
          description: isBusinessReport
            ? `${reportSubtitle}；由 NeoWorker 专业商务报告模板生成。`
            : "NeoWorker 生成的可编辑文档。",
          updateFields: true,
          "docDefaults.font": BODY_FONT,
          "docDefaults.font.eastAsia": CJK_FONT,
          "docDefaults.fontSize": "11pt",
          "docDefaults.color": "26374A",
          "docDefaults.lineSpacing": "1.45x",
          marginTop: "2.2cm",
          marginBottom: "2.2cm",
          marginLeft: "2.35cm",
          marginRight: "2.35cm",
          "theme.color.accent1": primary,
          "theme.color.accent2": accent,
          "theme.font.major.eastAsia": CJK_FONT,
          "theme.font.minor.eastAsia": CJK_FONT,
          "theme.font.major.latin":
            officialProfile === "academic-paper" ? SERIF_FONT : HEADING_FONT,
          "theme.font.minor.latin": BODY_FONT,
        },
      },
    ];

    if (isBusinessReport) {
      commands.push(
        {
          command: "add",
          parent: "/",
          type: "header",
          props: {
            type: "first",
            text: " ",
            font: BODY_FONT,
            size: "8pt",
            color: `#${primary}`,
          },
        },
        {
          command: "add",
          parent: "/",
          type: "header",
          props: {
            type: "default",
            text: `${reportOrganization} · ${reportTitle}`,
            align: "right",
            font: BODY_FONT,
            size: "8.5pt",
            color: "#718096",
          },
        },
        {
          command: "add",
          parent: "/",
          type: "footer",
          props: {
            type: "first",
            text: " ",
            font: BODY_FONT,
            size: "8pt",
            color: `#${primary}`,
          },
        },
        {
          command: "add",
          parent: "/",
          type: "footer",
          props: {
            type: "default",
            field: "page",
            align: "center",
            font: BODY_FONT,
            size: "9pt",
            color: "#718096",
          },
        },
        {
          command: "add",
          parent: "/body",
          type: "table",
          props: {
            data: toTableData([
              ["NEOWORKER · PROFESSIONAL REPORT"],
              [reportTitle],
              [reportSubtitle],
              [`${reportOrganization} · ${reportAuthor}\n${reportDate}`],
            ]),
            width: "100%",
            layout: "fixed",
            style: "none",
            padding: 220,
            "border.all": "none",
          },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[1]",
          props: { "height.exact": 600, cantSplit: true },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[1]/tc[1]",
          props: {
            fill: `#${primary}`,
            font: BODY_FONT,
            bold: true,
            size: "10pt",
            color: `#${accent}`,
            valign: "center",
            padding: 280,
          },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[2]",
          props: { "height.exact": 2000, cantSplit: true },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[2]/tc[1]",
          props: {
            fill: `#${primary}`,
            font: HEADING_FONT,
            bold: true,
            size: "30pt",
            color: "#FFFFFF",
            valign: "center",
            padding: 280,
          },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[3]",
          props: { "height.exact": 900, cantSplit: true },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[3]/tc[1]",
          props: {
            fill: `#${primary}`,
            font: HEADING_FONT,
            size: "15pt",
            color: "#DCEAF7",
            valign: "center",
            padding: 280,
          },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[4]",
          props: { "height.exact": 6500, cantSplit: true },
        },
        {
          command: "set",
          path: "/body/tbl[1]/tr[4]/tc[1]",
          props: {
            fill: `#${primary}`,
            font: BODY_FONT,
            bold: true,
            size: "10pt",
            color: "#FFFFFF",
            valign: "bottom",
            padding: 280,
          },
        },
      );
      if (includeToc) {
        commands.push({
          command: "add",
          parent: "/body",
          type: "toc",
          props: {
            levels: "1-3",
            title: "目录",
            hyperlinks: true,
            pageNumbers: true,
          },
        });
      }
    }

    let firstHeading = !isBusinessReport;
    let bodyStarted = false;
    for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
      const block = content[blockIndex];
      if (isBusinessReport && blockIndex === leadingHeadingIndex) continue;
      const text = String(block.text || "").trim();
      const listItems =
        block.type === "list"
          ? (block.items || [])
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];
      // List blocks legitimately carry their payload in `items` with no
      // top-level `text`. Treating an empty `text` as an empty block silently
      // dropped every bullet before the list renderer could see it.
      if (!text && block.type !== "table" && listItems.length === 0) continue;
      if (block.type === "heading") {
        const level = Math.min(Math.max(block.level || 1, 1), 6);
        const isTitle = firstHeading && level === 1;
        firstHeading = false;
        commands.push({
          command: "add",
          parent: "/body",
          type: "paragraph",
          props: {
            text,
            style: isTitle ? "Title" : `Heading${level}`,
            font:
              officialProfile === "academic-paper" ? SERIF_FONT : HEADING_FONT,
            "font.ea": CJK_FONT,
            bold: true,
            size: isTitle ? "28pt" : level === 1 ? "21pt" : level === 2 ? "17pt" : "14pt",
            color: level <= 1 ? titleColor : primary,
            spaceBefore: isTitle ? "0pt" : "18pt",
            spaceAfter: isTitle ? "18pt" : "8pt",
            keepNext: true,
            ...(isBusinessReport && !bodyStarted
              ? { pageBreakBefore: true }
              : {}),
            ...(level === 1 && !isTitle ? { "pbdr.bottom": "single;8;#D9E6F2" } : {}),
          },
        });
        bodyStarted = true;
        continue;
      }
      if (block.type === "list") {
        const items = listItems.length
          ? listItems
          : text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        for (const item of items) {
          commands.push({
            command: "add",
            parent: "/body",
            type: "paragraph",
            props: {
              text: item,
              listStyle: "bullet",
              font: BODY_FONT,
              "font.ea": CJK_FONT,
              size: "11pt",
              color: "26374A",
              spaceAfter: "4pt",
              lineSpacing: "1.35x",
              ...(isBusinessReport && !bodyStarted
                ? { pageBreakBefore: true }
                : {}),
            },
          });
          bodyStarted = true;
        }
        continue;
      }
      if (block.type === "table" && block.rows?.length) {
        commands.push({
          command: "add",
          parent: "/body",
          type: "table",
          props: {
            data: toTableData(block.rows),
            width: "100%",
            layout: "fixed",
            style: "medium2",
            padding: 110,
            "border.all": "single;4;D8E1EB",
            caption: text || "Data table",
          },
        });
        bodyStarted = true;
        continue;
      }
      const isCode = block.type === "code";
      commands.push({
        command: "add",
        parent: "/body",
        type: "paragraph",
        props: {
          text,
          style: "Normal",
          font: isCode ? MONOSPACE_FONT : BODY_FONT,
          "font.ea": CJK_FONT,
          size: isCode ? "9.5pt" : "11pt",
          color: isCode ? "334155" : "26374A",
          align: isCode ? "left" : "justify",
          lineSpacing: isCode ? "1.25x" : "1.45x",
          spaceAfter: "9pt",
          ...(isBusinessReport && !bodyStarted
            ? { pageBreakBefore: true }
            : {}),
          ...(isCode
            ? { shd: "F1F5F9", indent: "0.35cm" }
            // Use an absolute two-em indent for 11pt body text. OfficeCLI
            // writes firstLineChars but its quality scanner currently checks
            // the standard firstLineIndent field, so the chars-relative form
            // is incorrectly reported as missing even at the OOXML value 200.
            : { firstLineIndent: "22pt" }),
        },
      });
      bodyStarted = true;
    }
    await this.applyBatch(outputPath, commands);
    await this.close(outputPath);
  }

  async createSpreadsheet(
    outputPath: string,
    sheets: OfficeCliSheetData[],
    options: OfficeCliSpreadsheetOptions = {},
  ): Promise<void> {
    if (!Array.isArray(sheets) || sheets.length === 0) {
      throw new Error("At least one worksheet is required.");
    }
    const officialProfile = this.resolveProfile("xlsx", options.officialProfile);
    await this.loadOfficialSkill(officialProfile);
    await this.createBlank(outputPath);
    const primary = normalizeHex(
      options.primaryColor,
      officialProfile === "financial-model"
        ? "1F4E78"
        : officialProfile === "data-dashboard"
          ? "0F766E"
          : "176B87",
    );
    const titleColor = normalizeHex(options.titleColor, "26374A");
    const sheetNames = sheets.map((sheet, index) => sanitizeSheetName(sheet.name, index));
    const structural: OfficeCliCommand[] = [
      { command: "set", path: "/Sheet1", props: { name: sheetNames[0] } },
    ];
    for (let index = 1; index < sheetNames.length; index += 1) {
      structural.push({ command: "add", parent: "/", type: "sheet", props: { name: sheetNames[index] } });
    }
    await this.applyBatch(outputPath, structural);

    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
      const sheet = sheets[sheetIndex];
      const sheetName = sheetNames[sheetIndex];
      const commands: OfficeCliCommand[] = [];
      const maxColumns = Math.max(0, ...sheet.data.map((row) => row.length));
      for (let rowIndex = 0; rowIndex < sheet.data.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < sheet.data[rowIndex].length; columnIndex += 1) {
          const cellRef = `${excelColumnName(columnIndex)}${rowIndex + 1}`;
          const header = rowIndex === 0 && sheet.hasHeader !== false;
          const banded = rowIndex > 0 && rowIndex % 2 === 0;
          commands.push({
            command: "set",
            path: `/${sheetName}/${cellRef}`,
            props: {
              ...inferExcelProps(sheet.data[rowIndex][columnIndex]),
              "font.name": BODY_FONT,
              "font.bold": header,
              "font.color": header ? "#FFFFFF" : `#${titleColor}`,
              fill: header ? `#${primary}` : banded ? "#F1F6F9" : "#FFFFFF",
              "alignment.vertical": "center",
              "alignment.horizontal": header ? "center" : "left",
              "alignment.wrapText": true,
              "border.bottom": "thin",
              "border.color": header ? `#${primary}` : "#DCE4EC",
            },
          });
        }
      }
      commands.push({
        command: "set",
        path: `/${sheetName}`,
        props: { freeze: sheet.data.length > 1 ? "A2" : "none" },
      });
      for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
        const column = excelColumnName(columnIndex);
        commands.push({
          command: "set",
          path: `/${sheetName}/col[${column}]`,
          props: {
            width: sheet.columnWidths?.[columnIndex] || 18,
            autofit: !sheet.columnWidths?.[columnIndex],
          },
        });
      }
      await this.applyBatch(outputPath, commands);
    }
    await this.close(outputPath);
  }

  async createPresentation(
    outputPath: string,
    slides: OfficeCliSlideContent[],
    options: OfficeCliPresentationOptions = {},
  ): Promise<void> {
    if (!Array.isArray(slides) || slides.length === 0) {
      throw new Error("At least one slide is required.");
    }
    const officialProfile = this.resolveProfile("pptx", options.officialProfile);
    await this.loadOfficialSkill(officialProfile);
    await this.createBlank(outputPath);
    const pptMasterMode = options.generationMode === "ppt-master";
    const colors = slideColors({ ...options, officialProfile });
    const commands: OfficeCliCommand[] = [
      {
        command: "set",
        path: "/presentation",
        props: {
          slideSize: "widescreen",
          title: options.title || slides[0]?.title || "NeoWorker Presentation",
          author: options.author || "NeoWorker",
          subject: pptMasterMode
            ? `PPT Master / Advanced${options.presentationWorkflow ? ` / ${options.presentationWorkflow}` : ""}`
            : options.subject || options.audience || "",
          "theme.color.accent1": pptMasterMode ? PPT_MASTER_COLORS.cobalt : colors.primary,
          "theme.color.accent2": pptMasterMode ? PPT_MASTER_COLORS.coral : colors.accent,
          "theme.font.major.eastAsia": CJK_FONT,
          "theme.font.minor.eastAsia": CJK_FONT,
          "theme.font.major.latin": HEADING_FONT,
          "theme.font.minor.latin": BODY_FONT,
        },
      },
    ];

    slides.forEach((slide, index) => {
      const slideNumber = index + 1;
      const type = slide.slideType || slide.layout || (index === 0 ? "cover" : "content");
      const cover = type === "cover" || type === "title" || index === 0;
      const section = type === "section";
      const background = pptMasterMode
        ? pptMasterUsesDarkCanvas(type, cover, section)
          ? PPT_MASTER_COLORS.ink
          : PPT_MASTER_COLORS.paper
        : cover || section
          ? colors.dark
          : colors.background;
      const foreground = cover || section ? "F8FAFC" : colors.title;
      commands.push({
        command: "add",
        parent: "/",
        type: "slide",
        props: {
          background: `#${background}`,
          transition: pptMasterMode || officialProfile.startsWith("morph-ppt")
            ? "morph"
            : "fade",
          notes: slide.notes || "",
        },
      });
      const parent = `/slide[${slideNumber}]`;
      if (pptMasterMode) {
        appendPptMasterSlide(
          commands,
          parent,
          slide,
          slideNumber,
          slides.length,
          type,
          cover,
          section,
        );
        return;
      }
      if (cover || section) {
        commands.push(
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Accent panel",
              x: "0in",
              y: "0in",
              width: "2.25in",
              height: "7.5in",
              fill: `#${colors.primary}`,
              line: "none",
            },
          },
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Accent line",
              x: "2.25in",
              y: "0in",
              width: "0.12in",
              height: "7.5in",
              fill: `#${colors.accent}`,
              line: "none",
            },
          },
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Title",
              text: slide.title,
              x: "3.0in",
              y: section ? "2.45in" : "1.75in",
              width: "8.8in",
              height: "1.7in",
              fill: "none",
              line: "none",
              font: CJK_FONT,
              size: section ? "36pt" : "40pt",
              bold: true,
              color: `#${foreground}`,
              margin: "0in",
              valign: "middle",
            },
          },
        );
        const subtitle = slide.subtitle || slide.content?.slice(0, 2).join(" · ") || options.styleBrief;
        if (subtitle) {
          commands.push({
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Subtitle",
              text: subtitle,
              x: "3.05in",
              y: section ? "4.2in" : "3.75in",
              width: "7.8in",
              height: "0.8in",
              fill: "none",
              line: "none",
              font: CJK_FONT,
              size: "18pt",
              color: `#${colors.muted}`,
              margin: "0in",
            },
          });
        }
        return;
      }

      commands.push(
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Kicker",
            text: `${
              officialProfile === "pitch-deck"
                ? "INVESTOR STORY"
                : officialProfile.startsWith("morph-ppt")
                  ? "VISUAL STORY"
                  : String(type).toUpperCase()
            }  /  ${String(slideNumber).padStart(2, "0")}`,
            x: "0.75in",
            y: "0.42in",
            width: "3.2in",
            height: "0.3in",
            fill: "none",
            line: "none",
            font: BODY_FONT,
            size: "8pt",
            bold: true,
            color: `#${colors.primary}`,
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Title",
            text: slide.title,
            x: "0.75in",
            y: "0.82in",
            width: "11.4in",
            height: "0.75in",
            fill: "none",
            line: "none",
            font: CJK_FONT,
            size: "36pt",
            bold: true,
            color: `#${foreground}`,
            margin: "0in",
          },
        },
        {
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Accent rule",
            x: "0.75in",
            y: "1.65in",
            width: "1.25in",
            height: "0.06in",
            fill: `#${colors.accent}`,
            line: "none",
          },
        },
      );

      const content = slide.content || (slide.subtitle ? [slide.subtitle] : []);
      const data = slide.data || {};
      const items = (data.items || []).slice(0, 5);
      const hasImage = Boolean(slide.imagePath);

      if (type === "metric" && items.length > 0) {
        const count = Math.min(items.length, 4);
        const cardWidth = (11.75 - (count - 1) * 0.25) / count;
        items.slice(0, count).forEach((item, itemIndex) => {
          const x = 0.75 + itemIndex * (cardWidth + 0.25);
          commands.push({
            command: "add",
            parent,
            type: "shape",
            props: {
              name: `Metric card ${itemIndex + 1}`,
              text: `${item.label || "Metric"}\n${String(item.value ?? "—")}\n${item.detail || ""}`,
              x: `${x}in`,
              y: "2.2in",
              width: `${cardWidth}in`,
              height: "3.55in",
              fill: itemIndex === 0 ? `#${colors.primary}` : "#FFFFFF",
              line: itemIndex === 0 ? "none" : "#D8E1EB",
              geometry: "roundRect",
              font: CJK_FONT,
              size: "22pt",
              bold: true,
              color: itemIndex === 0 ? "#FFFFFF" : `#${colors.dark}`,
              margin: "0.32in",
              valign: "middle",
              align: "center",
            },
          });
        });
      } else if (type === "table" && (data.rows?.length || 0) > 0) {
        const rows = [data.headers || [], ...(data.rows || [])];
        commands.push({
          command: "add",
          parent,
          type: "table",
          props: {
            name: "Data table",
            data: toTableData(rows),
            x: "0.75in",
            y: "2.0in",
            width: "11.85in",
            height: "4.7in",
            style: "medium2",
            font: CJK_FONT,
            size: "18pt",
            headerFill: `#${colors.primary}`,
            headerColor: "#FFFFFF",
            border: "1pt solid #D8E1EB",
          },
        });
      } else if (type === "chart" && (data.series?.length || 0) > 0) {
        const categories = data.categories || [];
        const series = data.series?.[0];
        const values = (series?.values || []).map((value) => Number(value) || 0);
        const maxValue = Math.max(1, ...values.map((value) => Math.abs(value)));
        const count = Math.max(1, values.length);
        const slotWidth = 9.5 / count;
        commands.push({
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Chart insight",
            text: series?.name || content[0] || "Key trend",
            x: "0.8in",
            y: "2.0in",
            width: "2.2in",
            height: "3.9in",
            fill: `#${colors.dark}`,
            line: "none",
            geometry: "roundRect",
            font: CJK_FONT,
            size: "20pt",
            bold: true,
            color: "#FFFFFF",
            margin: "0.3in",
            valign: "middle",
          },
        });
        values.slice(0, 8).forEach((value, valueIndex) => {
          const height = Math.max(0.35, (Math.abs(value) / maxValue) * 3.45);
          const x = 3.35 + valueIndex * slotWidth;
          const y = 5.85 - height;
          commands.push(
            {
              command: "add",
              parent,
              type: "shape",
              props: {
                name: `Chart bar ${valueIndex + 1}`,
                x: `${x}in`,
                y: `${y}in`,
                width: `${Math.max(0.42, slotWidth * 0.62)}in`,
                height: `${height}in`,
                fill: `#${valueIndex % 2 === 0 ? colors.primary : colors.accent}`,
                line: "none",
                geometry: "roundRect",
              },
            },
            {
              command: "add",
              parent,
              type: "shape",
              props: {
                name: `Chart label ${valueIndex + 1}`,
                text: `${categories[valueIndex] || valueIndex + 1}\n${value}`,
                x: `${x - 0.18}in`,
                y: "5.95in",
                width: `${Math.max(0.75, slotWidth)}in`,
                height: "0.62in",
                fill: "none",
                line: "none",
                font: CJK_FONT,
                size: "12pt",
                color: `#${colors.dark}`,
                align: "center",
                margin: "0in",
              },
            },
          );
        });
      } else if (["timeline", "process"].includes(type)) {
        const steps = items.length > 0
          ? items
          : content.slice(0, 5).map((text, stepIndex) => ({
              label: String(stepIndex + 1).padStart(2, "0"),
              value: text,
              detail: "",
            }));
        const count = Math.max(1, Math.min(steps.length, 5));
        commands.push({
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Timeline rail",
            x: "1.2in",
            y: "3.35in",
            width: "10.8in",
            height: "0.08in",
            fill: `#${colors.primary}`,
            line: "none",
          },
        });
        steps.slice(0, count).forEach((item, itemIndex) => {
          const x = 1.05 + itemIndex * (10.75 / Math.max(1, count - 1));
          commands.push(
            {
              command: "add",
              parent,
              type: "shape",
              props: {
                name: `Step ${itemIndex + 1}`,
                text: String(itemIndex + 1),
                x: `${x}in`,
                y: "3.05in",
                width: "0.68in",
                height: "0.68in",
                fill: `#${itemIndex === 0 ? colors.accent : colors.primary}`,
                line: "none",
                geometry: "ellipse",
                font: BODY_FONT,
                size: "16pt",
                bold: true,
                color: "#FFFFFF",
                align: "center",
                valign: "middle",
                margin: "0in",
              },
            },
            {
              command: "add",
              parent,
              type: "shape",
              props: {
                name: `Step detail ${itemIndex + 1}`,
                text: [item.label, item.value, item.detail].filter(Boolean).join("\n"),
                x: `${Math.max(0.6, x - 0.65)}in`,
                y: itemIndex % 2 === 0 ? "1.95in" : "4.0in",
                width: "2.0in",
                height: "1.25in",
                fill: "none",
                line: "none",
                font: CJK_FONT,
                size: "16pt",
                color: `#${colors.dark}`,
                align: "center",
                margin: "0.08in",
              },
            },
          );
        });
      } else if (type === "quote") {
        commands.push(
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Quote mark",
              text: "“",
              x: "0.8in",
              y: "1.7in",
              width: "1.25in",
              height: "1.3in",
              fill: "none",
              line: "none",
              font: SERIF_FONT,
              size: "72pt",
              bold: true,
              color: `#${colors.accent}`,
              margin: "0in",
            },
          },
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Quotation",
              text: content[0] || slide.subtitle || slide.title,
              x: "1.75in",
              y: "2.1in",
              width: "9.8in",
              height: "2.5in",
              fill: "none",
              line: "none",
              font: CJK_FONT,
              size: "28pt",
              bold: true,
              italic: true,
              color: `#${colors.dark}`,
              margin: "0in",
              valign: "middle",
            },
          },
        );
        if (content[1]) {
          commands.push({
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Attribution",
              text: content[1],
              x: "7.3in",
              y: "5.05in",
              width: "4.2in",
              height: "0.5in",
              fill: "none",
              line: "none",
              font: CJK_FONT,
              size: "18pt",
              color: `#${colors.muted}`,
              align: "right",
              margin: "0in",
            },
          });
        }
      } else if (["comparison", "product"].includes(type)) {
        const comparisons = items.length > 0
          ? items
          : content.slice(0, 3).map((text, itemIndex) => ({
              label: `0${itemIndex + 1}`,
              value: text,
              detail: "",
            }));
        const count = Math.max(1, Math.min(comparisons.length, 3));
        const cardWidth = (11.7 - (count - 1) * 0.3) / count;
        comparisons.slice(0, count).forEach((item, itemIndex) => {
          commands.push({
            command: "add",
            parent,
            type: "shape",
            props: {
              name: `Comparison ${itemIndex + 1}`,
              text: [item.label, item.value, item.detail].filter(Boolean).join("\n"),
              x: `${0.75 + itemIndex * (cardWidth + 0.3)}in`,
              y: "2.15in",
              width: `${cardWidth}in`,
              height: "3.85in",
              fill: itemIndex === 0 ? `#${colors.dark}` : "#FFFFFF",
              line: itemIndex === 0 ? "none" : "#D8E1EB",
              geometry: "roundRect",
              font: CJK_FONT,
              size: "19pt",
              bold: itemIndex === 0,
              color: itemIndex === 0 ? "#FFFFFF" : `#${colors.dark}`,
              margin: "0.32in",
              valign: "middle",
            },
          });
        });
      } else if (hasImage && slide.imagePath) {
        commands.push(
          {
            command: "add",
            parent,
            type: "picture",
            props: {
              src: path.resolve(slide.imagePath),
              x: "6.75in",
              y: "1.9in",
              width: "5.85in",
              height: "4.75in",
              alt: slide.visualBrief || slide.title,
            },
          },
          {
            command: "add",
            parent,
            type: "shape",
            props: {
              name: "Image narrative",
              text: content.slice(0, 5).map((item) => `• ${item}`).join("\n"),
              x: "0.75in",
              y: "2.05in",
              width: "5.35in",
              height: "4.2in",
              fill: "none",
              line: "none",
              font: CJK_FONT,
              size: "18pt",
              color: `#${colors.dark}`,
              margin: "0.1in",
              valign: "top",
            },
          },
        );
      } else if (type === "closing") {
        commands.push({
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Closing statement",
            text: content.slice(0, 3).join("\n"),
            x: "2.0in",
            y: "2.05in",
            width: "9.3in",
            height: "3.65in",
            fill: `#${colors.dark}`,
            line: "none",
            geometry: "roundRect",
            font: CJK_FONT,
            size: "20pt",
            bold: true,
            color: "#FFFFFF",
            align: "center",
            valign: "middle",
            margin: "0.3in",
          },
        });
      } else if (content.length <= 3) {
        const cardWidth = content.length > 1 ? 3.75 : 7.8;
        content.slice(0, 3).forEach((item, itemIndex) => {
          commands.push({
            command: "add",
            parent,
            type: "shape",
            props: {
              name: `Content card ${itemIndex + 1}`,
              text: item,
              x: `${0.75 + itemIndex * 4.05}in`,
              y: "2.25in",
              width: `${cardWidth}in`,
              height: "3.35in",
              fill: itemIndex === 0 ? `#${colors.primary}` : "#FFFFFF",
              line: itemIndex === 0 ? "none" : "#D8E1EB",
              geometry: "roundRect",
              font: CJK_FONT,
              size: "18pt",
              bold: itemIndex === 0,
              color: itemIndex === 0 ? "#FFFFFF" : `#${colors.dark}`,
              margin: "0.28in",
              valign: "middle",
            },
          });
        });
      } else {
        commands.push({
          command: "add",
          parent,
          type: "shape",
          props: {
            name: "Content",
            text: content.slice(0, 7).map((item) => `• ${item}`).join("\n"),
            x: "0.9in",
            y: "2.05in",
            width: "11.3in",
            height: "4.45in",
            fill: "#FFFFFF",
            line: "#D8E1EB",
            geometry: "roundRect",
            font: CJK_FONT,
            size: "18pt",
            color: `#${colors.dark}`,
            margin: "0.35in",
            valign: "top",
          },
        });
      }
    });

    await this.applyBatch(outputPath, commands);
    await this.close(outputPath);
  }
}
