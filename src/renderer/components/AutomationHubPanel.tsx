import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  FileText,
  History,
} from "lucide-react";
import type { Task } from "../../shared/types";
import {
  ScheduledTasksSettings,
  type ScheduledTaskTemplate,
} from "./ScheduledTasksSettings";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import "./automation-hub.css";
import { translate } from "../i18n/index";

interface AutomationHubPanelProps {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
  focusSection?: "activity" | null;
  onFocusHandled?: () => void;
}

type AutomationTab = "tasks" | "history";
type AutomationHistoryFilter = "all" | "active" | "attention" | "completed";

const ACTIVE_STATUSES = new Set(["pending", "queued", "planning", "executing"]);
const ATTENTION_STATUSES = new Set([
  "blocked",
  "failed",
  "awaiting_approval",
  "needs_user_action",
]);

const SCHEDULED_TASK_TEMPLATES: ScheduledTaskTemplate[] = [
  {
    id: "workspace-morning-map",
    category: translate(
      "generated.components.automationhubpanel.24.0",
      "action",
    ),
    name: translate(
      "generated.components.automationhubpanel.25.1",
      "Workspace morning navigation",
    ),
    description: translate(
      "generated.components.automationhubpanel.26.2",
      "Before starting work, put in a clear order the items that are most worthy of advancement today.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.27.3",
      "Today’s workspace navigation",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.29.4",
      "Read the most recent tasks, conversations, and available materials in the current workspace to generate a guide to starting today: a list of the top 3 things, the first steps for each, factors that might block it, and low-priority items that are recommended to be put on hold. Don’t make up tasks that don’t show up.",
    ),
    schedule: { kind: "cron", expr: "0 8 * * 1-5" },
  },
  {
    id: "weekly-progress-ledger",
    category: translate(
      "generated.components.automationhubpanel.34.5",
      "Review",
    ),
    name: translate(
      "generated.components.automationhubpanel.35.6",
      "Advance account this week",
    ),
    description: translate(
      "generated.components.automationhubpanel.36.7",
      "Consolidate the week's completions, changes, and pending items into a ledger that can move forward.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.37.8",
      "Advance account this week",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.39.9",
      "Based on the tasks, conversations and products of the current workspace in the past week, organize a progress account: completed, changed, still unresolved, waiting for others, and the first step next week. Try to attach corresponding tasks or file clues to each item to avoid writing a vague weekly report.",
    ),
    schedule: { kind: "cron", expr: "0 17 * * 5" },
  },
  {
    id: "milestone-watch",
    category: translate(
      "generated.components.automationhubpanel.44.10",
      "Progress",
    ),
    name: translate(
      "generated.components.automationhubpanel.45.11",
      "Watching key nodes",
    ),
    description: translate(
      "generated.components.automationhubpanel.46.12",
      "Check daily for expiring nodes, long-term stalls, and upcoming missed deliveries.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.47.13",
      "Key node inspection",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.49.14",
      "Check your current workspace for items with deadlines, milestones, or clear commitments, and identify projects that are due soon, are overdue, or have not made progress for an extended period of time. Sort by urgency, and give next steps and suggestions for each item; clearly state when there is no risk.",
    ),
    schedule: { kind: "cron", expr: "0 9 * * 1-5" },
  },
  {
    id: "project-risk-sentinel",
    category: translate(
      "generated.components.automationhubpanel.54.15",
      "risk",
    ),
    name: translate(
      "generated.components.automationhubpanel.55.16",
      "Project Risk Sentinel",
    ),
    description: translate(
      "generated.components.automationhubpanel.56.17",
      "Discover dependencies, resources and decision risks from the latest developments.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.57.18",
      "Project Risk Sentinel",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.59.19",
      "Review recent task status, discussions, and deliverables in the current workspace to identify new or escalated risks. Classify the impact and likelihood of occurrence, describing the evidence, affected matters, recommended actions and who needs to make decisions. Don't turn your guess into a fact without enough evidence.",
    ),
    schedule: { kind: "cron", expr: "0 16 * * 1-5" },
  },
  {
    id: "industry-signal-radar",
    category: translate(
      "generated.components.automationhubpanel.64.20",
      "Insight",
    ),
    name: translate(
      "generated.components.automationhubpanel.65.21",
      "Industry Signal Radar",
    ),
    description: translate(
      "generated.components.automationhubpanel.66.22",
      "Track new changes that are relevant to your work and keep only the signals that really impact decisions.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.67.23",
      "Industry Signal Radar",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.69.24",
      "Retrieve industry changes that occurred in the past 24 hours in conjunction with the current workspace topic. Keep only up to 5 pieces of information that may impact current goals, customers, or decisions; each piece gives the source, what happened, why it is relevant to this workspace, and whether action is required.",
    ),
    schedule: { kind: "cron", expr: "0 9 * * *" },
  },
  {
    id: "meeting-commitment-recovery",
    category: translate(
      "generated.components.automationhubpanel.74.25",
      "collaboration",
    ),
    name: translate(
      "generated.components.automationhubpanel.75.26",
      "Meeting pledges to recycle",
    ),
    description: translate(
      "generated.components.automationhubpanel.76.27",
      "Before leaving get off work, find out what has been promised in the discussion but has not yet been acted upon.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.77.28",
      "Today’s meeting pledges to recycle",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.79.29",
      "Review today's meeting notes, conversations, and tasks in the current workspace to identify clear commitments, pending conclusions, and action items without owners or deadlines. Merge duplicate items and organize them into four columns: person in charge, action, suggested deadline, and source; do not mistake ordinary discussions for commitments.",
    ),
    schedule: { kind: "cron", expr: "0 18 * * 1-5" },
  },
  {
    id: "knowledge-base-increment",
    category: translate(
      "generated.components.automationhubpanel.84.30",
      "knowledge",
    ),
    name: translate(
      "generated.components.automationhubpanel.85.31",
      "Incremental organization of knowledge base",
    ),
    description: translate(
      "generated.components.automationhubpanel.86.32",
      "Add this week's new conclusions to the knowledge base, and mark conflicts and content to be verified.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.87.33",
      "Incremental organization of knowledge base",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.89.34",
      "Sort out the documents, conversation conclusions and key data added this week in the current workspace, and extract knowledge worth retaining for a long time. Classify by topic, point out parts that are duplicated, conflict with existing content, or still need to be verified, and suggest knowledge base files that should be updated; by default, only organization suggestions are generated, and the original files are not directly overwritten.",
    ),
    schedule: { kind: "cron", expr: "0 18 * * 5" },
  },
  {
    id: "monthly-outcome-ledger",
    category: translate(
      "generated.components.automationhubpanel.94.35",
      "Review",
    ),
    name: translate(
      "generated.components.automationhubpanel.95.36",
      "Monthly results ledger",
    ),
    description: translate(
      "generated.components.automationhubpanel.96.37",
      "Inventory results, inputs, and recurring issues by goal.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.97.38",
      "Monthly results ledger",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.99.39",
      "Review the previous natural month in the current workspace: list the delivered results, key evidence, matters with high investment but limited output, recurring problems and actions that should be stopped or strengthened next month by goals. End with 3 measurable adjustments for next month.",
    ),
    schedule: { kind: "cron", expr: "0 10 1 * *" },
  },
  {
    id: "deliverable-quality-gate",
    category: translate(
      "generated.components.automationhubpanel.104.40",
      "quality",
    ),
    name: translate(
      "generated.components.automationhubpanel.105.41",
      "Delivery material inspection",
    ),
    description: translate(
      "generated.components.automationhubpanel.106.42",
      "Periodically check that documents to be delivered are complete, consistent and usable.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.107.43",
      "Quality inspection of content to be delivered",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.109.44",
      "Check the current workspace for recently updated documents, tables, or presentations that may be delivered externally. List issues by completeness, factual consistency, format usability, and action item clarity, distinguishing between required fixes and recommended improvements, with specific file locations. Do not modify files directly without confirmation.",
    ),
    schedule: { kind: "cron", expr: "0 15 * * 1-5" },
  },
  {
    id: "data-anomaly-patrol",
    category: translate(
      "generated.components.automationhubpanel.114.45",
      "data",
    ),
    name: translate(
      "generated.components.automationhubpanel.115.46",
      "Data anomaly inspection",
    ),
    description: translate(
      "generated.components.automationhubpanel.116.47",
      "Find mutations, deletions and caliber inconsistencies from the latest data files.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.117.48",
      "Data anomaly inspection",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.119.49",
      "Check the recently updated data files in the current workspace to identify obvious missing values, duplicate records, abnormal fluctuations, time gaps and changes in field caliber. Output the abnormal location, basis for judgment, potential impact and recommended verification method; retain the original file and do not automatically clean it.",
    ),
    schedule: { kind: "cron", expr: "0 10 * * 1-5" },
  },
  {
    id: "customer-voice-digest",
    category: translate(
      "generated.components.automationhubpanel.124.50",
      "Insight",
    ),
    name: translate(
      "generated.components.automationhubpanel.125.51",
      "Customer voice aggregation",
    ),
    description: translate(
      "generated.components.automationhubpanel.126.52",
      "Digest scattered feedback into high-frequency issues, real demands, and opportunities.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.127.53",
      "Customer voices this week",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.129.54",
      "Summarizes customer feedback, interview transcripts, support questions, and sales notes that have occurred in the current workspace this week. Cluster by topic, distinguish high-frequency complaints, strong demands, positive signals and potential opportunities, retain representative original words and sources, and propose the three most worthy of verification questions next week.",
    ),
    schedule: { kind: "cron", expr: "0 16 * * 5" },
  },
  {
    id: "competitor-change-watch",
    category: translate(
      "generated.components.automationhubpanel.134.55",
      "Insight",
    ),
    name: translate(
      "generated.components.automationhubpanel.135.56",
      "Observation of changes in competing products",
    ),
    description: translate(
      "generated.components.automationhubpanel.136.57",
      "Track the new actions of key competitive products every week and judge whether they are worth responding to.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.137.58",
      "Observation of changes in competing products",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.139.59",
      "Based on the list of competing products mentioned in the current workspace, retrieve their product, pricing, market and organizational changes in the past week. Document only new information from reliable sources that describe the changes, their likely impact, their relationship to our current strategy, and matters that recommend attention but not urgent action.",
    ),
    schedule: { kind: "cron", expr: "0 10 * * 1" },
  },
  {
    id: "content-opportunity-pool",
    category: translate(
      "generated.components.automationhubpanel.144.60",
      "creativity",
    ),
    name: translate(
      "generated.components.automationhubpanel.145.61",
      "Content Opportunity Pool",
    ),
    description: translate(
      "generated.components.automationhubpanel.146.62",
      "Collect topics worth expressing from business developments and external discussions.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.147.63",
      "This week’s content opportunity pool",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.149.64",
      "Come up with 8 content opportunities that can be turned into articles, videos, or shared based on current workspace business developments, customer issues, and recent industry discussions. Each topic includes the target audience, core points, available material clues and why it is worth doing now, and is sorted by value and production cost.",
    ),
    schedule: { kind: "cron", expr: "0 14 * * 2" },
  },
  {
    id: "decision-memory",
    category: translate(
      "generated.components.automationhubpanel.154.65",
      "decision making",
    ),
    name: translate(
      "generated.components.automationhubpanel.155.66",
      "decision memo",
    ),
    description: translate(
      "generated.components.automationhubpanel.156.67",
      "Document decisions, rationales, and reservations that were discussed but easily forgotten.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.157.68",
      "This week’s decision memo",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.159.69",
      'Review the past week\'s discussions and tasks in the current workspace to identify decisions that have been made. Determine the content, background, key basis, objections or reservations, person in charge, and review time for each record; mark content that has not yet been truly finalized as "to be confirmed" and do not make decisions without authorization.',
    ),
    schedule: { kind: "cron", expr: "0 17 * * 3" },
  },
  {
    id: "workspace-file-curator",
    category: translate(
      "generated.components.automationhubpanel.164.70",
      "Organize",
    ),
    name: translate(
      "generated.components.automationhubpanel.165.71",
      "File Archive Manager",
    ),
    description: translate(
      "generated.components.automationhubpanel.166.72",
      "Weekly suggestions for organizing duplicate, expired and scattered files.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.167.73",
      "Workspace file organization suggestions",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.169.74",
      "Scan the file structure and recent changes of the current workspace to find duplicate versions, temporary files, naming inconsistencies, long-term unused content and content suitable for archiving. Output the sorting list, suggested directory and risk description first; do not move or delete any files without confirmation.",
    ),
    schedule: { kind: "cron", expr: "0 18 * * 5" },
  },
  {
    id: "learning-theme-progress",
    category: translate(
      "generated.components.automationhubpanel.174.75",
      "grow",
    ),
    name: translate(
      "generated.components.automationhubpanel.175.76",
      "Study topic promotion",
    ),
    description: translate(
      "generated.components.automationhubpanel.176.77",
      "Choose a topic around your current job and continue to accumulate it instead of randomly learning every day.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.177.78",
      "Study topic promotion",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.179.79",
      "Choose a topic worthy of continued learning from the problems being solved in the current workspace, continue the previous learning progress, and generate a 20-minute learning material: this goal, core concepts, examples from current work, an exercise, and the connection point for next time. Avoid repeating content that has already been covered.",
    ),
    schedule: { kind: "cron", expr: "0 19 * * 2,4" },
  },
  {
    id: "relationship-follow-through",
    category: translate(
      "generated.components.automationhubpanel.184.80",
      "relationship",
    ),
    name: translate(
      "generated.components.automationhubpanel.185.81",
      "relationship maintenance plan",
    ),
    description: translate(
      "generated.components.automationhubpanel.186.82",
      "Remind people who need to thank, sync, or reconnect based on recent collaboration records.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.187.83",
      "Relationship maintenance plan for the week",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.189.84",
      "Based on recent collaboration and communication history in your current workspace, identify people to thank, sync up on, deliver on, or reconnect with this week. Provide a reason for contact and a natural conversation starter; don't infer sensitive relationships or send automated messages.",
    ),
    schedule: { kind: "cron", expr: "0 16 * * 5" },
  },
  {
    id: "weekend-reset-plan",
    category: translate(
      "generated.components.automationhubpanel.194.85",
      "life",
    ),
    name: translate(
      "generated.components.automationhubpanel.195.86",
      "Light restart on weekends",
    ),
    description: translate(
      "generated.components.automationhubpanel.196.87",
      "Tuck in the tail end of this week and make room for rest and work on next week.",
    ),
    taskTitle: translate(
      "generated.components.automationhubpanel.197.88",
      "Light restart on weekends",
    ),
    taskPrompt: translate(
      "generated.components.automationhubpanel.199.89",
      "Generate a lightweight weekend reboot list based on the week's unfinished business in your current workspace: 1-2 things that must be wrapped up, things that you can safely postpone, first steps for next Monday, and no more than 3 living arrangements that will help you regain your energy. Avoid scheduling weekends into new workdays.",
    ),
    schedule: { kind: "cron", expr: "0 18 * * 5" },
  },
];

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp)
    return translate(
      "generated.components.automationhubpanel.205.90",
      "Just now",
    );
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000)
    return translate(
      "generated.components.automationhubpanel.207.91",
      "Just now",
    );
  if (elapsed < 3_600_000)
    return translate("activity.time.minutesAgo", "{count} minutes ago", {
      count: Math.floor(elapsed / 60_000),
    });
  if (elapsed < 86_400_000)
    return translate("activity.time.hoursAgo", "{count} hours ago", {
      count: Math.floor(elapsed / 3_600_000),
    });
  return translate("activity.time.daysAgo", "{count} days ago", {
    count: Math.floor(elapsed / 86_400_000),
  });
}

function isUserAutomationRun(task: Task): boolean {
  if (task.source !== "cron") return false;
  if (task.heartbeatRunId) return false;
  if (/^heartbeat:/i.test(task.title.trim())) return false;
  return Boolean(
    task.agentConfig?.scheduledJobId || /^scheduled:/i.test(task.title.trim()),
  );
}

function getAutomationRunTitle(task: Task): string {
  return (
    task.title.replace(/^scheduled:\s*/i, "").trim() ||
    translate(
      "generated.components.automationhubpanel.221.92",
      "Automate tasks",
    )
  );
}

function getAutomationRunDetail(task: Task): string {
  if (task.terminalStatus === "awaiting_approval")
    return translate(
      "generated.components.automationhubpanel.225.93",
      "Wait for your confirmation before continuing",
    );
  if (task.terminalStatus === "needs_user_action") {
    return translate(
      "generated.components.automationhubpanel.227.94",
      "Additional information is required before continuing",
    );
  }
  if (task.status === "planning" || task.status === "executing") {
    return translate(
      "generated.components.automationhubpanel.230.95",
      "Executing, results will be saved after completion",
    );
  }
  if (task.status === "queued" || task.status === "pending") {
    return translate(
      "generated.components.automationhubpanel.233.96",
      "Entered the queue, waiting for execution",
    );
  }
  if (task.status === "completed")
    return translate(
      "generated.components.automationhubpanel.235.97",
      "Execution successful, results saved",
    );
  if (task.status !== "failed")
    return translate(
      "generated.components.automationhubpanel.236.98",
      "This execution record has been saved",
    );

  const error = String(task.error || "").trim();
  if (/timed out|timeout/i.test(error))
    return translate(
      "generated.components.automationhubpanel.239.99",
      "Execution times out, you can narrow the scope of the task and try again",
    );
  if (/rate limit|too many requests|429/i.test(error)) {
    return translate(
      "generated.components.automationhubpanel.241.100",
      "The model service is busy, please try again later",
    );
  }
  if (/task not found|missing target/i.test(error)) {
    return translate(
      "generated.components.automationhubpanel.244.101",
      "No task required to be performed was found, please check the automation settings",
    );
  }
  if (/permission|unauthorized|forbidden|access denied/i.test(error)) {
    return translate(
      "generated.components.automationhubpanel.247.102",
      "Insufficient permissions, please check workspace or connection permissions",
    );
  }
  return translate(
    "generated.components.automationhubpanel.249.103",
    "This execution was not completed. Open the record to view the reason and try again.",
  );
}

function getAutomationRunStatus(task: Task): {
  label: string;
  tone: "active" | "attention" | "success" | "neutral";
} {
  if (ACTIVE_STATUSES.has(task.status)) {
    return {
      label: translate(
        "generated.components.automationhubpanel.257.104",
        "Running",
      ),
      tone: "active",
    };
  }
  if (
    ATTENTION_STATUSES.has(task.status) ||
    task.terminalStatus === "awaiting_approval" ||
    task.terminalStatus === "needs_user_action"
  ) {
    return {
      label: translate(
        "generated.components.automationhubpanel.264.105",
        "Need to be processed",
      ),
      tone: "attention",
    };
  }
  if (task.status === "completed") {
    return {
      label: translate(
        "generated.components.automationhubpanel.267.106",
        "Completed",
      ),
      tone: "success",
    };
  }
  return {
    label: translate(
      "generated.components.automationhubpanel.269.107",
      "ended",
    ),
    tone: "neutral",
  };
}

function getTaskIcon(task: Task) {
  const title = task.title.toLowerCase();
  if (
    title.includes(
      translate("generated.components.automationhubpanel.274.108", "report"),
    ) ||
    title.includes(
      translate(
        "generated.components.automationhubpanel.274.109",
        "daily newspaper",
      ),
    ) ||
    title.includes(
      translate("generated.components.automationhubpanel.274.110", "Briefing"),
    )
  )
    return FileText;
  return CalendarDays;
}

export function AutomationHubPanel({
  tasks,
  onOpenTask,
  focusSection,
  onFocusHandled,
}: AutomationHubPanelProps) {
  const [activeTab, setActiveTab] = useState<AutomationTab>(
    focusSection === "activity" ? "history" : "tasks",
  );
  const [historyFilter, setHistoryFilter] =
    useState<AutomationHistoryFilter>("all");
  const [showAllActivity, setShowAllActivity] = useState(false);

  const automation = useMemo(() => {
    const sortRecent = (items: Task[]) =>
      [...items].sort(
        (a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt),
      );
    // This page is a receipt for automations created by the user. Internal
    // heartbeat, improvement and orchestration tasks belong in diagnostics,
    // not in the ordinary automation history.
    const all = sortRecent(tasks.filter(isUserAutomationRun));
    const active = all.filter((task) => ACTIVE_STATUSES.has(task.status));
    const attention = sortRecent(
      all.filter(
        (task) =>
          ATTENTION_STATUSES.has(task.status) ||
          task.terminalStatus === "awaiting_approval" ||
          task.terminalStatus === "needs_user_action",
      ),
    );
    const completed = all.filter((task) => task.status === "completed");
    return { all, active, attention, completed };
  }, [tasks]);

  const filteredHistory = automation[historyFilter];
  const historyFilters: Array<{
    id: AutomationHistoryFilter;
    label: string;
    count: number;
  }> = [
    {
      id: "all",
      label: translate(
        "generated.components.automationhubpanel.316.111",
        "All",
      ),
      count: automation.all.length,
    },
    {
      id: "active",
      label: translate(
        "generated.components.automationhubpanel.317.112",
        "Running",
      ),
      count: automation.active.length,
    },
    {
      id: "attention",
      label: translate(
        "generated.components.automationhubpanel.318.113",
        "Need processing",
      ),
      count: automation.attention.length,
    },
    {
      id: "completed",
      label: translate(
        "generated.components.automationhubpanel.319.114",
        "Completed",
      ),
      count: automation.completed.length,
    },
  ];

  const historyEmptyState =
    historyFilter === "active"
      ? {
          title: translate(
            "generated.components.automationhubpanel.325.115",
            "There are currently no automations running",
          ),
          description: translate(
            "generated.components.automationhubpanel.326.116",
            "A new run will appear here after it has started.",
          ),
        }
      : historyFilter === "attention"
        ? {
            title: translate(
              "generated.components.automationhubpanel.330.117",
              "There are currently no runs to process",
            ),
            description: translate(
              "generated.components.automationhubpanel.331.118",
              "Runs that failed or are waiting for your confirmation will be displayed here.",
            ),
          }
        : historyFilter === "completed"
          ? {
              title: translate(
                "generated.components.automationhubpanel.335.119",
                "No completed runs yet",
              ),
              description: translate(
                "generated.components.automationhubpanel.336.120",
                "After the automation executes successfully, the results are saved here.",
              ),
            }
          : {
              title: translate(
                "generated.components.automationhubpanel.339.121",
                "No running records yet",
              ),
              description: translate(
                "generated.components.automationhubpanel.340.122",
                "After creating an automated task, the results of each run will be saved here.",
              ),
            };

  useEffect(() => {
    if (focusSection !== "activity") return;
    setActiveTab("history");
    onFocusHandled?.();
  }, [focusSection, onFocusHandled]);

  const workspaceTabs = [
    {
      id: "tasks" as const,
      label: translate(
        "generated.components.automationhubpanel.352.123",
        "Automate tasks",
      ),
      Icon: CalendarDays,
      count: null,
    },
    {
      id: "history" as const,
      label: translate(
        "generated.components.automationhubpanel.358.124",
        "Operation record",
      ),
      Icon: History,
      count: automation.attention.length || null,
    },
  ];

  return (
    <main className="main-content automation-hub aw2-hub">
      <NeoWorkerPageHeader
        icon={<Clock3 size={20} strokeWidth={1.8} />}
        title={translate(
          "generated.components.automationhubpanel.368.125",
          "Automation",
        )}
        description={translate(
          "generated.components.automationhubpanel.369.126",
          "Let NeoWorker complete repetitive tasks on time and save the results every time.",
        )}
      />

      <div className="aw2-tabbar">
        <nav
          className="aw2-tabs"
          aria-label={translate(
            "generated.components.automationhubpanel.373.127",
            "Automated workbench",
          )}
          role="tablist"
        >
          {workspaceTabs.map((tab, index) => (
            <button
              key={tab.id}
              id={`aw2-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`aw2-tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => {
                const nextIndex =
                  event.key === "ArrowRight"
                    ? (index + 1) % workspaceTabs.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + workspaceTabs.length) %
                        workspaceTabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? workspaceTabs.length - 1
                          : null;
                if (nextIndex === null) return;

                event.preventDefault();
                const nextTab = workspaceTabs[nextIndex];
                setActiveTab(nextTab.id);
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(`#aw2-tab-${nextTab.id}`)
                  ?.focus();
              }}
            >
              <tab.Icon
                className="aw2-tab-icon"
                size={15}
                strokeWidth={1.9}
                aria-hidden="true"
              />
              <span className="aw2-tab-label">{tab.label}</span>
              {tab.count ? (
                <span className="aw2-tab-count">{tab.count}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "tasks" ? (
        <section
          id="aw2-tabpanel-tasks"
          className="aw2-scheduled"
          role="tabpanel"
          aria-labelledby="aw2-tab-tasks"
        >
          <ScheduledTasksSettings
            onOpenTask={onOpenTask}
            embedded
            templates={SCHEDULED_TASK_TEMPLATES}
          />
        </section>
      ) : null}

      {activeTab === "history" ? (
        <section
          id="aw2-tabpanel-history"
          className="aw2-runs"
          role="tabpanel"
          aria-labelledby="aw2-tab-history"
        >
          <div className="aw2-history-heading">
            <div>
              <h2>
                {translate(
                  "generated.components.automationhubpanel.438.128",
                  "Operation record",
                )}
              </h2>
              <p>
                {translate(
                  "generated.components.automationhubpanel.439.129",
                  "The results will be left after each automation execution, making it easy to check whether it is completed and the reason for failure.",
                )}
              </p>
            </div>
            <div className="aw2-history-actions">
              <div
                className="aw2-history-filters"
                role="group"
                aria-label={translate(
                  "generated.components.automationhubpanel.442.130",
                  "Filter running records",
                )}
              >
                {historyFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={historyFilter === filter.id}
                    onClick={() => {
                      setHistoryFilter(filter.id);
                      setShowAllActivity(false);
                    }}
                  >
                    <span>{filter.label}</span>
                    <span className="aw2-history-filter-count">
                      {filter.count}
                    </span>
                  </button>
                ))}
              </div>
              {filteredHistory.length > 5 ? (
                <button
                  type="button"
                  className="aw2-history-expand"
                  onClick={() => setShowAllActivity((value) => !value)}
                >
                  {showAllActivity
                    ? translate(
                        "generated.components.automationhubpanel.464.131",
                        "close",
                      )
                    : translate(
                        "automation.history.viewAll",
                        "View all {count}",
                        { count: filteredHistory.length },
                      )}
                </button>
              ) : (
                <span className="aw2-history-count" aria-live="polite">
                  {filteredHistory.length}{" "}
                  {translate(
                    "generated.components.automationhubpanel.468.132",
                    "Article",
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="aw2-history-body">
            {filteredHistory.length > 0 ? (
              <div className="aw2-history-list">
                {(showAllActivity
                  ? filteredHistory
                  : filteredHistory.slice(0, 5)
                ).map((task) => {
                  const Icon = getTaskIcon(task);
                  const status = getAutomationRunStatus(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      className="aw2-history-row"
                      onClick={() => onOpenTask(task.id)}
                    >
                      <span className={`aw-row-icon ${status.tone}`}>
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="aw-row-copy">
                        <strong>{getAutomationRunTitle(task)}</strong>
                        <small>{getAutomationRunDetail(task)}</small>
                      </span>
                      <span className={`aw2-run-status ${status.tone}`}>
                        {status.label}
                      </span>
                      <time>
                        {formatRelativeTime(task.updatedAt || task.createdAt)}
                      </time>
                      <ArrowRight size={16} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="aw2-history-empty">
                <span className="aw2-history-empty-icon">
                  <Clock3 size={20} aria-hidden="true" />
                </span>
                <h3>{historyEmptyState.title}</h3>
                <p>{historyEmptyState.description}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (historyFilter === "all") {
                      setActiveTab("tasks");
                      return;
                    }
                    setHistoryFilter("all");
                  }}
                >
                  {historyFilter === "all"
                    ? translate(
                        "generated.components.automationhubpanel.517.133",
                        "Create automation",
                      )
                    : translate(
                        "generated.components.automationhubpanel.517.134",
                        "View all records",
                      )}
                </button>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
