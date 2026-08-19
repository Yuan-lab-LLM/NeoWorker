export const CONVERSATION_TURN_NAVIGATION_EVENT =
  "neoworker:navigate-conversation-turn";

export type ConversationTurnNavigationDetail = {
  taskId: string;
  turnId: string;
};

export function requestConversationTurnNavigation(
  detail: ConversationTurnNavigationDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<ConversationTurnNavigationDetail>(
      CONVERSATION_TURN_NAVIGATION_EVENT,
      { detail },
    ),
  );
}
