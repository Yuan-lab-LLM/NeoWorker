import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  Activity,
  ArrowUp,
  Camera,
  ClipboardList,
  Database,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FormInput,
  Globe2,
  Maximize2,
  Mic,
  Minimize2,
  Monitor,
  MousePointerClick,
  PencilLine,
  Plus,
  Repeat,
  ScanLine,
  Search,
  Smartphone,
  Square,
  Tablet,
  TerminalSquare,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ImageAttachment,
  Annotation,
  BrowserAnnotationTargetRef,
  BrowserAnnotationTargetResolveResult,
  LLMModelInfo,
  LLMProviderInfo,
  LLMProviderType,
  LLMReasoningEffort,
} from "../../shared/types";
import { useVoiceInput } from "../hooks/useVoiceInput";
import { translate, useLanguage } from "../i18n";
import { getStableBrowserWorkbenchSize } from "../utils/browser-workbench-sizing";
import { ModelDropdown } from "./MainContent";
import {
  ArtifactTurnProgressPanel,
  type SpreadsheetTurnContext,
} from "./ArtifactTurnProgressPanel";
import "./artifact-viewers.css";

type BrowserWorkbenchMode = "sidebar" | "fullscreen";
type BrowserSettingsTab = Any;
type BrowserAnnotationDraft = {
  dataUrl: string;
  sourcePath?: string;
  fullPath?: string;
  width: number;
  height: number;
};
type BrowserCursorState = {
  x: number;
  y: number;
  kind: string;
  label?: string;
  pulse?: boolean;
  at: number;
} | null;
type BrowserWorkbenchTab = {
  id: string;
  url: string;
  title: string;
};
type BrowserViewportOverride = {
  width: number;
  height: number;
  mobile: boolean;
  label: string;
};
type YouTubeAskSource = {
  videoId: string;
  title?: string;
  channel?: string;
  startMs: number;
  endMs?: number;
  text: string;
  url: string;
};
type YouTubeAskState = {
  answer?: string;
  sources?: YouTubeAskSource[];
  suggestedFollowUps?: string[];
  error?: string;
} | null;

type BrowserWorkbenchViewProps = {
  taskId: string;
  sessionId: string;
  initialUrl?: string;
  workspaceId?: string;
  workspacePath?: string;
  mode: BrowserWorkbenchMode;
  onClose: () => void;
  onFullscreen: () => void;
  onExitFullscreen: () => void;
  onStatusChange?: (status: { url?: string; title?: string }) => void;
  onSendMessage?: (
    message: string,
    images?: ImageAttachment[],
  ) => Promise<void>;
  selectedModelLabel?: string;
  selectedModel?: string;
  selectedProvider?: LLMProviderType;
  selectedReasoningEffort?: LLMReasoningEffort;
  availableModels?: LLMModelInfo[];
  availableProviders?: LLMProviderInfo[];
  onModelChange?: (selection: {
    providerType?: LLMProviderType;
    modelKey: string;
    reasoningEffort?: LLMReasoningEffort;
  }) => void;
  onOpenSettings?: (tab?: BrowserSettingsTab) => void;
  turnContext?: SpreadsheetTurnContext | null;
};

const BROWSER_NAVIGATION_PROTOCOLS = new Set(["http:", "https:"]);

function normalizeUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return BROWSER_NAVIGATION_PROTOCOLS.has(parsed.protocol) ? value : "";
    } catch {
      return "";
    }
  }
  if (/^(localhost|127\.0\.0\.1|::1)(?::\d+)?(?:\/|$)/i.test(value)) {
    return `http://${value}`;
  }
  return `https://${value}`;
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url || "Browser";
  }
}

function getExternalBrowserUrl(rawUrl: string): string | null {
  const value = rawUrl.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(value) && !/^https?:\/\//i.test(value))
    return null;
  const normalized = normalizeUrl(value);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function getAnnotationUrlKey(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";
  try {
    const parsed = new URL(normalizeUrl(value));
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value.replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function annotationViewportMatches(
  target: BrowserAnnotationTargetRef,
  size: { width: number; height: number } | null,
): boolean {
  if (!target.viewport || !size) return false;
  return (
    Math.abs(target.viewport.width - size.width) <= 2 &&
    Math.abs(target.viewport.height - size.height) <= 2
  );
}

function getYouTubeVideoId(rawUrl: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(rawUrl));
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    const validId = (value: string | null | undefined) =>
      value && /^[a-zA-Z0-9_-]{11}$/.test(value) ? value : null;
    if (host === "youtu.be") {
      return validId(parsed.pathname.split("/").filter(Boolean)[0]);
    }
    if (
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com"
    ) {
      const watchId = validId(parsed.searchParams.get("v"));
      if (watchId) return watchId;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (
        parts[0] === "embed" ||
        parts[0] === "shorts" ||
        parts[0] === "live"
      ) {
        return validId(parts[1]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function formatYouTubeTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getPartition(workspaceId?: string): string {
  const safe = (workspaceId || "default")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
  return `persist:neoworker-browser-${safe || "default"}`;
}

type BrowserCapability = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  icon: LucideIcon;
  accent: string;
};

// Keep the advanced browser utilities implemented but out of the initial UI.
const SHOW_ADVANCED_BROWSER_ACTIONS = false;
const SHOW_BROWSER_ADDRESS_BAR = true;
const SHOW_BROWSER_VIEWPORT_PRESETS = false;
const SHOW_BROWSER_NEW_TAB_GUIDE = false;

const BROWSER_CAPABILITIES: BrowserCapability[] = [
  {
    id: "research",
    label: "Research a topic",
    hint: "Search, read across sources, summarize",
    prompt:
      "Use the in-app browser to research the latest news on a topic of my choosing. Open the top 5 results, read each page, and summarize the key takeaways with citations. Ask me what topic to research first.",
    icon: Search,
    accent: "#030712",
  },
  {
    id: "extractData",
    label: "Extract data into a sheet",
    hint: "Scrape tables and lists from any page",
    prompt:
      "Open a URL I'll give you in the in-app browser, then extract the main table or list of items into a spreadsheet in this workspace. Ask me for the URL and what fields to capture.",
    icon: FileSpreadsheet,
    accent: "#059669",
  },
  {
    id: "fillForm",
    label: "Fill out a form",
    hint: "Navigate, type, click, submit",
    prompt:
      "Open a form URL I'll provide in the in-app browser and help me fill it in step by step. Ask me which form and what values to enter, then walk through each field.",
    icon: FormInput,
    accent: "#0ea5e9",
  },
  {
    id: "compareSites",
    label: "Compare across sites",
    hint: "Visit several pages, build a comparison",
    prompt:
      "Browse a few sites I'll name and compare them on dimensions I care about (price, features, reviews). Use the in-app browser to visit each, then report back with a structured comparison.",
    icon: ClipboardList,
    accent: "#d97706",
  },
  {
    id: "annotatedScreenshots",
    label: "Capture annotated screenshots",
    hint: "Visit a page, mark the highlights",
    prompt:
      "Open a URL I'll give you in the in-app browser, take a screenshot of the most important section, and save it to this workspace. Ask me what to highlight.",
    icon: PencilLine,
    accent: "#db2777",
  },
  {
    id: "workflow",
    label: "Click through a workflow",
    hint: "Drive multi-step UIs end to end",
    prompt:
      "Walk through a multi-step web workflow I'll describe — clicking buttons, filling fields, and waiting for transitions — using the in-app browser. Confirm each step before moving on.",
    icon: MousePointerClick,
    accent: "#7c3aed",
  },
  {
    id: "responsive",
    label: "Test responsive layouts",
    hint: "Check desktop, tablet, and mobile breakpoints",
    prompt:
      "Use the in-app browser to test my app at desktop, tablet, and mobile viewport sizes. Click through the main flow at each breakpoint, capture screenshots of any layout issues, and summarize what changed.",
    icon: Monitor,
    accent: "#111827",
  },
  {
    id: "watchChanges",
    label: "Watch a page for changes",
    hint: "Re-check on a schedule",
    prompt:
      "Open a page in the in-app browser, capture its current state, and recheck it on a cadence I choose. Tell me when something material changes. Ask me for the URL and what to watch for.",
    icon: Repeat,
    accent: "#030712",
  },
  {
    id: "loginData",
    label: "Pull data behind a login",
    hint: "Use the signed-in browser session",
    prompt:
      "Use the in-app browser (which keeps me logged in) to open a dashboard or service I'll name and pull out the metrics I care about. Ask me for the URL and which numbers to grab.",
    icon: ScanLine,
    accent: "#ea580c",
  },
];

const VIEWPORT_PRESETS = [
  { label: "Desktop", width: 1440, height: 900, mobile: false, icon: Monitor },
  { label: "Tablet", width: 768, height: 1024, mobile: true, icon: Tablet },
  { label: "Mobile", width: 390, height: 844, mobile: true, icon: Smartphone },
] satisfies Array<BrowserViewportOverride & { icon: LucideIcon }>;

const webviewPopupProps = { allowpopups: "true" } as Any;

export function BrowserWorkbenchView({
  taskId,
  sessionId,
  initialUrl,
  workspaceId,
  workspacePath,
  mode,
  onClose,
  onFullscreen,
  onExitFullscreen,
  onStatusChange,
  onSendMessage,
  selectedModelLabel,
  selectedModel,
  selectedProvider,
  selectedReasoningEffort,
  availableModels = [],
  availableProviders = [],
  onModelChange,
  onOpenSettings,
  turnContext,
}: BrowserWorkbenchViewProps) {
  const initialNavigationUrl = normalizeUrl(initialUrl || "");
  useLanguage();
  const t = translate;
  const webviewRef = useRef<Any>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const annotationImageRef = useRef<HTMLImageElement | null>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationDrawingRef = useRef(false);
  const lastAnnotationInspectAtRef = useRef(0);
  const liveAnnotationInspectRequestIdRef = useRef(0);
  const webviewDomReadyRef = useRef(false);
  const registeredWebContentsIdRef = useRef<number | null>(null);
  const activeUrlRef = useRef(initialNavigationUrl);
  const activeTabIdRef = useRef("active");
  const titleRef = useRef("");
  const onStatusChangeRef = useRef(onStatusChange);
  const [urlText, setUrlText] = useState(initialNavigationUrl);
  const [activeUrl, setActiveUrl] = useState(initialNavigationUrl);
  const [title, setTitle] = useState("");
  const [tabs, setTabs] = useState<BrowserWorkbenchTab[]>(() => [
    {
      id: "active",
      url: initialNavigationUrl,
      title: "",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState("active");
  const [isLoading, setIsLoading] = useState(false);
  const [webviewSize, setWebviewSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [controlledViewport, setControlledViewport] =
    useState<BrowserViewportOverride | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [toolbarNotice, setToolbarNotice] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [annotationDraft, setAnnotationDraft] =
    useState<BrowserAnnotationDraft | null>(null);
  const [annotationMessage, setAnnotationMessage] = useState("");
  const [annotationSaving, setAnnotationSaving] = useState(false);
  const [annotationError, setAnnotationError] = useState("");
  const [liveAnnotationMode, setLiveAnnotationMode] = useState(false);
  const [liveAnnotationHover, setLiveAnnotationHover] =
    useState<BrowserAnnotationTargetRef | null>(null);
  const [liveAnnotationTarget, setLiveAnnotationTarget] =
    useState<BrowserAnnotationTargetRef | null>(null);
  const [liveAnnotationText, setLiveAnnotationText] = useState("");
  const [liveAnnotationSaving, setLiveAnnotationSaving] = useState(false);
  const [liveAnnotationError, setLiveAnnotationError] = useState("");
  const [browserAnnotations, setBrowserAnnotations] = useState<Annotation[]>(
    [],
  );
  const [browserCursor, setBrowserCursor] = useState<BrowserCursorState>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [snapshotOverlay, setSnapshotOverlay] = useState(false);
  const [youtubeAskOpen, setYoutubeAskOpen] = useState(false);
  const [youtubeQuestion, setYoutubeQuestion] = useState("");
  const [youtubeAskBusy, setYoutubeAskBusy] = useState(false);
  const [youtubeAskResult, setYoutubeAskResult] =
    useState<YouTubeAskState>(null);
  const partition = useMemo(() => getPartition(workspaceId), [workspaceId]);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  );
  const viewportSize = useMemo(
    () =>
      controlledViewport
        ? { width: controlledViewport.width, height: controlledViewport.height }
        : webviewSize,
    [controlledViewport, webviewSize],
  );
  const displayTitle = title || getDomain(activeUrl) || "Browser";
  const newTabLabel = t("browserWorkbench.newTab", "New tab");
  const tabLabel = title || getDomain(activeUrl) || "about:blank";
  const fullscreenLabel =
    mode === "fullscreen"
      ? t("browserWorkbench.exitFullscreen", "Exit full screen")
      : t(
          "browserWorkbench.openFullscreen",
          "Open browser workbench in full screen",
        );
  const webviewKey = `${partition}:${activeTabId}`;
  const visibleWebviewSize =
    activeUrl &&
    viewportSize &&
    viewportSize.width > 0 &&
    viewportSize.height > 0
      ? viewportSize
      : null;
  const liveAnnotationOverlayTarget =
    liveAnnotationTarget || liveAnnotationHover;
  const hasVisibleWebview = Boolean(visibleWebviewSize);
  const activeIsYouTube = Boolean(getYouTubeVideoId(activeUrl || urlText));
  const voiceInput = useVoiceInput({
    onTranscript: (text) => {
      setVoiceNotice("");
      setMessage((current) => (current ? `${current} ${text}` : text));
    },
    onError: (nextMessage) => setVoiceNotice(nextMessage),
    onNotConfigured: () => {
      setVoiceNotice(
        t("common.voiceInputNotConfigured", "Voice input is not configured."),
      );
      onOpenSettings?.("voice");
    },
  });

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    let frame = 0;
    const measure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = surface.getBoundingClientRect();
        const measuredWidth = surface.clientWidth || rect.width;
        const measuredHeight = surface.clientHeight || rect.height;
        setWebviewSize((current) =>
          getStableBrowserWorkbenchSize(current, measuredWidth, measuredHeight),
        );
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener("resize", measure);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (!initialUrl) return;
    // Status updates from this workbench are mirrored into the parent's
    // `initialUrl` prop. Do not feed that value back into another tab.
    if (initialUrl === activeUrlRef.current) return;
    setUrlText(initialUrl);
    setActiveUrl(initialUrl);
    activeUrlRef.current = initialUrl;
    setTabs((current) =>
      current.map((tab) =>
        tab.id === activeTabIdRef.current ? { ...tab, url: initialUrl } : tab,
      ),
    );
  }, [initialUrl]);

  const getReadyWebContentsId = useCallback(
    (webview: Any): number | undefined => {
      if (!webviewDomReadyRef.current) return undefined;
      if (!webview || typeof webview.getWebContentsId !== "function")
        return undefined;
      try {
        const webContentsId = webview.getWebContentsId();
        return typeof webContentsId === "number" ? webContentsId : undefined;
      } catch {
        return undefined;
      }
    },
    [],
  );

  const notifyStatus = useCallback(() => {
    const webview = webviewRef.current;
    const webContentsId = getReadyWebContentsId(webview);
    if (typeof webContentsId !== "number") return;
    const nextUrl =
      typeof webview?.getURL === "function"
        ? webview.getURL()
        : activeUrlRef.current;
    const nextTitle =
      typeof webview?.getTitle === "function"
        ? webview.getTitle()
        : titleRef.current;
    void window.electronAPI.updateBrowserWorkbenchStatus?.({
      taskId,
      sessionId,
      webContentsId,
      url: nextUrl,
      title: nextTitle,
    });
    onStatusChangeRef.current?.({ url: nextUrl, title: nextTitle });
  }, [getReadyWebContentsId, sessionId, taskId]);

  const registerSession = useCallback(() => {
    const webview = webviewRef.current;
    const webContentsId = getReadyWebContentsId(webview);
    if (typeof webContentsId !== "number") return;
    registeredWebContentsIdRef.current = webContentsId;
    const nextUrl =
      typeof webview?.getURL === "function"
        ? webview.getURL()
        : activeUrlRef.current;
    const nextTitle =
      typeof webview?.getTitle === "function"
        ? webview.getTitle()
        : titleRef.current;
    void window.electronAPI.registerBrowserWorkbenchSession?.({
      taskId,
      sessionId,
      webContentsId,
      url: nextUrl,
      title: nextTitle,
    });
    onStatusChangeRef.current?.({ url: nextUrl, title: nextTitle });
  }, [getReadyWebContentsId, sessionId, taskId]);

  const updateActiveTab = useCallback(
    (patch: Partial<BrowserWorkbenchTab>) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === activeTabId
            ? {
                ...tab,
                ...patch,
              }
            : tab,
        ),
      );
    },
    [activeTabId],
  );

  const openTab = useCallback((url = "") => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const normalized = url ? normalizeUrl(url) : "";
    setTabs((current) => [...current, { id, url: normalized, title: "" }]);
    activeTabIdRef.current = id;
    setActiveTabId(id);
    setUrlText(normalized);
    setActiveUrl(normalized);
    activeUrlRef.current = normalized;
    titleRef.current = "";
    setTitle("");
  }, []);

  const switchTab = useCallback((tab: BrowserWorkbenchTab) => {
    activeTabIdRef.current = tab.id;
    setActiveTabId(tab.id);
    setUrlText(tab.url);
    setActiveUrl(tab.url);
    setTitle(tab.title);
    activeUrlRef.current = tab.url;
    titleRef.current = tab.title;
  }, []);

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((current) => {
        if (current.length <= 1) return current;
        const next = current.filter((tab) => tab.id !== tabId);
        if (tabId === activeTabId) {
          const fallback = next[next.length - 1] || next[0];
          if (fallback) {
            activeTabIdRef.current = fallback.id;
            setActiveTabId(fallback.id);
            setUrlText(fallback.url);
            setActiveUrl(fallback.url);
            setTitle(fallback.title);
            activeUrlRef.current = fallback.url;
            titleRef.current = fallback.title;
          }
        }
        return next;
      });
    },
    [activeTabId],
  );

  const applyWebviewBounds = useCallback(
    (size = visibleWebviewSize) => {
      const webview = webviewRef.current;
      if (!webview || !size || size.width <= 0 || size.height <= 0) return;
      const width = String(size.width);
      const height = String(size.height);
      webview.style.width = `${width}px`;
      webview.style.height = `${height}px`;
      webview.setAttribute("width", width);
      webview.setAttribute("height", height);
      webview.removeAttribute("autosize");
      webview.removeAttribute("minwidth");
      webview.removeAttribute("maxwidth");
      webview.removeAttribute("minheight");
      webview.removeAttribute("maxheight");
    },
    [visibleWebviewSize],
  );

  useEffect(() => {
    applyWebviewBounds();
  }, [applyWebviewBounds]);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const handleNavigate = (event: Any) => {
      const nextUrl = event?.url || webview.getURL?.() || "";
      activeUrlRef.current = nextUrl;
      setUrlText(nextUrl);
      setActiveUrl(nextUrl);
      updateActiveTab({ url: nextUrl });
      notifyStatus();
    };
    const handleTitle = (event: Any) => {
      const nextTitle = event?.title || webview.getTitle?.() || "";
      titleRef.current = nextTitle;
      setTitle(nextTitle);
      updateActiveTab({ title: nextTitle });
      notifyStatus();
    };
    const handleLoadingStart = () => setIsLoading(true);
    const handleLoadingStop = () => {
      setIsLoading(false);
      notifyStatus();
    };
    const handleDomReady = () => {
      webviewDomReadyRef.current = true;
      applyWebviewBounds();
      registerSession();
    };
    const handleNewWindow = (event: Any) => {
      const nextUrl = event?.url || "";
      event?.preventDefault?.();
      if (nextUrl) openTab(nextUrl);
    };
    const handleRenderProcessGone = (event: Any) => {
      const reason = String(event?.reason || event?.details?.reason || "unknown");
      const webContentsId = registeredWebContentsIdRef.current;
      if (typeof webContentsId === "number") {
        void window.electronAPI.unregisterBrowserWorkbenchSession?.({
          taskId,
          sessionId,
          webContentsId,
        });
      }
      registeredWebContentsIdRef.current = null;
      webviewDomReadyRef.current = false;
      activeUrlRef.current = "";
      titleRef.current = "";
      setIsLoading(false);
      setActiveUrl("");
      setTitle("");
      updateActiveTab({ url: "", title: "" });
      setToolbarNotice(
        reason === "clean-exit"
          ? "Page closed"
          : "Page crashed — retry or enter another URL",
      );
      onStatusChangeRef.current?.({ url: "", title: "" });
    };
    webview.addEventListener("dom-ready", handleDomReady);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    webview.addEventListener("page-title-updated", handleTitle);
    webview.addEventListener("did-start-loading", handleLoadingStart);
    webview.addEventListener("did-stop-loading", handleLoadingStop);
    webview.addEventListener("new-window", handleNewWindow);
    webview.addEventListener("render-process-gone", handleRenderProcessGone);
    const readyFrame = window.requestAnimationFrame(() => {
      if (webviewDomReadyRef.current) return;
      try {
        if (
          typeof webview.getWebContentsId === "function" &&
          typeof webview.getWebContentsId() === "number"
        ) {
          handleDomReady();
        }
      } catch {
        // The webview may not be attached yet; the dom-ready listener will handle registration.
      }
    });
    return () => {
      window.cancelAnimationFrame(readyFrame);
      const webContentsId = registeredWebContentsIdRef.current;
      if (typeof webContentsId === "number") {
        void window.electronAPI.unregisterBrowserWorkbenchSession?.({
          taskId,
          sessionId,
          webContentsId,
        });
      }
      registeredWebContentsIdRef.current = null;
      webviewDomReadyRef.current = false;
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
      webview.removeEventListener("page-title-updated", handleTitle);
      webview.removeEventListener("did-start-loading", handleLoadingStart);
      webview.removeEventListener("did-stop-loading", handleLoadingStop);
      webview.removeEventListener("new-window", handleNewWindow);
      webview.removeEventListener("render-process-gone", handleRenderProcessGone);
    };
  }, [
    applyWebviewBounds,
    hasVisibleWebview,
    notifyStatus,
    openTab,
    registerSession,
    sessionId,
    taskId,
    updateActiveTab,
    webviewKey,
  ]);

  const navigate = useCallback(
    (nextUrl = urlText) => {
      const normalized = normalizeUrl(nextUrl);
      if (!normalized) return;
      activeUrlRef.current = normalized;
      setUrlText(normalized);
      setActiveUrl(normalized);
      updateActiveTab({ url: normalized });
    },
    [updateActiveTab, urlText],
  );

  const runWebviewCommand = useCallback(
    (command: "goBack" | "goForward" | "reload") => {
      const webview = webviewRef.current;
      if (!webview || typeof webview[command] !== "function") return;
      try {
        webview[command]();
      } catch {
        // The Electron webview throws if commands run during attach/navigation teardown.
      }
    },
    [],
  );

  const openCurrentPageExternal = useCallback(async () => {
    const webview = webviewRef.current;
    const currentUrl =
      typeof webview?.getURL === "function"
        ? webview.getURL()
        : activeUrlRef.current || activeUrl || urlText;
    const externalUrl =
      getExternalBrowserUrl(currentUrl || "") ||
      getExternalBrowserUrl(activeUrl || "") ||
      getExternalBrowserUrl(urlText);
    if (!externalUrl) {
      setToolbarNotice(
        t("browserWorkbench.notice.noExternalPage", "No external page"),
      );
      return;
    }
    try {
      await window.electronAPI.openExternal(externalUrl);
      setToolbarNotice(
        t("browserWorkbench.notice.openedExternally", "Opened externally"),
      );
    } catch (error) {
      setToolbarNotice(
        error instanceof Error
          ? error.message
          : t("browserWorkbench.notice.openFailed", "Open failed"),
      );
    }
  }, [activeUrl, urlText]);

  const applyViewportPreset = useCallback((preset: BrowserViewportOverride) => {
    setControlledViewport(preset);
    setToolbarNotice(
      t(
        `browserWorkbench.viewport.${preset.label.toLowerCase()}`,
        preset.label,
      ),
    );
  }, []);

  const resizeAnnotationCanvas = useCallback(() => {
    const image = annotationImageRef.current;
    const canvas = annotationCanvasRef.current;
    if (!image || !canvas) return;
    const rect = image.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#111827";
  }, []);

  const clearAnnotationCanvas = useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }, []);

  const getAnnotationPoint = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    },
    [],
  );

  const handleAnnotationPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      const context = canvas.getContext("2d");
      if (!context) return;
      annotationDrawingRef.current = true;
      canvas.setPointerCapture?.(event.pointerId);
      const point = getAnnotationPoint(event);
      context.beginPath();
      context.moveTo(point.x, point.y);
    },
    [getAnnotationPoint],
  );

  const handleAnnotationPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!annotationDrawingRef.current) return;
      const context = event.currentTarget.getContext("2d");
      if (!context) return;
      const point = getAnnotationPoint(event);
      context.lineTo(point.x, point.y);
      context.stroke();
    },
    [getAnnotationPoint],
  );

  const stopAnnotationDrawing = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      annotationDrawingRef.current = false;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    [],
  );

  useEffect(() => {
    if (!annotationDraft) return;
    const image = annotationImageRef.current;
    if (!image) return;
    let frame = window.requestAnimationFrame(resizeAnnotationCanvas);
    const observer = new ResizeObserver(resizeAnnotationCanvas);
    observer.observe(image);
    window.addEventListener("resize", resizeAnnotationCanvas);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resizeAnnotationCanvas);
    };
  }, [annotationDraft, resizeAnnotationCanvas]);

  const createAnnotatedDataUrl = useCallback(async (): Promise<string> => {
    if (!annotationDraft) throw new Error("No annotation is open.");
    const image = annotationImageRef.current;
    const overlay = annotationCanvasRef.current;
    if (!image || !overlay) throw new Error("Annotation surface is not ready.");
    const output = document.createElement("canvas");
    output.width = image.naturalWidth || annotationDraft.width || overlay.width;
    output.height =
      image.naturalHeight || annotationDraft.height || overlay.height;
    const context = output.getContext("2d");
    if (!context) throw new Error("Annotation export is not available.");
    context.drawImage(image, 0, 0, output.width, output.height);
    context.drawImage(overlay, 0, 0, output.width, output.height);
    return output.toDataURL("image/png");
  }, [annotationDraft]);

  const saveAnnotation = useCallback(
    async (sendToAgent: boolean) => {
      if (!annotationDraft || !workspaceId || !workspacePath) {
        setAnnotationError(
          t(
            "browserWorkbench.annotation.workspaceRequired",
            "Open a writable workspace to save an annotation.",
          ),
        );
        return;
      }
      setAnnotationSaving(true);
      setAnnotationError("");
      try {
        const dataUrl = await createAnnotatedDataUrl();
        const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
        const imported = await window.electronAPI.importDataToWorkspace({
          workspaceId,
          files: [
            {
              name: `browser-annotation-${Date.now()}.png`,
              data: base64,
              mimeType: "image/png",
            },
          ],
        });
        const saved = imported?.[0];
        if (!saved)
          throw new Error(
            t(
              "browserWorkbench.annotation.saveUnavailable",
              "Annotation could not be saved.",
            ),
          );
        const fullPath = `${workspacePath.replace(/\/$/, "")}/${saved.relativePath}`;
        if (sendToAgent && onSendMessage) {
          const note =
            annotationMessage.trim() ||
            t(
              "browserWorkbench.annotation.defaultNote",
              "Please inspect this annotated browser screenshot from {page}.",
              {
                page:
                  activeUrlRef.current ||
                  activeUrl ||
                  t("browserWorkbench.currentPage", "the current page"),
              },
            );
          await onSendMessage(
            `${note}\n\nAttached files:\n- ${saved.fileName} (${saved.relativePath})`,
            [
              {
                filePath: fullPath,
                mimeType: "image/png",
                filename: saved.fileName,
                sizeBytes: saved.size,
              },
            ],
          );
        }
        setAnnotationDraft(null);
        setAnnotationMessage("");
        setToolbarNotice(
          sendToAgent
            ? t("browserWorkbench.annotation.sent", "Annotation sent")
            : t("browserWorkbench.annotation.saved", "Annotation saved"),
        );
      } catch (error) {
        setAnnotationError(
          error instanceof Error
            ? error.message
            : t("browserWorkbench.annotation.failed", "Annotation failed"),
        );
      } finally {
        setAnnotationSaving(false);
      }
    },
    [
      activeUrl,
      annotationDraft,
      annotationMessage,
      createAnnotatedDataUrl,
      onSendMessage,
      workspaceId,
      workspacePath,
    ],
  );

  const captureScreenshot = useCallback(
    async (mode: "screenshot" | "annotation") => {
      if (!workspacePath) {
        setToolbarNotice(
          t(
            "browserWorkbench.notice.workspaceRequired",
            "Open a workspace to capture",
          ),
        );
        return;
      }
      const prefix =
        mode === "annotation"
          ? "browser-annotation-source"
          : "browser-screenshot";
      setToolbarNotice(
        mode === "annotation"
          ? t("browserWorkbench.notice.capturing", "Capturing...")
          : t("browserWorkbench.notice.saving", "Saving..."),
      );
      const result =
        await window.electronAPI.captureBrowserWorkbenchScreenshot?.({
          taskId,
          sessionId,
          workspacePath,
          filename: `${prefix}-${Date.now()}.png`,
          includeDataUrl: mode === "annotation",
        });
      if (result?.success) {
        if (mode === "annotation") {
          if (!result.dataUrl) {
            setToolbarNotice(
              t("browserWorkbench.notice.captureFailed", "Capture failed"),
            );
            return;
          }
          setAnnotationDraft({
            dataUrl: result.dataUrl,
            sourcePath: result.path,
            fullPath: result.fullPath,
            width: result.width || 1,
            height: result.height || 1,
          });
          setAnnotationMessage("");
          setAnnotationError("");
          setToolbarNotice("");
        } else {
          setToolbarNotice(
            t("browserWorkbench.notice.screenshotSaved", "Screenshot saved"),
          );
        }
      } else {
        setToolbarNotice(
          result?.error ||
            t("browserWorkbench.notice.captureFailed", "Capture failed"),
        );
      }
    },
    [sessionId, taskId, workspacePath],
  );

  const loadBrowserAnnotations = useCallback(async () => {
    if (!window.electronAPI.listAnnotations) return;
    const currentUrl = activeUrlRef.current || activeUrl;
    const currentUrlKey = getAnnotationUrlKey(currentUrl);
    const annotations = await window.electronAPI.listAnnotations({
      taskId,
      surfaceType: "browser",
      statuses: ["open", "addressing"],
      limit: 100,
    });
    const matchingAnnotations = annotations.filter((annotation) => {
      const target = annotation.targetRef as BrowserAnnotationTargetRef;
      return (
        target.surfaceType === "browser" &&
        (!currentUrlKey || getAnnotationUrlKey(target.url) === currentUrlKey)
      );
    });
    if (
      !window.electronAPI.resolveBrowserWorkbenchAnnotationTargets ||
      matchingAnnotations.length === 0
    ) {
      setBrowserAnnotations(
        matchingAnnotations.filter((annotation) =>
          annotationViewportMatches(
            annotation.targetRef as BrowserAnnotationTargetRef,
            visibleWebviewSize,
          ),
        ),
      );
      return;
    }
    const resolved =
      await window.electronAPI.resolveBrowserWorkbenchAnnotationTargets({
        taskId,
        sessionId,
        targets: matchingAnnotations.map(
          (annotation) => annotation.targetRef as BrowserAnnotationTargetRef,
        ),
      });
    const resolvedByIndex = new Map<
      number,
      BrowserAnnotationTargetResolveResult
    >((resolved.targets || []).map((result) => [result.index, result]));
    setBrowserAnnotations(
      matchingAnnotations.flatMap((annotation, index) => {
        const target = annotation.targetRef as BrowserAnnotationTargetRef;
        const resolvedTarget = resolvedByIndex.get(index);
        if (resolvedTarget?.resolved && resolvedTarget.target?.rect) {
          return [
            {
              ...annotation,
              targetRef: {
                ...target,
                ...resolvedTarget.target,
                surfaceType: "browser",
                url: target.url,
                title: target.title,
                viewport: visibleWebviewSize
                  ? {
                      width: visibleWebviewSize.width,
                      height: visibleWebviewSize.height,
                      mobile: controlledViewport?.mobile,
                      label: controlledViewport?.label,
                    }
                  : target.viewport,
              } satisfies BrowserAnnotationTargetRef,
            },
          ];
        }
        return annotationViewportMatches(target, visibleWebviewSize)
          ? [annotation]
          : [];
      }),
    );
  }, [activeUrl, controlledViewport, sessionId, taskId, visibleWebviewSize]);

  useEffect(() => {
    void loadBrowserAnnotations();
  }, [loadBrowserAnnotations]);

  useEffect(() => {
    if (!activeUrl || browserAnnotations.length === 0) return;
    const timer = window.setInterval(() => {
      void loadBrowserAnnotations();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [activeUrl, browserAnnotations.length, loadBrowserAnnotations]);

  const buildBrowserAnnotationTarget = useCallback(
    (
      target: Partial<BrowserAnnotationTargetRef>,
    ): BrowserAnnotationTargetRef => ({
      surfaceType: "browser",
      url: activeUrlRef.current || activeUrl || urlText,
      title: titleRef.current || title || undefined,
      viewport: visibleWebviewSize
        ? {
            width: visibleWebviewSize.width,
            height: visibleWebviewSize.height,
            mobile: controlledViewport?.mobile,
            label: controlledViewport?.label,
          }
        : undefined,
      ...target,
    }),
    [activeUrl, controlledViewport, title, urlText, visibleWebviewSize],
  );

  const inspectLiveAnnotationPoint = useCallback(
    async (
      event: ReactPointerEvent<HTMLDivElement>,
      force = false,
    ): Promise<BrowserAnnotationTargetRef | null> => {
      if (!liveAnnotationMode || liveAnnotationTarget) return null;
      const now = Date.now();
      if (!force && now - lastAnnotationInspectAtRef.current < 120)
        return liveAnnotationHover;
      lastAnnotationInspectAtRef.current = now;
      const requestId = liveAnnotationInspectRequestIdRef.current + 1;
      liveAnnotationInspectRequestIdRef.current = requestId;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = clampNumber(event.clientX - rect.left, 0, rect.width);
      const y = clampNumber(event.clientY - rect.top, 0, rect.height);
      try {
        const result = await window.electronAPI.inspectBrowserWorkbenchPoint?.({
          taskId,
          sessionId,
          x,
          y,
        });
        if (!result?.success || !result.target) return null;
        const nextTarget = buildBrowserAnnotationTarget(result.target);
        if (requestId !== liveAnnotationInspectRequestIdRef.current)
          return null;
        setLiveAnnotationHover(nextTarget);
        return nextTarget;
      } catch (error) {
        setLiveAnnotationError(
          error instanceof Error
            ? error.message
            : t(
                "browserWorkbench.annotation.inspectFailed",
                "Inspection failed.",
              ),
        );
        return null;
      }
    },
    [
      buildBrowserAnnotationTarget,
      liveAnnotationHover,
      liveAnnotationMode,
      liveAnnotationTarget,
      sessionId,
      taskId,
    ],
  );

  const selectLiveAnnotationTarget = useCallback(
    async (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!liveAnnotationMode || liveAnnotationTarget) return;
      event.preventDefault();
      const target =
        liveAnnotationHover || (await inspectLiveAnnotationPoint(event, true));
      if (!target) return;
      setLiveAnnotationTarget(target);
      setLiveAnnotationHover(null);
      setLiveAnnotationText("");
      setLiveAnnotationError("");
    },
    [
      inspectLiveAnnotationPoint,
      liveAnnotationHover,
      liveAnnotationMode,
      liveAnnotationTarget,
    ],
  );

  const cancelLiveAnnotationTarget = useCallback(() => {
    setLiveAnnotationTarget(null);
    setLiveAnnotationHover(null);
    setLiveAnnotationText("");
    setLiveAnnotationError("");
  }, []);

  const saveLiveBrowserAnnotation = useCallback(
    async (sendToAgent: boolean) => {
      const body = liveAnnotationText.trim();
      if (!liveAnnotationTarget || !body) {
        setLiveAnnotationError(
          t(
            "browserWorkbench.annotation.addNote",
            "Add a note for this annotation.",
          ),
        );
        return;
      }
      if (!window.electronAPI.createAnnotation) {
        setLiveAnnotationError(
          t(
            "browserWorkbench.annotation.unavailable",
            "Annotations are not available in this build.",
          ),
        );
        return;
      }
      setLiveAnnotationSaving(true);
      setLiveAnnotationError("");
      try {
        let screenshotPath: string | undefined;
        if (
          workspacePath &&
          window.electronAPI.captureBrowserWorkbenchScreenshot
        ) {
          const capture =
            await window.electronAPI.captureBrowserWorkbenchScreenshot({
              taskId,
              sessionId,
              workspacePath,
              filename: `browser-annotation-context-${Date.now()}.png`,
              includeDataUrl: false,
            });
          if (capture?.success) {
            screenshotPath = capture.fullPath || capture.path;
          }
        }
        const created = await window.electronAPI.createAnnotation({
          taskId,
          workspaceId,
          surfaceType: "browser",
          surfaceId: liveAnnotationTarget.url,
          body,
          targetRef: liveAnnotationTarget,
          screenshotPath,
        });
        await loadBrowserAnnotations();
        cancelLiveAnnotationTarget();
        setToolbarNotice(
          sendToAgent
            ? t("browserWorkbench.annotation.sent", "Annotation sent")
            : t("browserWorkbench.annotation.saved", "Annotation saved"),
        );
        if (sendToAgent && onSendMessage) {
          await onSendMessage(`Address annotation ${created.id}: ${body}`);
        }
      } catch (error) {
        setLiveAnnotationError(
          error instanceof Error
            ? error.message
            : t("browserWorkbench.annotation.failed", "Annotation failed."),
        );
      } finally {
        setLiveAnnotationSaving(false);
      }
    },
    [
      cancelLiveAnnotationTarget,
      liveAnnotationTarget,
      liveAnnotationText,
      loadBrowserAnnotations,
      onSendMessage,
      sessionId,
      taskId,
      workspaceId,
      workspacePath,
    ],
  );

  useEffect(() => {
    if (!toolbarNotice) return;
    const timer = window.setTimeout(() => setToolbarNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toolbarNotice]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserWorkbenchCursor?.(
      (event) => {
        if (event.taskId !== taskId || event.sessionId !== sessionId) return;
        setBrowserCursor({
          x: event.x,
          y: event.y,
          kind: event.kind,
          label: event.label,
          pulse: event.pulse,
          at: event.at,
        });
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [sessionId, taskId]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onBrowserWorkbenchViewport?.(
      (event) => {
        if (event.taskId !== taskId || event.sessionId !== sessionId) return;
        const width = Math.max(320, Math.round(event.width || 0));
        const height = Math.max(320, Math.round(event.height || 0));
        const viewportKind = event.mobile
          ? t("browserWorkbench.viewport.mobile", "Mobile")
          : t("browserWorkbench.viewport.desktop", "Desktop");
        const label = event.label || `${viewportKind} ${width}x${height}`;
        setControlledViewport({
          width,
          height,
          mobile: event.mobile === true,
          label,
        });
        setToolbarNotice(label);
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, [sessionId, taskId]);

  useEffect(() => {
    if (!browserCursor) return;
    const cursorAt = browserCursor.at;
    const timer = window.setTimeout(() => {
      setBrowserCursor((current) =>
        current?.at === cursorAt ? null : current,
      );
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [browserCursor]);

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed || !onSendMessage || sending) return;
    setMessage("");
    setVoiceNotice("");
    setSending(true);
    try {
      await onSendMessage(trimmed);
    } finally {
      setSending(false);
    }
  }, [message, onSendMessage, sending]);

  const askCurrentYouTubeVideo = useCallback(
    async (questionOverride?: string) => {
      const question = (questionOverride || youtubeQuestion).trim();
      const currentUrl = activeUrlRef.current || activeUrl || urlText;
      if (!workspaceId) {
        setYoutubeAskResult({
          error: t(
            "browserWorkbench.youtube.workspaceRequired",
            "Open a workspace first.",
          ),
        });
        return;
      }
      if (!currentUrl || !getYouTubeVideoId(currentUrl)) {
        setYoutubeAskResult({
          error: t(
            "browserWorkbench.youtube.videoRequired",
            "Open a YouTube video first.",
          ),
        });
        return;
      }
      if (!question) {
        setYoutubeAskResult({
          error: t(
            "browserWorkbench.youtube.questionRequired",
            "Ask a question first.",
          ),
        });
        return;
      }
      setYoutubeAskBusy(true);
      setYoutubeAskResult(null);
      try {
        const result = await window.electronAPI.askYouTubeVideo?.({
          workspaceId,
          url: currentUrl,
          question,
          limit: 8,
        });
        setYoutubeAskResult(
          result || {
            error: t(
              "browserWorkbench.youtube.noResult",
              "No result returned.",
            ),
          },
        );
      } catch (error) {
        setYoutubeAskResult({
          error:
            error instanceof Error
              ? error.message
              : t("browserWorkbench.youtube.askFailed", "Ask failed."),
        });
      } finally {
        setYoutubeAskBusy(false);
      }
    },
    [activeUrl, urlText, workspaceId, youtubeQuestion],
  );

  const sendYouTubeAnswerToChat = useCallback(async () => {
    if (!onSendMessage || !youtubeAskResult?.answer) return;
    const sources = (youtubeAskResult.sources || [])
      .slice(0, 6)
      .map(
        (source) => `- ${formatYouTubeTimestamp(source.startMs)} ${source.url}`,
      )
      .join("\n");
    await onSendMessage(
      `${youtubeAskResult.answer}${sources ? `\n\nSources:\n${sources}` : ""}`,
    );
  }, [onSendMessage, youtubeAskResult]);

  return (
    <section
      className={`browser-workbench browser-workbench-${mode}${
        !activeUrl && SHOW_BROWSER_NEW_TAB_GUIDE
          ? " browser-workbench-newtab-mode"
          : ""
      }`}
    >
      <header className="browser-workbench-header">
        <div className="browser-workbench-tabs">
          <span className="browser-workbench-summary">
            {t("browserWorkbench.summary", "Summary")}
          </span>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`browser-workbench-tab-shell ${tab.id === activeTabId ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="browser-workbench-tab"
                title={tab.title || tab.url || newTabLabel}
                onClick={() => switchTab(tab)}
              >
                <span
                  className="browser-workbench-tab-icon"
                  aria-hidden="true"
                />
                <span className="browser-workbench-tab-label">
                  {tab.id === activeTabId
                    ? tabLabel
                    : tab.title || getDomain(tab.url) || newTabLabel}
                </span>
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="browser-workbench-tab-close"
                  aria-label={t("browserWorkbench.closeTab", "Close tab")}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="browser-workbench-tab-add"
            title={newTabLabel}
            aria-label={newTabLabel}
            onClick={() => openTab()}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="browser-workbench-header-actions">
          <button
            type="button"
            className="browser-workbench-icon-btn"
            onClick={mode === "fullscreen" ? onExitFullscreen : onFullscreen}
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
          >
            {mode === "fullscreen" ? (
              <Minimize2 size={16} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Maximize2 size={16} strokeWidth={2.2} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="browser-workbench-icon-btn"
            onClick={onClose}
            title={t(
              "browserWorkbench.closeWorkbench",
              "Close browser workbench",
            )}
            aria-label={t(
              "browserWorkbench.closeWorkbench",
              "Close browser workbench",
            )}
          >
            <X size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="browser-workbench-toolbar">
        <div className="browser-workbench-nav-controls">
          <button
            type="button"
            className="browser-workbench-nav-btn"
            data-symbol="←"
            onClick={() => runWebviewCommand("goBack")}
            title={t("browserWorkbench.back", "Back")}
          >
            <span className="browser-workbench-glyph" aria-hidden="true">
              ←
            </span>
          </button>
          <button
            type="button"
            className="browser-workbench-nav-btn"
            data-symbol="→"
            onClick={() => runWebviewCommand("goForward")}
            title={t("browserWorkbench.forward", "Forward")}
          >
            <span className="browser-workbench-glyph" aria-hidden="true">
              →
            </span>
          </button>
          <button
            type="button"
            className="browser-workbench-nav-btn"
            data-symbol="↻"
            onClick={() => runWebviewCommand("reload")}
            title={t("browserWorkbench.reload", "Reload")}
          >
            <span
              className={`browser-workbench-glyph ${isLoading ? "is-spinning" : ""}`}
              aria-hidden="true"
            >
              ↻
            </span>
          </button>
        </div>
        {SHOW_BROWSER_ADDRESS_BAR && (
          <form
            className="browser-workbench-url-form"
            onSubmit={(event) => {
              event.preventDefault();
              navigate();
            }}
          >
            <input
              value={urlText}
              onChange={(event) => setUrlText(event.target.value)}
              placeholder={t("browserWorkbench.enterUrl", "Enter a URL")}
              aria-label={t("browserWorkbench.browserUrl", "Browser URL")}
            />
          </form>
        )}
        {SHOW_BROWSER_VIEWPORT_PRESETS && (
          <div
            className="browser-workbench-device-toolbar"
            aria-label={t(
              "browserWorkbench.viewportPresets",
              "Viewport presets",
            )}
          >
            {VIEWPORT_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active =
                controlledViewport?.width === preset.width &&
                controlledViewport.height === preset.height;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`browser-workbench-device-btn ${active ? "is-active" : ""}`}
                  onClick={() => applyViewportPreset(preset)}
                  title={`${t(`browserWorkbench.viewport.${preset.label.toLowerCase()}`, preset.label)} ${preset.width} x ${preset.height}`}
                  aria-label={t(
                    "browserWorkbench.viewportAria",
                    "{label} viewport",
                    {
                      label: t(
                        `browserWorkbench.viewport.${preset.label.toLowerCase()}`,
                        preset.label,
                      ),
                    },
                  )}
                >
                  <Icon size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
              );
            })}
            {controlledViewport && (
              <>
                <span
                  className="browser-workbench-device-size"
                  title={controlledViewport.label}
                >
                  {controlledViewport.width}x{controlledViewport.height}
                </span>
                <button
                  type="button"
                  className="browser-workbench-device-btn"
                  onClick={() => {
                    setControlledViewport(null);
                    setToolbarNotice(
                      t("browserWorkbench.viewport.auto", "Auto viewport"),
                    );
                  }}
                  title={t(
                    "browserWorkbench.viewport.returnAuto",
                    "Return to automatic viewport",
                  )}
                  aria-label={t(
                    "browserWorkbench.viewport.returnAuto",
                    "Return to automatic viewport",
                  )}
                >
                  <X size={13} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
        <div
          className={`browser-workbench-right-actions ${
            SHOW_ADVANCED_BROWSER_ACTIONS ? "" : "is-minimal"
          }`}
        >
          {activeUrl && (
            <span
              className="browser-workbench-profile"
              title={activeTab?.url || activeUrl}
            >
              {activeUrl.startsWith("https://") ? "https" : "http"}
            </span>
          )}
          {toolbarNotice && (
            <span className="browser-workbench-toolbar-notice">
              {toolbarNotice}
            </span>
          )}
          {SHOW_ADVANCED_BROWSER_ACTIONS && (
            <>
              {activeIsYouTube && (
                <button
                  type="button"
                  className={`browser-workbench-nav-btn browser-workbench-action-btn ${youtubeAskOpen ? "is-active" : ""}`}
                  onClick={() => setYoutubeAskOpen((current) => !current)}
                  title={t("browserWorkbench.youtube.askVideo", "Ask video")}
                  aria-label={t(
                    "browserWorkbench.youtube.askVideo",
                    "Ask video",
                  )}
                >
                  <Search
                    className="browser-workbench-lucide-icon"
                    size={16}
                    strokeWidth={2.2}
                    aria-hidden="true"
                  />
                </button>
              )}
              <button
                type="button"
                className="browser-workbench-nav-btn browser-workbench-action-btn"
                onClick={() => void openCurrentPageExternal()}
                title={t(
                  "browserWorkbench.openExternal",
                  "Open current page in external browser",
                )}
                aria-label={t(
                  "browserWorkbench.openExternal",
                  "Open current page in external browser",
                )}
              >
                <ExternalLink
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={`browser-workbench-nav-btn browser-workbench-action-btn ${snapshotOverlay ? "is-active" : ""}`}
                onClick={() => setSnapshotOverlay((current) => !current)}
                title={t(
                  "browserWorkbench.snapshotOverlay",
                  "Snapshot overlay",
                )}
                aria-label={t(
                  "browserWorkbench.snapshotOverlay",
                  "Snapshot overlay",
                )}
              >
                <ScanLine
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={`browser-workbench-nav-btn browser-workbench-action-btn ${diagnosticsOpen ? "is-active" : ""}`}
                onClick={() => setDiagnosticsOpen((current) => !current)}
                title={t("browserWorkbench.diagnostics", "Diagnostics")}
                aria-label={t("browserWorkbench.diagnostics", "Diagnostics")}
              >
                <Activity
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className="browser-workbench-nav-btn browser-workbench-action-btn"
                onClick={() => void captureScreenshot("screenshot")}
                title={t("browserWorkbench.takeScreenshot", "Take screenshot")}
                aria-label={t(
                  "browserWorkbench.takeScreenshot",
                  "Take screenshot",
                )}
              >
                <Camera
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className={`browser-workbench-nav-btn browser-workbench-action-btn ${liveAnnotationMode ? "is-active" : ""}`}
                onClick={() => {
                  setLiveAnnotationMode((current) => !current);
                  cancelLiveAnnotationTarget();
                  setToolbarNotice(
                    liveAnnotationMode
                      ? t(
                          "browserWorkbench.annotation.modeOff",
                          "Annotation mode off",
                        )
                      : t(
                          "browserWorkbench.annotation.annotating",
                          "Annotating",
                        ),
                  );
                }}
                title={t(
                  "browserWorkbench.annotation.annotateElement",
                  "Annotate page element",
                )}
                aria-label={t(
                  "browserWorkbench.annotation.annotateElement",
                  "Annotate page element",
                )}
              >
                <PencilLine
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                className="browser-workbench-nav-btn browser-workbench-action-btn"
                onClick={() => void captureScreenshot("annotation")}
                title={t(
                  "browserWorkbench.annotation.annotateScreenshot",
                  "Annotate screenshot",
                )}
                aria-label={t(
                  "browserWorkbench.annotation.annotateScreenshot",
                  "Annotate screenshot",
                )}
              >
                <Plus
                  className="browser-workbench-lucide-icon"
                  size={16}
                  strokeWidth={2.2}
                  aria-hidden="true"
                />
              </button>
            </>
          )}
        </div>
      </div>
      {activeIsYouTube && youtubeAskOpen && (
        <div className="browser-workbench-youtube-ask">
          <form
            className="browser-workbench-youtube-form"
            onSubmit={(event) => {
              event.preventDefault();
              void askCurrentYouTubeVideo();
            }}
          >
            <input
              value={youtubeQuestion}
              onChange={(event) => setYoutubeQuestion(event.target.value)}
              placeholder={t(
                "browserWorkbench.youtube.askThisVideo",
                "Ask this video",
              )}
              aria-label={t(
                "browserWorkbench.youtube.askThisVideo",
                "Ask this video",
              )}
            />
            <button
              type="submit"
              className="browser-workbench-youtube-submit"
              disabled={youtubeAskBusy || !youtubeQuestion.trim()}
              title={t("browserWorkbench.youtube.ask", "Ask")}
              aria-label={t("browserWorkbench.youtube.ask", "Ask")}
            >
              <ArrowUp size={15} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </form>
          {youtubeAskBusy && (
            <div className="browser-workbench-youtube-status">
              {t(
                "browserWorkbench.youtube.readingTranscript",
                "Reading transcript...",
              )}
            </div>
          )}
          {youtubeAskResult?.error && (
            <div className="browser-workbench-youtube-error">
              {youtubeAskResult.error}
            </div>
          )}
          {youtubeAskResult?.answer && (
            <div className="browser-workbench-youtube-answer">
              <p>{youtubeAskResult.answer}</p>
              {onSendMessage && (
                <button
                  type="button"
                  className="browser-workbench-youtube-secondary"
                  onClick={() => void sendYouTubeAnswerToChat()}
                >
                  {t("browserWorkbench.youtube.sendToChat", "Send to chat")}
                </button>
              )}
            </div>
          )}
          {!!youtubeAskResult?.sources?.length && (
            <div className="browser-workbench-youtube-sources">
              {youtubeAskResult.sources.slice(0, 6).map((source) => (
                <button
                  key={`${source.videoId}-${source.startMs}-${source.text.slice(0, 16)}`}
                  type="button"
                  className="browser-workbench-youtube-source"
                  onClick={() => openTab(source.url)}
                  title={source.url}
                >
                  <span className="browser-workbench-youtube-source-time">
                    {formatYouTubeTimestamp(source.startMs)}
                  </span>
                  <span className="browser-workbench-youtube-source-text">
                    {source.text}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!!youtubeAskResult?.suggestedFollowUps?.length && (
            <div className="browser-workbench-youtube-followups">
              {youtubeAskResult.suggestedFollowUps
                .slice(0, 3)
                .map((followUp) => (
                  <button
                    key={followUp}
                    type="button"
                    onClick={() => {
                      setYoutubeQuestion(followUp);
                      void askCurrentYouTubeVideo(followUp);
                    }}
                  >
                    {followUp}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      <div
        className={`browser-workbench-surface ${controlledViewport ? "has-controlled-viewport" : ""}`}
        ref={surfaceRef}
      >
        {visibleWebviewSize ? (
          <div
            className="browser-workbench-webview-frame"
            style={{
              width: `${visibleWebviewSize.width}px`,
              height: `${visibleWebviewSize.height}px`,
            }}
          >
            <webview
              key={webviewKey}
              ref={webviewRef}
              src={activeUrl}
              className="browser-workbench-webview"
              style={{
                width: "100%",
                height: "100%",
              }}
              width={visibleWebviewSize.width}
              height={visibleWebviewSize.height}
              partition={partition}
              {...webviewPopupProps}
              webpreferences="contextIsolation=yes, nodeIntegration=no"
            />
            {browserAnnotations.map((annotation, index) => {
              const target = annotation.targetRef as BrowserAnnotationTargetRef;
              if (target.surfaceType !== "browser" || !target.rect) return null;
              return (
                <button
                  key={annotation.id}
                  type="button"
                  className={`browser-live-annotation-pin status-${annotation.status}`}
                  style={{
                    left: `${clampNumber(target.rect.x + target.rect.width - 12, 2, visibleWebviewSize.width - 24)}px`,
                    top: `${clampNumber(target.rect.y - 12, 2, visibleWebviewSize.height - 24)}px`,
                  }}
                  title={annotation.body}
                  aria-label={`Annotation ${index + 1}: ${annotation.body}`}
                >
                  {index + 1}
                </button>
              );
            })}
            {liveAnnotationMode && (
              <div
                className="browser-live-annotation-layer"
                onPointerMove={(event) => {
                  void inspectLiveAnnotationPoint(event);
                }}
                onPointerDown={(event) => {
                  void selectLiveAnnotationTarget(event);
                }}
              >
                {liveAnnotationOverlayTarget?.rect && (
                  <div
                    className={`browser-live-annotation-box ${
                      liveAnnotationTarget ? "is-selected" : ""
                    }`}
                    style={{
                      left: `${liveAnnotationOverlayTarget.rect.x}px`,
                      top: `${liveAnnotationOverlayTarget.rect.y}px`,
                      width: `${liveAnnotationOverlayTarget.rect.width}px`,
                      height: `${liveAnnotationOverlayTarget.rect.height}px`,
                    }}
                    aria-hidden="true"
                  />
                )}
                {liveAnnotationHover && !liveAnnotationTarget && (
                  <div
                    className="browser-live-annotation-inspector"
                    style={{
                      left: `${clampNumber(
                        (liveAnnotationHover.rect?.x || 0) + 8,
                        8,
                        visibleWebviewSize.width - 170,
                      )}px`,
                      top: `${clampNumber(
                        (liveAnnotationHover.rect?.y || 0) - 38,
                        8,
                        visibleWebviewSize.height - 32,
                      )}px`,
                    }}
                  >
                    <span>{liveAnnotationHover.tagName || "element"}</span>
                    {liveAnnotationHover.computedStyle?.fontSize && (
                      <span>{liveAnnotationHover.computedStyle.fontSize}</span>
                    )}
                  </div>
                )}
                {liveAnnotationTarget?.rect && (
                  <div
                    className="browser-live-annotation-composer"
                    style={{
                      left: `${clampNumber(
                        liveAnnotationTarget.rect.x +
                          liveAnnotationTarget.rect.width +
                          14,
                        12,
                        visibleWebviewSize.width - 340,
                      )}px`,
                      top: `${clampNumber(
                        liveAnnotationTarget.rect.y,
                        12,
                        visibleWebviewSize.height - 210,
                      )}px`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="browser-live-annotation-meta">
                      <span>{liveAnnotationTarget.tagName || "element"}</span>
                      {liveAnnotationTarget.selector && (
                        <code>{liveAnnotationTarget.selector}</code>
                      )}
                    </div>
                    <textarea
                      value={liveAnnotationText}
                      onChange={(event) =>
                        setLiveAnnotationText(event.target.value)
                      }
                      placeholder={t(
                        "browserWorkbench.annotation.elementPlaceholder",
                        "What should NeoWorker change here?",
                      )}
                      rows={3}
                      autoFocus
                    />
                    {liveAnnotationError && (
                      <div className="browser-live-annotation-error">
                        {liveAnnotationError}
                      </div>
                    )}
                    <div className="browser-live-annotation-actions">
                      <button
                        type="button"
                        className="browser-annotation-secondary"
                        onClick={cancelLiveAnnotationTarget}
                        disabled={liveAnnotationSaving}
                      >
                        {t("common.cancel", "Cancel")}
                      </button>
                      <button
                        type="button"
                        className="browser-annotation-secondary"
                        onClick={() => void saveLiveBrowserAnnotation(false)}
                        disabled={
                          liveAnnotationSaving || !liveAnnotationText.trim()
                        }
                      >
                        {t("common.save", "Save")}
                      </button>
                      <button
                        type="button"
                        className="browser-annotation-primary browser-live-annotation-send"
                        onClick={() => void saveLiveBrowserAnnotation(true)}
                        disabled={
                          liveAnnotationSaving ||
                          !liveAnnotationText.trim() ||
                          !onSendMessage
                        }
                        title={t(
                          "browserWorkbench.annotation.sendToNeoWorker",
                          "Send annotation to NeoWorker",
                        )}
                        aria-label={t(
                          "browserWorkbench.annotation.sendToNeoWorker",
                          "Send annotation to NeoWorker",
                        )}
                      >
                        <ArrowUp
                          size={15}
                          strokeWidth={2.4}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeUrl ? (
          <div className="browser-workbench-empty">
            {t(
              "browserWorkbench.preparingViewport",
              "Preparing browser viewport...",
            )}
          </div>
        ) : (
          <div className="browser-workbench-newtab">
            {SHOW_BROWSER_NEW_TAB_GUIDE && (
              <div className="browser-workbench-newtab-inner">
                <div className="browser-workbench-newtab-hero">
                  <span className="browser-workbench-newtab-eyebrow">
                    {t("browserWorkbench.newtab.eyebrow", "In-app browser")}
                  </span>
                  <h2 className="browser-workbench-newtab-title">
                    {t(
                      "browserWorkbench.newtab.title",
                      "Let NeoWorker drive this browser",
                    )}
                  </h2>
                  <p className="browser-workbench-newtab-subtitle">
                    {t(
                      "browserWorkbench.newtab.subtitle",
                      "NeoWorker can see this tab and use it on your behalf — searching, clicking, filling forms, and pulling data — while you watch. Pick an example to send to NeoWorker, or type a URL above to browse manually.",
                    )}
                  </p>
                </div>
                <div className="browser-workbench-newtab-grid">
                  {BROWSER_CAPABILITIES.map((capability) => {
                    const Icon = capability.icon;
                    const disabled = !onSendMessage;
                    const capabilityLabel = t(
                      `browserWorkbench.capability.${capability.id}.label`,
                      capability.label,
                    );
                    const capabilityHint = t(
                      `browserWorkbench.capability.${capability.id}.hint`,
                      capability.hint,
                    );
                    const capabilityPrompt = t(
                      `browserWorkbench.capability.${capability.id}.prompt`,
                      capability.prompt,
                    );
                    return (
                      <button
                        key={capability.label}
                        type="button"
                        className="browser-workbench-newtab-tile"
                        onClick={() => {
                          if (!onSendMessage) return;
                          void onSendMessage(capabilityPrompt);
                          setToolbarNotice(
                            t(
                              "browserWorkbench.notice.sentCapability",
                              "Sent: {label}",
                              {
                                label: capabilityLabel,
                              },
                            ),
                          );
                        }}
                        disabled={disabled}
                        title={
                          disabled
                            ? t(
                                "browserWorkbench.newtab.fullscreenRequired",
                                "Open the workbench in fullscreen to send tasks to NeoWorker",
                              )
                            : capabilityPrompt
                        }
                      >
                        <span
                          className="browser-workbench-newtab-tile-icon"
                          style={{
                            color: capability.accent,
                            background: `${capability.accent}1f`,
                          }}
                        >
                          <Icon
                            size={18}
                            strokeWidth={2.2}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="browser-workbench-newtab-tile-text">
                          <span className="browser-workbench-newtab-tile-label">
                            {capabilityLabel}
                          </span>
                          <span className="browser-workbench-newtab-tile-hint">
                            {capabilityHint}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="browser-workbench-newtab-footnote">
                  {t(
                    "browserWorkbench.newtab.tip",
                    'Tip: ask in your own words too — "log into <site> and grab today\'s report" or "open this URL and click the third row" both work.',
                  )}
                </p>
              </div>
            )}
          </div>
        )}
        {controlledViewport && activeUrl && (
          <div className="browser-workbench-viewport-badge" aria-hidden="true">
            {controlledViewport.label}
          </div>
        )}
        {browserCursor && (
          <div
            key={`${browserCursor.at}-${browserCursor.kind}`}
            className={`browser-workbench-cursor ${browserCursor.pulse ? "is-pulsing" : ""}`}
            style={{
              transform: `translate3d(${browserCursor.x}px, ${browserCursor.y}px, 0)`,
            }}
            aria-hidden="true"
          >
            <span className="browser-workbench-cursor-pointer" />
            {browserCursor.label && (
              <span className="browser-workbench-cursor-label">
                {browserCursor.label}
              </span>
            )}
          </div>
        )}
        {snapshotOverlay && (
          <div
            className="browser-workbench-snapshot-overlay"
            aria-hidden="true"
          >
            <div className="browser-workbench-snapshot-box box-primary">
              <span>ref</span>
            </div>
            <div className="browser-workbench-snapshot-box box-secondary">
              <span>ref</span>
            </div>
          </div>
        )}
      </div>
      {diagnosticsOpen && (
        <div className="browser-workbench-diagnostics">
          <div className="browser-workbench-diagnostics-tabs">
            <button type="button" className="is-active">
              <TerminalSquare size={13} aria-hidden="true" />
              {t("browserWorkbench.diagnostics.console", "Console")}
            </button>
            <button type="button">
              <Globe2 size={13} aria-hidden="true" />
              {t("browserWorkbench.diagnostics.network", "Network")}
            </button>
            <button type="button">
              <Download size={13} aria-hidden="true" />
              {t("browserWorkbench.diagnostics.downloads", "Downloads")}
            </button>
            <button type="button">
              <Database size={13} aria-hidden="true" />
              {t("browserWorkbench.diagnostics.storage", "Storage")}
            </button>
            <button type="button">
              <Activity size={13} aria-hidden="true" />
              {t("browserWorkbench.diagnostics.trace", "Trace")}
            </button>
          </div>
          <div className="browser-workbench-diagnostics-body">
            <span>{displayTitle}</span>
            <span>{activeUrl || "about:blank"}</span>
          </div>
        </div>
      )}
      {annotationDraft && (
        <div
          className="browser-annotation-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t(
            "browserWorkbench.annotation.annotateScreenshot",
            "Annotate browser screenshot",
          )}
        >
          <div className="browser-annotation-panel">
            <div className="browser-annotation-header">
              <div>
                <div className="browser-annotation-title">
                  {t(
                    "browserWorkbench.annotation.annotateScreenshot",
                    "Annotate screenshot",
                  )}
                </div>
                <div className="browser-annotation-subtitle">
                  {t(
                    "browserWorkbench.annotation.subtitle",
                    "Draw over the capture, then save it or send it to the task.",
                  )}
                </div>
              </div>
              <button
                type="button"
                className="browser-annotation-close"
                onClick={() => {
                  setAnnotationDraft(null);
                  setAnnotationError("");
                  setAnnotationMessage("");
                }}
                aria-label={t(
                  "browserWorkbench.annotation.close",
                  "Close annotation",
                )}
              >
                ×
              </button>
            </div>
            <div className="browser-annotation-stage">
              <div className="browser-annotation-canvas-wrap">
                <img
                  ref={annotationImageRef}
                  src={annotationDraft.dataUrl}
                  alt={t(
                    "browserWorkbench.annotation.imageAlt",
                    "Browser screenshot to annotate",
                  )}
                  onLoad={resizeAnnotationCanvas}
                />
                <canvas
                  ref={annotationCanvasRef}
                  className="browser-annotation-canvas"
                  onPointerDown={handleAnnotationPointerDown}
                  onPointerMove={handleAnnotationPointerMove}
                  onPointerUp={stopAnnotationDrawing}
                  onPointerCancel={stopAnnotationDrawing}
                  onPointerLeave={() => {
                    annotationDrawingRef.current = false;
                  }}
                  aria-label={t(
                    "browserWorkbench.annotation.draw",
                    "Draw annotation",
                  )}
                />
              </div>
            </div>
            <div className="browser-annotation-footer">
              <textarea
                value={annotationMessage}
                onChange={(event) => setAnnotationMessage(event.target.value)}
                placeholder={t(
                  "browserWorkbench.annotation.screenshotPlaceholder",
                  "What should the agent notice or change?",
                )}
                rows={2}
              />
              {annotationError && (
                <div className="browser-annotation-error">
                  {annotationError}
                </div>
              )}
              <div className="browser-annotation-actions">
                <button
                  type="button"
                  className="browser-annotation-secondary"
                  onClick={clearAnnotationCanvas}
                  disabled={annotationSaving}
                >
                  {t("browserWorkbench.annotation.clear", "Clear")}
                </button>
                <button
                  type="button"
                  className="browser-annotation-secondary"
                  onClick={() => void saveAnnotation(false)}
                  disabled={annotationSaving}
                >
                  {t("common.save", "Save")}
                </button>
                <button
                  type="button"
                  className="browser-annotation-primary"
                  onClick={() => void saveAnnotation(true)}
                  disabled={annotationSaving || !onSendMessage}
                >
                  {annotationSaving
                    ? t("browserWorkbench.sending", "Sending...")
                    : t("browserWorkbench.sendToAgent", "Send to agent")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {mode === "fullscreen" && onSendMessage && (
        <div className="spreadsheet-viewer-fullscreen-controls">
          {turnContext && (
            <ArtifactTurnProgressPanel turnContext={turnContext} />
          )}
          <div className="spreadsheet-viewer-composer">
            {voiceNotice && (
              <div className="attachment-panel spreadsheet-viewer-attachment-panel">
                <div className="attachment-error">{voiceNotice}</div>
              </div>
            )}
            <div className="input-container spreadsheet-viewer-composer-input">
              <div className="input-row">
                <div className="mention-autocomplete-wrapper">
                  <textarea
                    className="input-field input-textarea"
                    placeholder={t(
                      "browserWorkbench.composer.placeholder",
                      "Ask for follow-up changes",
                    )}
                    value={message}
                    rows={1}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                </div>
                <div className="input-actions">
                  {selectedModel &&
                  selectedProvider &&
                  onModelChange &&
                  availableModels.length > 0 ? (
                    <ModelDropdown
                      models={availableModels}
                      selectedModel={selectedModel}
                      selectedProvider={selectedProvider}
                      selectedReasoningEffort={selectedReasoningEffort}
                      providers={availableProviders}
                      onModelChange={onModelChange}
                      onOpenSettings={onOpenSettings}
                      variant="label"
                      align="right"
                    />
                  ) : selectedModelLabel ? (
                    <span className="spreadsheet-viewer-composer-model">
                      {selectedModelLabel}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={`voice-input-btn ${voiceInput.state}`}
                    onClick={() => void voiceInput.toggleRecording()}
                    disabled={voiceInput.state === "processing" || sending}
                    title={t("common.voiceInput", "Voice input")}
                  >
                    {voiceInput.state === "recording" ? (
                      <Square
                        size={12}
                        fill="currentColor"
                        strokeWidth={0}
                        aria-hidden="true"
                      />
                    ) : (
                      <Mic size={16} aria-hidden="true" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="lets-go-btn lets-go-btn-sm"
                    onClick={() => void handleSend()}
                    disabled={!message.trim() || sending}
                    title={t("common.sendMessage", "Send message")}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <div className="input-below-actions spreadsheet-viewer-composer-actions">
              <span className="input-status-workspace">
                {t("composer.workInFolder", "Work in a folder")}
              </span>
              <span className="shell-toggle shell-toggle-inline enabled">
                {t("composer.shell", "Shell")}
                <span className="goal-mode-switch-track on">
                  <span className="goal-mode-switch-thumb" />
                </span>
              </span>
              <span className="input-status-mode">
                {t("composer.mode.execute", "Execute")}
              </span>
              <span className="input-status-mode">
                {t("composer.mode.auto", "Auto")}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
