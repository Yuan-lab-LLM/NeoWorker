import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlignLeft,
  BarChart2,
  BookOpen,
  Bug,
  Building2,
  Calculator,
  Calendar,
  CheckSquare,
  Clipboard,
  ClipboardList,
  Code2,
  CreditCard,
  Eye,
  FileSearch,
  FileText,
  Filter,
  GitPullRequest,
  Globe,
  Heart,
  Home,
  Image,
  Inbox,
  Layers,
  Lightbulb,
  LineChart,
  List,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  Monitor,
  Music,
  PieChart,
  Receipt,
  RefreshCw,
  Replace,
  Rss,
  Scale,
  Scroll,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { translate, useLanguage } from "../i18n";
import {
  areProductIntegrationsVisible,
  isSkillVisibleForCurrentProductSupport,
} from "../utils/product-availability";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";

type IdeaCategory =
  | "all"
  | "daily-ops"
  | "inbox"
  | "finance"
  | "dev"
  | "research"
  | "writing"
  | "legal"
  | "ai-media"
  | "life";

interface Idea {
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  category: IdeaCategory;
  skill?: string;
  integrations?: string[];
}

const IDEA_PHOTO_COVERS = [
  "/ideas/morning-brief.webp",
  "/ideas/team-planning-illustration.webp",
  "/ideas/meeting-prep.webp",
  "/ideas/data-abstract-illustration.webp",
  "/ideas/creative-desk.webp",
  "/ideas/legal-paper-illustration.webp",
  "/ideas/finance-screen.webp",
  "/ideas/research.webp",
  "/ideas/books.webp",
  "/ideas/development.webp",
  "/ideas/coffee-notes.webp",
  "/ideas/workspace.webp",
  "/ideas/architecture.webp",
  "/ideas/standup.webp",
  "/ideas/analytics.webp",
  "/ideas/writing.webp",
  "/ideas/team.webp",
];

const IDEA_COLLAGE_COVERS: Record<number, string> = {
  17: "/ideas/collage/17-pr-triage.webp",
  18: "/ideas/collage/18-debug-error.webp",
  19: "/ideas/collage/19-security-audit.webp",
  20: "/ideas/collage/20-dev-task-queue.webp",
  21: "/ideas/collage/21-batch-migration.webp",
  22: "/ideas/collage/22-refactor-code.webp",
  23: "/ideas/collage/23-generate-readme.webp",
  24: "/ideas/collage/24-competitive-research.webp",
  25: "/ideas/collage/25-idea-validation.webp",
  26: "/ideas/collage/26-content-monitor.webp",
  27: "/ideas/collage/27-figure-it-out.webp",
  28: "/ideas/collage/28-research-last-days.webp",
  29: "/ideas/collage/29-summarise-document.webp",
  30: "/ideas/collage/30-proofread-polish.webp",
  31: "/ideas/collage/31-translate-content.webp",
  32: "/ideas/collage/32-write-prd.webp",
  33: "/ideas/collage/33-humanise-text.webp",
  34: "/ideas/collage/34-email-marketing.webp",
  35: "/ideas/collage/35-contract-review.webp",
  36: "/ideas/collage/36-demand-letter.webp",
  37: "/ideas/collage/37-legal-research.webp",
  38: "/ideas/collage/38-generate-image.webp",
  39: "/ideas/collage/39-transcribe-media.webp",
  40: "/ideas/collage/40-agentic-image-loop.webp",
  41: "/ideas/collage/41-screenshot-describe.webp",
  42: "/ideas/collage/42-analyse-csv.webp",
  43: "/ideas/collage/43-summarise-folder.webp",
  44: "/ideas/collage/44-restaurant-booking.webp",
  45: "/ideas/collage/45-household-notion.webp",
  46: "/ideas/collage/46-smart-home-plan.webp",
  47: "/ideas/collage/47-spotify-queue.webp",
  48: "/ideas/collage/48-compare-files.webp",
  49: "/ideas/collage/49-research-local.webp",
};

// Use purpose-built covers for selected ideas, while every other later card
// keeps its own unique collage. This prevents repeated image URLs and mixes
// photography, 3D, editorial illustration, watercolor, paper craft, and clay.
const IDEA_COVER_OVERRIDES: Record<number, string> = {
  0: "/ideas/generated/00-morning-brief-sunrise.webp",
  16: "/ideas/generated/16-team-collaboration-documentary.webp",
  18: "/ideas/generated/18-debug-error-cinematic.webp",
  22: "/ideas/generated/22-refactor-code-isometric.webp",
  26: "/ideas/generated/26-content-monitor-editorial.webp",
  28: "/ideas/research-analytics-v2.webp",
  30: "/ideas/generated/30-proofread-watercolor.webp",
  34: "/ideas/generated/34-email-marketing-pop-art.webp",
  35: "/ideas/generated/35-contract-review-paper-cut.webp",
  36: "/ideas/generated/36-demand-letter-still-life.webp",
  37: "/ideas/generated/37-legal-research-library.webp",
  38: "/ideas/generated/38-image-generation-mixed-media.webp",
  39: "/ideas/generated/39-transcribe-neon.webp",
  40: "/ideas/generated/40-agentic-image-loop-glass.webp",
  42: "/ideas/generated/42-analyze-csv-clay.webp",
  44: "/ideas/generated/44-restaurant-booking-photo.webp",
  45: "/ideas/generated/45-household-board-tactile.webp",
  46: "/ideas/generated/46-smart-home-isometric.webp",
  48: "/ideas/generated/48-compare-files-swiss.webp",
};

const IDEA_CATEGORY_FALLBACK_COVERS: Record<IdeaCategory, string> = {
  all: "/ideas/workspace.webp",
  "daily-ops": "/ideas/morning-brief.webp",
  inbox: "/ideas/meeting-prep.webp",
  finance: "/ideas/finance-screen.webp",
  dev: "/ideas/development.webp",
  research: "/ideas/research.webp",
  writing: "/ideas/writing.webp",
  legal: "/ideas/legal-paper-illustration.webp",
  "ai-media": "/ideas/data-abstract-illustration.webp",
  life: "/ideas/coffee-notes.webp",
};

function ideaCoverUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

const CATEGORIES: { id: IdeaCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "daily-ops", label: "Daily Ops" },
  { id: "inbox", label: "Inbox & Comms" },
  { id: "finance", label: "Finance" },
  { id: "dev", label: "Dev" },
  { id: "research", label: "Research" },
  { id: "writing", label: "Writing" },
  { id: "legal", label: "Legal" },
  { id: "ai-media", label: "AI & Media" },
  { id: "life", label: "Life" },
];

const SECTION_LABELS = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
) as Record<IdeaCategory, string>;

function categoryLabel(category: IdeaCategory, fallback: string): string {
  return translate(`ideas.category.${category}`, fallback);
}

function ideaTitle(index: number, fallback: string): string {
  return translate(`ideas.item.${index}.title`, fallback);
}

function ideaDescription(index: number, fallback: string): string {
  return translate(`ideas.item.${index}.description`, fallback);
}

function ideaPrompt(index: number, fallback: string): string {
  return translate(`ideas.item.${index}.prompt`, fallback);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripIdeaSkillInvocation(
  prompt: string,
  skillId?: string,
): string {
  const normalizedPrompt = prompt.trim();
  const normalizedSkillId = skillId?.trim();
  if (!normalizedSkillId) return normalizedPrompt;

  const escapedSkillId = escapeRegExp(normalizedSkillId);
  const invocationPrefixes = [
    new RegExp(`^使用\\s+${escapedSkillId}\\s+技能[。.!]?\\s*`, "i"),
    new RegExp(
      `^Use\\s+(?:the\\s+)?${escapedSkillId}\\s+skill[。.!]?\\s*`,
      "i",
    ),
  ];

  return invocationPrefixes
    .reduce((value, pattern) => value.replace(pattern, ""), normalizedPrompt)
    .trim();
}

// Keep the selected skill as structured composer context. Localized prompt strings still
// include the legacy invocation prefix for compatibility, but it is removed before display.
const IDEAS: Idea[] = [
  // ── Daily Ops ──────────────────────────────────────────────────────
  {
    title: "Morning chief-of-staff brief",
    description:
      "Calendar, inbox priorities, tasks due, and next actions formatted for mobile.",
    prompt:
      "Use the chief-of-staff-briefing skill. Build my morning executive brief from calendar, inbox, and tasks. Include an executive summary (3–6 bullets), calendar risks, inbox priorities, reminders due, and recommended actions in urgency order. Flag any missing signal sources. Format for mobile reading.",
    icon: Clipboard,
    category: "daily-ops",
    skill: "chief-of-staff-briefing",
  },
  {
    title: "Status report for standup",
    description:
      "Concise standup update from recent commits, tasks, and conversations.",
    prompt:
      "Use the twin-status-report skill. Generate a concise standup status report from my recent activity: tasks completed, in-progress work, blockers, and next steps. Keep it tight — 5 bullets max per section.",
    icon: BarChart2,
    category: "daily-ops",
    skill: "twin-status-report",
  },
  {
    title: "Meeting preparation brief",
    description:
      "Structured context, open items, and talking points for an upcoming meeting.",
    prompt:
      "Use the twin-meeting-prep skill. I'll tell you the meeting title and attendees. Prepare a structured brief with: relevant context, open items, key data points, and talking points. Flag any gaps I should fill before the meeting.",
    icon: Calendar,
    category: "daily-ops",
    skill: "twin-meeting-prep",
  },
  {
    title: "Decision preparation package",
    description:
      "Data, options, and trade-off analysis before making a key call.",
    prompt:
      "Use the twin-decision-prep skill. I'll describe the decision I'm facing. Assemble relevant data, enumerate the options with pros/cons, identify risks, and present a recommendation — but don't make the decision for me.",
    icon: Scale,
    category: "daily-ops",
    skill: "twin-decision-prep",
  },
  {
    title: "Family digest draft",
    description:
      "Daily digest of calendar events and tasks you can send to your family.",
    prompt:
      "Use the usecase-family-digest skill. Build a daily digest for tomorrow: calendar events, reminders, and scheduled tasks. Draft it as a short friendly message. STOP before sending and ask me to confirm.",
    icon: Users,
    category: "daily-ops",
    skill: "usecase-family-digest",
    integrations: ["calendar"],
  },

  // ── Inbox & Comms ──────────────────────────────────────────────────
  {
    title: "Full inbox autopilot",
    description:
      "Triage the last 24 h, draft replies, flag cleanup candidates. Stops before sending.",
    prompt:
      "Use the usecase-inbox-manager skill. Run inbox triage for the last 24 h. Classify each message as urgent / today / this-week / no-action. Output: priority table, draft replies for urgent items, cleanup candidates with suggestions. STOP before any action — ask me what to execute.",
    icon: Inbox,
    category: "inbox",
    skill: "usecase-inbox-manager",
    integrations: ["gmail"],
  },
  {
    title: "Draft reply with channel history",
    description:
      "Pull a Slack or messaging thread and produce two polished reply variants.",
    prompt:
      "Use the usecase-draft-reply skill. Use channel_list_chats for channel 'slack' (since '24h', limit 20). Ask me to pick the thread, pull channel_history (limit 80), and draft two crisp reply variants. STOP before sending.",
    icon: MessageSquare,
    category: "inbox",
    skill: "usecase-draft-reply",
    integrations: ["slack"],
  },
  {
    title: "Newsletter digest with follow-ups",
    description:
      "Summarise newsletters from the last 24 h and surface actionable follow-ups.",
    prompt:
      "Use the usecase-newsletter-digest skill. Ask me to pick the newsletter feed. Pull channel_history (limit 150) and produce a digest: title + link + 1–2 sentence summary per item. Propose follow-ups. No external action until I confirm.",
    icon: Rss,
    category: "inbox",
    skill: "usecase-newsletter-digest",
    integrations: ["slack"],
  },
  {
    title: "Transaction scan & fraud triage",
    description:
      "Scan bank notifications for suspicious charges and recommend next steps.",
    prompt:
      "Use the usecase-transaction-scan skill. Scan card/bank email notifications (last 14 days), extract transactions, flag suspicious items (new merchant, repeats, unusual amounts), and recommend next steps. Contact no one without confirmation.",
    icon: CreditCard,
    category: "inbox",
    skill: "usecase-transaction-scan",
    integrations: ["gmail"],
  },

  // ── Finance ────────────────────────────────────────────────────────
  {
    title: "DCF valuation",
    description:
      "WACC, free cash flow projections, terminal value, sensitivity analysis.",
    prompt:
      "Use the dcf-valuation skill. I'll give you a company or financial assumptions. Build a discounted cash flow model with WACC, FCF projections, terminal value, and a sensitivity table. Present enterprise value and equity value per share.",
    icon: Calculator,
    category: "finance",
    skill: "dcf-valuation",
  },
  {
    title: "Stock analysis",
    description:
      "Real-time quotes, fundamentals, technicals, and a buy/hold/sell summary.",
    prompt:
      "Use the stock-analysis skill. Ticker: [enter ticker]. Fetch real-time quote, fundamentals (P/E, EPS, margins), technical indicators, and analyst sentiment. Summarise with a buy / hold / sell recommendation.",
    icon: TrendingUp,
    category: "finance",
    skill: "stock-analysis",
  },
  {
    title: "Earnings analyzer",
    description:
      "Parse earnings reports, flag beats/misses, and extract forward guidance.",
    prompt:
      "Use the earnings-analyzer skill. I'll provide a company and reporting period. Parse the earnings release, compute revenue and EPS beat/miss vs consensus, extract management commentary and forward guidance changes, and flag risks.",
    icon: LineChart,
    category: "finance",
    skill: "earnings-analyzer",
  },
  {
    title: "Portfolio optimizer",
    description:
      "Mean-variance optimisation, Sharpe ratio maximisation, rebalance plan.",
    prompt:
      "Use the portfolio-optimizer skill. I'll share my current holdings and risk tolerance. Run mean-variance optimisation, compute the efficient frontier, and produce a rebalance plan with percentage adjustments.",
    icon: PieChart,
    category: "finance",
    skill: "portfolio-optimizer",
  },
  {
    title: "Market screener",
    description:
      "Screen stocks or crypto against custom criteria and surface top opportunities.",
    prompt:
      "Use the market-screener skill. I'll define the screening criteria (sector, P/E range, momentum, etc.). Screen the market and present the top opportunities in a ranked table with supporting metrics.",
    icon: Filter,
    category: "finance",
    skill: "market-screener",
  },
  {
    title: "Tax optimizer",
    description:
      "Identify deductions, tax-loss harvesting opportunities, and year-end moves.",
    prompt:
      "Use the tax-optimizer skill. I'll describe my income sources, investments, and jurisdiction. Identify the most valuable deductions, tax-loss harvesting opportunities, and recommended year-end moves to minimise my tax liability.",
    icon: Receipt,
    category: "finance",
    skill: "tax-optimizer",
  },
  {
    title: "Startup CFO analysis",
    description:
      "Burn rate, runway, unit economics, and fundraising readiness score.",
    prompt:
      "Use the startup-cfo skill. I'll share my financials or assumptions. Compute burn rate, runway, LTV/CAC, gross margin, and a fundraising readiness score. Highlight the top 3 financial risks and recommended corrections.",
    icon: Building2,
    category: "finance",
    skill: "startup-cfo",
  },

  // ── Dev ────────────────────────────────────────────────────────────
  {
    title: "Code review",
    description:
      "Thorough review for bugs, security issues, style, and improvements.",
    prompt:
      "Use the code-review skill. I'll paste code or point to a file/PR. Review for correctness, security vulnerabilities, performance, and best practices. Produce a severity-labelled report with suggested fixes.",
    icon: Eye,
    category: "dev",
    skill: "code-review",
  },
  {
    title: "PR triage & review queue",
    description:
      "Scan open pull requests, assess risk, and build a prioritised review queue.",
    prompt:
      "Use the twin-pr-triage skill. Scan open PRs for a repo I specify. Assess complexity, risk, and staleness. Produce a prioritised review queue with recommended reviewer and a one-line change summary.",
    icon: GitPullRequest,
    category: "dev",
    skill: "twin-pr-triage",
  },
  {
    title: "Debug error",
    description:
      "Root-cause analysis and minimal fix for any error or unexpected behaviour.",
    prompt:
      "Use the debug-error skill. I'll paste the error message and context. Investigate the root cause and propose a minimal fix pointing to the exact file and line.",
    icon: Bug,
    category: "dev",
    skill: "debug-error",
  },
  {
    title: "Security audit",
    description:
      "Scan code for OWASP top-10, injection, auth flaws, and hardcoded secrets.",
    prompt:
      "Use the security-audit skill. I'll share a codebase path or paste code. Scan for OWASP top-10 vulnerabilities, injection risks, authentication weaknesses, and hardcoded secrets. Produce a severity-ranked report with remediation steps.",
    icon: ShieldCheck,
    category: "dev",
    skill: "security-audit",
  },
  {
    title: "Dev task queue from issues",
    description:
      "Build an agent-ready task queue from open issues with acceptance criteria.",
    prompt:
      "Use the usecase-dev-task-queue skill. I'll specify a repo. Collect open high-priority issues, define acceptance criteria and dependencies, assess risk, and suggest owner. Run up to 8 tasks in parallel. STOP before merge/deploy without my approval.",
    icon: List,
    category: "dev",
    skill: "usecase-dev-task-queue",
  },
  {
    title: "Batch migration across codebase",
    description:
      "Replace a term or pattern across all files with a grouped diff and checklist.",
    prompt:
      "I will specify the old term and new term. Run a batch migration: find all occurrences, group by domain, keep behaviour unchanged. Produce a per-file checklist and diff summary. STOP before applying and show me the full plan first.",
    icon: Replace,
    category: "dev",
  },
  {
    title: "Refactor code",
    description:
      "Improve structure, readability, and maintainability without changing behaviour.",
    prompt:
      "Use the refactor-code skill. I'll point you to code. Identify structural issues, duplication, and readability problems. Produce a refactored version with an explanation of each change. Keep external behaviour identical.",
    icon: Wrench,
    category: "dev",
    skill: "refactor-code",
  },
  {
    title: "Generate README",
    description:
      "Create a professional README from project structure and code.",
    prompt:
      "Use the generate-readme skill. Analyse the project structure, entry points, and key modules. Generate a README with: description, installation, usage examples, API reference, and contribution guide.",
    icon: FileText,
    category: "dev",
    skill: "generate-readme",
  },

  // ── Research ───────────────────────────────────────────────────────
  {
    title: "Competitive research",
    description:
      "Map top competitors, positioning, pricing, strengths, and differentiation gaps.",
    prompt:
      "Use the competitive-research skill. First ask me which product, market, or industry I want to research. Do not start research or infer the market from previous projects until I provide it. Then research the top 3–5 competitors: positioning, features, pricing, strengths, weaknesses, and differentiation gaps.",
    icon: Globe,
    category: "research",
    skill: "competitive-research",
  },
  {
    title: "Idea validation",
    description:
      "Market research, competitor scan, and go/no-go recommendation.",
    prompt:
      "Use the idea-validation skill. I'll describe my idea. Validate it with: market sizing, competitor landscape, key risks, and a go/no-go recommendation with supporting evidence.",
    icon: Lightbulb,
    category: "research",
    skill: "idea-validation",
  },
  {
    title: "Blog & content monitor",
    description:
      "Fetch recent posts from blogs or feeds and surface the most relevant.",
    prompt:
      "Use the blogwatcher skill. I'll give you blogs or feeds to monitor. Fetch recent posts, filter by relevance to topics I specify, and produce a ranked digest with excerpts and action items.",
    icon: Rss,
    category: "research",
    skill: "blogwatcher",
  },
  {
    title: "Figure it out (multi-attempt)",
    description:
      "Resilient problem-solving with fallback strategy and an auditable attempt log.",
    prompt:
      "Use the usecase-figure-it-out-agent skill. I'll describe the goal. Try the direct path first. If it fails, switch methods and keep an attempt log. Up to 3 fallback attempts. STOP before irreversible actions.",
    icon: Zap,
    category: "research",
    skill: "usecase-figure-it-out-agent",
  },
  {
    title: "Research the last N days",
    description:
      "Summarise key developments in a topic over a custom time window.",
    prompt:
      "Use the research-last-days skill. I'll specify the topic and number of days. Search for significant developments, group by sub-theme, and produce a structured summary with citations and a 'what to watch next' section.",
    icon: FileSearch,
    category: "research",
    skill: "research-last-days",
  },

  // ── Writing ────────────────────────────────────────────────────────
  {
    title: "Summarise a document",
    description:
      "Key points, decisions, and action items extracted from any document.",
    prompt:
      "Use the summarize skill. I'll share a file or paste text. Extract key points, decisions, action items, and open questions into a concise structured summary.",
    icon: AlignLeft,
    category: "writing",
    skill: "summarize",
  },
  {
    title: "Proofread & polish",
    description:
      "Fix grammar, clarity, and tone while preserving the author's voice.",
    prompt:
      "Use the proofread skill. I'll paste text. Fix grammar, spelling, punctuation, and awkward phrasing. Improve clarity without changing meaning or style. Show me a diff of changes.",
    icon: CheckSquare,
    category: "writing",
    skill: "proofread",
  },
  {
    title: "Translate content",
    description:
      "High-quality translation preserving tone, idioms, and formatting.",
    prompt:
      "Use the translate skill. I'll paste the text and specify the target language. Translate preserving tone and idioms. Flag culturally sensitive phrases and suggest localised alternatives.",
    icon: Globe,
    category: "writing",
    skill: "translate",
  },
  {
    title: "Write a PRD",
    description:
      "Product requirements document with goals, user stories, and success metrics.",
    prompt:
      "Use the prd skill. I'll describe the product or feature. Write a full PRD: executive summary, problem statement, goals, user stories, functional requirements, and success metrics.",
    icon: ClipboardList,
    category: "writing",
    skill: "prd",
  },
  {
    title: "Humanise AI-generated text",
    description:
      "Rewrite AI output to sound natural, varied, and genuinely human.",
    prompt:
      "Use the humanizer skill. I'll paste AI-generated text. Rewrite it with varied sentence length, natural hedging, and personality — preserve meaning and length.",
    icon: Sparkles,
    category: "writing",
    skill: "humanizer",
  },
  {
    title: "Email marketing bible",
    description:
      "Subject lines, sequences, CTAs, and A/B test plan for an email campaign.",
    prompt:
      "Use the email-marketing-bible skill. I'll describe the product and audience. Generate: positioning, subject line variants, 5-email nurture sequence, CTA copy, and an A/B testing plan.",
    icon: Send,
    category: "writing",
    skill: "email-marketing-bible",
  },

  // ── Legal ──────────────────────────────────────────────────────────
  {
    title: "Contract review & negotiation",
    description:
      "Flag risky clauses, suggest redlines, and rate overall contract risk.",
    prompt:
      "Use the legal-contract-negotiation-review skill. I'll share the contract. Review for risky clauses (indemnification, liability, IP, termination). Suggest redlines, flag missing protections, and produce an overall risk rating with negotiation priorities.",
    icon: Scroll,
    category: "legal",
    skill: "legal-contract-negotiation-review",
  },
  {
    title: "Demand letter draft",
    description:
      "Draft a professional demand letter or respond to one received.",
    prompt:
      "Use the legal-demand-letter-response-draft skill. I'll describe the situation. Draft a formal demand letter (or response) with clear facts, legal basis, specific demand, and deadline. Flag where local legal advice is needed.",
    icon: Mail,
    category: "legal",
    skill: "legal-demand-letter-response-draft",
  },
  {
    title: "Legal research memo",
    description:
      "Verified legal research on a question with citations and uncertainty flags.",
    prompt:
      "Use the legal-verified-research-memo skill. I'll pose a legal question and jurisdiction. Research applicable law and produce a memo with: question, short answer, analysis, citations, and clear uncertainty flags for where an attorney is needed.",
    icon: BookOpen,
    category: "legal",
    skill: "legal-verified-research-memo",
  },

  // ── AI & Media ─────────────────────────────────────────────────────
  {
    title: "Generate an image",
    description: "Create high-quality images from a text prompt using DALL-E.",
    prompt:
      "Use the openai-image-gen skill. I'll describe the image (subject, style, mood, aspect ratio). Generate it and show the result. If it's not right, suggest 3 prompt refinements.",
    icon: Image,
    category: "ai-media",
    skill: "openai-image-gen",
  },
  {
    title: "Transcribe audio or video",
    description:
      "High-accuracy transcription with speaker labels and timestamps.",
    prompt:
      "Use the openai-whisper skill. I'll provide the audio or video file. Transcribe with timestamps and speaker labels. Produce a clean transcript and a summary of key points.",
    icon: Mic,
    category: "ai-media",
    skill: "openai-whisper",
  },
  {
    title: "Agentic image loop",
    description:
      "Iteratively generate and refine images until they match your vision.",
    prompt:
      "Use the agentic-image-loop skill. I'll describe the target image. Generate an initial version, critique and refine iteratively, and keep a log of each iteration with what changed.",
    icon: RefreshCw,
    category: "ai-media",
    skill: "agentic-image-loop",
  },
  {
    title: "Screenshot & describe",
    description:
      "Capture the screen and get an AI description of what's visible.",
    prompt:
      "Use the peekaboo skill. Take a screenshot of the current screen or a window I specify. Describe UI elements, content, and any errors or anomalies in detail. Then answer any specific question I have.",
    icon: Monitor,
    category: "ai-media",
    skill: "peekaboo",
  },
  {
    title: "Analyse a CSV dataset",
    description:
      "Statistical summary, outlier detection, and chart suggestions from any CSV.",
    prompt:
      "Use the analyze-csv skill. I'll share the CSV file. Compute summary statistics, detect outliers and missing values, identify correlations, and suggest the best chart types for the key insights.",
    icon: Layers,
    category: "ai-media",
    skill: "analyze-csv",
  },
  {
    title: "Summarise a folder of files",
    description:
      "Batch-summarise every file in a folder into a structured digest.",
    prompt:
      "Use the summarize-folder skill. I'll point you to a folder. Summarise every file: key points, type, and relevance. Group by topic and produce a master index with links to per-file summaries.",
    icon: FileSearch,
    category: "ai-media",
    skill: "summarize-folder",
  },

  // ── Life ───────────────────────────────────────────────────────────
  {
    title: "Restaurant booking options",
    description:
      "Find openings, cross-check calendar, propose 3 conflict-free slots.",
    prompt:
      "Use the usecase-booking-options skill. I'll give you the restaurant URL and party size. Find openings in the next 14 days between 6:30 pm and 8:30 pm. Cross-check my calendar. Propose the 3 best options. STOP before booking.",
    icon: MapPin,
    category: "life",
    skill: "usecase-booking-options",
    integrations: ["calendar"],
  },
  {
    title: "Household tasks to Notion",
    description:
      "Turn a messy household list into Notion tasks with optional Reminders.",
    prompt:
      "Use the usecase-household-capture skill. I'll give you a list of household tasks. Create a Notion page per task (ask me for database_id). If Apple Reminders is available, also create reminders for due tasks. Return created page URLs and reminder IDs.",
    icon: Home,
    category: "life",
    skill: "usecase-household-capture",
    integrations: ["notion"],
  },
  {
    title: "Smart home dry-run plan",
    description: "Orchestrate smart-home actions with a safety-first dry run.",
    prompt:
      "Use the usecase-smart-home-brain skill. I'll describe what I want (e.g. 'Set evening mode'). Produce a dry-run plan: device, action, expected effect, rollback. Respect quiet hours 22:00–07:00. STOP before any physical state change. If integrations are missing, give me a setup checklist.",
    icon: Lightbulb,
    category: "life",
    skill: "usecase-smart-home-brain",
  },
  {
    title: "Spotify mood queue",
    description: "Queue up a playlist based on your current mood or activity.",
    prompt:
      "Use the spotify-player skill. Ask me for my current mood or activity (e.g. deep work, workout, wind-down). Build a playlist of 15–20 tracks that fits and queue it in Spotify.",
    icon: Music,
    category: "life",
    skill: "spotify-player",
  },
  {
    title: "Compare two files",
    description:
      "Diff any two files and surface meaningful differences with context.",
    prompt:
      "Use the compare-files skill. I'll provide two file paths. Produce a structured diff highlighting added, removed, and changed lines. Group changes by section and summarise the overall scope of differences.",
    icon: Code2,
    category: "life",
    skill: "compare-files",
  },
  {
    title: "Research local options",
    description: "Find local places, services, or events using web search.",
    prompt:
      "Use the local-websearch skill. I'll describe what I'm looking for and my location. Search for the top options nearby, compare by rating, price, and distance, and produce a ranked shortlist with links.",
    icon: Search,
    category: "life",
    skill: "local-websearch",
  },
];

function IntegrationIcon({ name }: { name: string }) {
  const label =
    name === "slack"
      ? "S"
      : name === "gmail"
        ? "G"
        : name === "notion"
          ? "N"
          : name === "calendar"
            ? "C"
            : "•";
  return (
    <span className="dp-idea-icon" data-integration={name} aria-label={name}>
      {label}
    </span>
  );
}

export interface IdeaPromptSelection {
  prompt: string;
  skillId?: string;
  skillLabel?: string;
}

interface IdeasPanelProps {
  onUsePrompt: (selection: IdeaPromptSelection) => void;
}

export function IdeasPanel({ onUsePrompt }: IdeasPanelProps) {
  useLanguage();
  const [activeCategory, setActiveCategory] = useState<IdeaCategory>("all");
  const [query, setQuery] = useState("");
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(() => new Set());

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleIdeas = IDEAS.filter((idea) => {
    const index = IDEAS.indexOf(idea);
    const isSupported =
      !idea.skill ||
      isSkillVisibleForCurrentProductSupport({
        id: idea.skill,
        name: idea.title,
        description: idea.description,
      });
    const hasAvailableIntegrations = areProductIntegrationsVisible(
      idea.integrations,
    );
    const matchesCategory =
      activeCategory === "all" || idea.category === activeCategory;
    const matchesFavorite = !showFavorites || favorites.has(index);
    const matchesQuery =
      !normalizedQuery ||
      [
        ideaTitle(index, idea.title),
        ideaDescription(index, idea.description),
        categoryLabel(idea.category, SECTION_LABELS[idea.category]),
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    return (
      isSupported &&
      hasAvailableIntegrations &&
      matchesCategory &&
      matchesFavorite &&
      matchesQuery
    );
  });

  const toggleFavorite = (index: number) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <main className="ideas-gallery">
      <NeoWorkerPageHeader
        className="ideas-gallery-header"
        title={translate("ideas.title", "Ideas")}
        description={translate(
          "ideas.subtitle",
          "Turn recurring workflows into reusable task starting points.",
        )}
        icon={<Lightbulb size={18} strokeWidth={2} />}
        actions={
          <div className="ideas-gallery-actions">
            <button
              type="button"
              className={`ideas-favorites-button${showFavorites ? " active" : ""}`}
              onClick={() => setShowFavorites((value) => !value)}
              aria-pressed={showFavorites}
            >
              <Heart size={16} fill={showFavorites ? "currentColor" : "none"} />
              {translate("ideas.favorites", "My favorites")}
            </button>
            <label className="ideas-search">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate(
                  "ideas.searchPlaceholder",
                  "Search ideas",
                )}
                aria-label={translate(
                  "ideas.searchPlaceholder",
                  "Search ideas",
                )}
              />
            </label>
          </div>
        }
      />

      <nav
        className="ideas-gallery-categories"
        aria-label={translate("ideas.categories", "Idea categories")}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={activeCategory === cat.id ? "active" : ""}
            onClick={() => setActiveCategory(cat.id)}
            aria-pressed={activeCategory === cat.id}
          >
            {categoryLabel(cat.id, cat.label)}
          </button>
        ))}
      </nav>

      {visibleIdeas.length === 0 ? (
        <div className="ideas-empty-state">
          <h2>{translate("ideas.empty.title", "No matching ideas")}</h2>
          <p>
            {translate(
              "ideas.empty.description",
              "Try another category or search term.",
            )}
          </p>
        </div>
      ) : (
        <section
          className="ideas-gallery-grid"
          aria-label={translate("ideas.gallery", "Idea gallery")}
        >
          {visibleIdeas.map((idea) => {
            const Icon = idea.icon;
            const ideaIndex = IDEAS.indexOf(idea);
            const title = ideaTitle(ideaIndex, idea.title);
            const description = ideaDescription(ideaIndex, idea.description);
            const prompt = ideaPrompt(ideaIndex, idea.prompt);
            const composerPrompt = stripIdeaSkillInvocation(prompt, idea.skill);
            const isFavorite = favorites.has(ideaIndex);
            return (
              <article
                key={ideaIndex}
                className={`ideas-gallery-card${ideaIndex % 5 === 0 ? " is-featured" : ""}`}
                data-idea-category={idea.category}
              >
                <button
                  type="button"
                  className="ideas-card-launch"
                  onClick={() =>
                    onUsePrompt({
                      prompt: composerPrompt,
                      skillId: idea.skill,
                      skillLabel: idea.skill ? title : undefined,
                    })
                  }
                  title={title}
                >
                  <div className="ideas-card-cover">
                    <img
                      src={ideaCoverUrl(
                        IDEA_COVER_OVERRIDES[ideaIndex] ??
                          IDEA_PHOTO_COVERS[ideaIndex] ??
                          IDEA_COLLAGE_COVERS[ideaIndex],
                      )}
                      alt=""
                      loading={ideaIndex < 12 ? "eager" : "lazy"}
                      decoding="async"
                      onError={(event) => {
                        const image = event.currentTarget;
                        if (image.dataset.fallbackApplied === "true") return;
                        image.dataset.fallbackApplied = "true";
                        image.src = ideaCoverUrl(
                          IDEA_CATEGORY_FALLBACK_COVERS[idea.category],
                        );
                      }}
                    />
                    <span className="ideas-card-category">
                      {categoryLabel(
                        idea.category,
                        SECTION_LABELS[idea.category],
                      )}
                    </span>
                  </div>
                  <div className="ideas-card-content">
                    <div className="ideas-card-title-row">
                      <span className="ideas-card-icon">
                        <Icon size={16} />
                      </span>
                      <h2>{title}</h2>
                    </div>
                    <p>{description}</p>
                    <div className="ideas-card-footer">
                      <span>
                        {translate("ideas.readyToStart", "Fill in chat")}
                      </span>
                      {idea.integrations && idea.integrations.length > 0 && (
                        <span
                          className="ideas-card-integrations"
                          aria-hidden="true"
                        >
                          {idea.integrations.slice(0, 3).map((int) => (
                            <IntegrationIcon key={int} name={int} />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className={`ideas-card-favorite${isFavorite ? " active" : ""}`}
                  onClick={() => toggleFavorite(ideaIndex)}
                  aria-label={
                    isFavorite
                      ? translate(
                          "ideas.removeFavorite",
                          "Remove from favorites",
                        )
                      : translate("ideas.addFavorite", "Add to favorites")
                  }
                  aria-pressed={isFavorite}
                >
                  <Heart
                    size={17}
                    fill={isFavorite ? "currentColor" : "none"}
                  />
                </button>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
