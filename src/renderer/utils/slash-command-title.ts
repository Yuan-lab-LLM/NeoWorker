const SLASH_TITLE_MAX_ARG_LENGTH = 72;

const COMMAND_LABELS: Record<string, string> = {
  compact: "Continuation brief",
  cost: "Cost estimate",
  doctor: "Diagnostic",
  goal: "Goal",
  multitask: "Multitask",
  plan: "Plan",
  schedule: "Schedule",
  undo: "Undo plan",
};

const ACRONYMS: Record<string, string> = {
  ai: "AI",
  aia: "AIA",
  api: "API",
  batna: "BATNA",
  clm: "CLM",
  dmca: "DMCA",
  dpa: "DPA",
  dpi: "DPI",
  dpia: "DPIA",
  dsar: "DSAR",
  eu: "EU",
  fre: "FRE",
  fto: "FTO",
  gc: "GC",
  gdpr: "GDPR",
  ip: "IP",
  msa: "MSA",
  nda: "NDA",
  oc: "OC",
  oss: "OSS",
  pi: "PI",
  pia: "PIA",
  qa: "QA",
  saas: "SaaS",
  sla: "SLA",
  sow: "SOW",
  tos: "ToS",
  uk: "UK",
  us: "US",
};

function truncateTitlePart(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function titleCaseWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS[lower]) return ACRONYMS[lower];
  if (/^\d+$/.test(word)) return word;
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

function humanizeCommandName(commandName: string): string {
  const mapped = COMMAND_LABELS[commandName];
  if (mapped) return mapped;

  const words = commandName
    .split("-")
    .filter(Boolean)
    .filter((word) => word.toLowerCase() !== "legal")
    .map(titleCaseWord);

  if (words.length === 0) return commandName;
  return words.join(" ");
}

export function deriveSlashCommandTaskTitle(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const match = /^(?:run\s+)?\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/i.exec(
    trimmed,
  );
  if (!match) return "";

  const commandName = (match[1] || "").toLowerCase();
  const args = (match[2] || "").trim();
  const label = humanizeCommandName(commandName);
  if (!args) return label;
  return `${label}: ${truncateTitlePart(args, SLASH_TITLE_MAX_ARG_LENGTH)}`;
}
