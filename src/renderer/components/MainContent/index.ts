export { MainContent } from "./MainContent";
export { TaskSessionLineageFooter } from "./MainContent";
export { ModelDropdown } from "./ModelDropdown";
export { TaskAutomationModal } from "./TaskAutomationModal";
export { getWorkspaceStatusFolderLabel } from "./welcome-suggestions";
export {
  getVisibleEndOfTaskArtifactCards,
  getInlinePreviewKindForGeneratedFile,
  extractGeneratedArtifactPathsFromText,
  resolveArtifactPathsAgainstTaskEvents,
  getInlinePreviewKindForTaskEvent,
  shouldRenderOpenArtifactCardAtEvent,
  collectLatestEndOfTaskArtifactCards,
  collectEndOfTaskArtifactCardStacks,
  getEndOfTaskArtifactStackAnchorEventId,
  getEarliestTaskEventStreamIndex,
} from "./artifact-logic";
export type {
  EndOfTaskArtifactCard,
  EndOfTaskArtifactStack,
} from "./artifact-logic";
export {
  shouldSuppressInitialPromptUserEvent,
  deriveTaskHeaderPresentation,
  shouldCreateFreshTaskForSend,
  isChatExecutionTask,
  deriveComposerTaskSettings,
} from "./task-event-presentation";
export type { ComposerTaskSettings } from "./task-event-presentation";
export { composeMessageWithAttachments } from "./attachments";
export type { ImportedAttachment } from "./attachments";
export {
  resolveSafeCollapsedBubbleHeight,
  normalizeQuotedAssistantMarkdownPreview,
  createQuotedAssistantMessage,
} from "./message-ui";
export {
  isXComLink,
  normalizeSourcesSection,
  normalizeMarkdownForDisplay,
  normalizeTimelineTitleMarkdownForDisplay,
  cleanAssistantMessageForDisplay,
} from "./markdown-normalization";
export {
  getDefaultTranscriptMode,
  shouldBypassLiveTaskEventProjection,
  shouldIncludeExecutionRecordEvents,
  shouldShowChatTaskExecutionRows,
  selectVisibleCommandOutputSessions,
  shouldShowBootstrapProgressRow,
  shouldMarkActionBlockActiveForCurrentTurn,
  getBootstrapProgressTitle,
  deriveProgressHeartbeat,
  deriveAgentReasoningPanelState,
  selectVisibleTaskFeedRows,
  hasInactiveStringSetEntries,
  pruneStringSetToActiveIds,
  collectInlineRunCommandSessionIds,
  estimateTaskFeedRowHeight,
  getAutoScrollTargetTop,
  pinScrollElementToBottom,
  shouldScheduleAutoScrollWrite,
} from "./task-feed-logic";
export type {
  TranscriptMode,
  AgentReasoningPanelState,
} from "./task-feed-logic";
export {
  formatTimelineErrorTitleForDisplay,
  formatStepFailedTitleForDisplay,
} from "./timeline-event-rendering";
