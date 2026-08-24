import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PersonalityId,
  PersonaId,
  EmojiUsage,
  PersonalityQuirks,
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_QUIRKS,
  DEFAULT_RESPONSE_STYLE,
} from "../../shared/types";
import {
  getMessage,
  getRandomPlaceholder,
  getUiCopy,
  type MessageKey,
  type UiCopyKey,
  type AgentMessageContext,
} from "../utils/agentMessages";
import { useLanguage } from "../i18n";

/**
 * Agent context returned by the hook
 */
export interface AgentContext {
  // Core identity
  agentName: string;
  userName?: string;
  personality: PersonalityId;
  persona?: PersonaId;

  // Style settings
  emojiUsage: EmojiUsage;
  quirks: PersonalityQuirks;

  // Loading state
  isLoading: boolean;

  // Helper methods
  getMessage: (key: MessageKey, detail?: string) => string;
  getPlaceholder: () => string;
  getUiCopy: (
    key: UiCopyKey,
    replacements?: Record<string, string | number>,
  ) => string;
  formatWithNames: (template: string) => string;

  // Refresh settings
  refresh: () => Promise<void>;
}

/**
 * Hook that provides unified access to agent personality context
 */
export function useAgentContext(): AgentContext {
  const language = useLanguage();
  const [agentName, setAgentName] = useState(DEFAULT_ASSISTANT_NAME);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [personality, setPersonality] = useState<PersonalityId>("professional");
  const [persona, setPersona] = useState<PersonaId | undefined>(undefined);
  const [emojiUsage, setEmojiUsage] = useState<EmojiUsage>("minimal");
  const [quirks, setQuirks] = useState<PersonalityQuirks>(DEFAULT_QUIRKS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load from both appearance and personality settings
      const [appearanceSettings, personalitySettings] = await Promise.all([
        window.electronAPI.getAppearanceSettings(),
        window.electronAPI.getPersonalitySettings(),
      ]);

      // Agent name priority: personalitySettings > appearanceSettings > default
      const name =
        personalitySettings.agentName ||
        appearanceSettings.assistantName ||
        DEFAULT_ASSISTANT_NAME;
      setAgentName(name);

      // User name from relationship
      setUserName(personalitySettings.relationship?.userName);

      // Personality settings
      setPersonality(personalitySettings.activePersonality || "professional");
      setPersona(personalitySettings.activePersona);
      setEmojiUsage(
        personalitySettings.responseStyle?.emojiUsage ||
          DEFAULT_RESPONSE_STYLE.emojiUsage,
      );
      setQuirks(personalitySettings.quirks || DEFAULT_QUIRKS);
    } catch (error) {
      console.error("Failed to load agent context:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Build message context
  const messageContext = useMemo<AgentMessageContext>(
    () => ({
      agentName,
      userName,
      personality,
      persona,
      emojiUsage,
      quirks,
    }),
    [agentName, userName, personality, persona, emojiUsage, quirks],
  );

  // getMessage helper
  const getMessageFn = useCallback(
    (key: MessageKey, detail?: string) =>
      getMessage(key, messageContext, detail),
    [messageContext, language],
  );

  const getUiCopyFn = useCallback(
    (key: UiCopyKey, replacements?: Record<string, string | number>) =>
      getUiCopy(key, messageContext, replacements),
    [messageContext, language],
  );

  // getPlaceholder helper
  const getPlaceholderFn = useCallback(
    () => getRandomPlaceholder(messageContext),
    [messageContext, language],
  );

  // formatWithNames helper - replaces {agentName} and {userName} in templates
  const formatWithNames = useCallback(
    (template: string) => {
      let result = template.replace(/{agentName}/g, agentName);
      if (userName) {
        result = result.replace(/{userName}/g, userName);
      } else {
        // Remove patterns like ", {userName}" or "{userName}, " if no userName
        result = result.replace(/,?\s*{userName}\s*,?/g, "");
      }
      return result;
    },
    [agentName, userName],
  );

  return useMemo(
    () => ({
      agentName,
      userName,
      personality,
      persona,
      emojiUsage,
      quirks,
      isLoading,
      getMessage: getMessageFn,
      getPlaceholder: getPlaceholderFn,
      getUiCopy: getUiCopyFn,
      formatWithNames,
      refresh: loadSettings,
    }),
    [
      agentName,
      userName,
      personality,
      persona,
      emojiUsage,
      quirks,
      isLoading,
      getMessageFn,
      getPlaceholderFn,
      getUiCopyFn,
      formatWithNames,
      loadSettings,
    ],
  );
}

export default useAgentContext;
