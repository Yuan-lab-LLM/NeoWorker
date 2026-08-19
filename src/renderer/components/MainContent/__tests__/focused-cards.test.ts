import { describe, expect, it } from "vitest";
import {
  CARDS_TO_SHOW,
  DEFAULT_FOCUSED_CARD_IDS,
  FOCUSED_CARD_POOL,
  getFocusedCardPoolForVaultState,
  getDefaultFocusedCards,
  INITIAL_RELEASE_FOCUSED_CARD_POOL,
  isFocusedCardVisibleForCurrentProduct,
  pickNextFocusedCards,
  reconcileFocusedCards,
} from "../focused-cards";

describe("initial release welcome cards", () => {
  it("does not advertise hidden channels, unsupported media, or advanced automation", () => {
    const ids = new Set(
      INITIAL_RELEASE_FOCUSED_CARD_POOL.map((card) => card.id),
    );

    expect(ids.has("setup-whatsapp")).toBe(false);
    expect(ids.has("setup-telegram")).toBe(false);
    expect(ids.has("setup-slack")).toBe(false);
    expect(ids.has("setup-more-channels")).toBe(false);
    expect(ids.has("setup-voice")).toBe(false);
    expect(ids.has("transcribe-audio")).toBe(false);
    expect(ids.has("setup-skills")).toBe(false);
    expect(ids.has("setup-schedule")).toBe(false);
    expect(ids.has("discover-automations")).toBe(false);
    expect(ids.has("setup-guardrails")).toBe(false);
  });

  it("does not keep legacy channel cards in the complete quick-start inventory", async () => {
    const { FOCUSED_CARD_POOL } = await import("../focused-cards");
    const cardIds = new Set(FOCUSED_CARD_POOL.map((card) => card.id));

    expect(cardIds.has("setup-whatsapp")).toBe(false);
    expect(cardIds.has("setup-telegram")).toBe(false);
    expect(cardIds.has("setup-slack")).toBe(false);
    expect(cardIds.has("setup-more-channels")).toBe(false);
    expect(cardIds.has("setup-guardrails")).toBe(false);
  });

  it("rejects unsupported communication settings cards", () => {
    expect(
      isFocusedCardVisibleForCurrentProduct({
        id: "legacy-slack",
        emoji: "",
        iconName: "message",
        title: "Connect Slack",
        desc: "Legacy entry",
        action: { type: "settings", tab: "slack" },
        category: "setup",
      }),
    ).toBe(false);
  });

  it("replaces a stale Slack card preserved by Fast Refresh", () => {
    const staleSlackCard = {
      id: "setup-slack",
      emoji: "",
      iconName: "message",
      title: "Connect Slack",
      desc: "Legacy entry",
      action: { type: "settings" as const, tab: "slack" as const },
      category: "setup" as const,
    };
    const reconciled = reconcileFocusedCards(
      [staleSlackCard, ...getDefaultFocusedCards().slice(0, 2)],
      INITIAL_RELEASE_FOCUSED_CARD_POOL,
      CARDS_TO_SHOW,
    );

    expect(reconciled).toHaveLength(CARDS_TO_SHOW);
    expect(reconciled.some((card) => card.id === "setup-slack")).toBe(false);
  });

  it("replaces a stale safety-limits card preserved by Fast Refresh", () => {
    const staleGuardrailsCard = {
      id: "setup-guardrails",
      emoji: "",
      iconName: "shield",
      title: "Set safety limits",
      desc: "Legacy entry",
      action: { type: "settings" as const, tab: "appearance" as const },
      category: "setup" as const,
    };
    const reconciled = reconcileFocusedCards(
      [staleGuardrailsCard, ...getDefaultFocusedCards().slice(0, 2)],
      INITIAL_RELEASE_FOCUSED_CARD_POOL,
      CARDS_TO_SHOW,
    );

    expect(reconciled).toHaveLength(CARDS_TO_SHOW);
    expect(reconciled.some((card) => card.id === "setup-guardrails")).toBe(
      false,
    );
  });

  it("keeps direct, outcome-oriented starters", () => {
    const ids = new Set(
      INITIAL_RELEASE_FOCUSED_CARD_POOL.map((card) => card.id),
    );

    expect(ids.has("write")).toBe(true);
    expect(ids.has("research")).toBe(true);
    expect(ids.has("analyze")).toBe(true);
  });

  it("advertises the intended model families on the model switcher card", () => {
    const card = FOCUSED_CARD_POOL.find(
      (entry) => entry.id === "discover-multimodel",
    );

    expect(card?.desc).toBe("Use Kimi, GLM, DeepSeek, and more");
  });

  it("uses the NeoWorker workspace without requiring an external vault", () => {
    const card = FOCUSED_CARD_POOL.find(
      (entry) => entry.id === "research-vault",
    );

    expect(card?.desc).toContain("current workspace");
    expect(card?.desc).not.toContain("Obsidian");
    expect(card?.action.type).toBe("prompt");
    if (card?.action.type === "prompt") {
      expect(card.action.prompt).toContain("NeoWorker workspace");
      expect(card.action.prompt).not.toContain("Obsidian");
    }
  });

  it("shows one research-vault entry that follows the workspace state", () => {
    const beforeSetup = getFocusedCardPoolForVaultState(false);
    expect(beforeSetup.some((card) => card.id === "research-vault")).toBe(true);
    expect(beforeSetup.some((card) => card.id === "discover-vault")).toBe(
      false,
    );

    const afterSetup = getFocusedCardPoolForVaultState(true);
    expect(afterSetup.some((card) => card.id === "research-vault")).toBe(false);
    expect(afterSetup.some((card) => card.id === "discover-vault")).toBe(true);
  });

  it("uses only currently supported research and document cards by default", () => {
    expect(getDefaultFocusedCards().map((card) => card.id)).toEqual([
      ...DEFAULT_FOCUSED_CARD_IDS,
    ]);
  });

  it("returns a different group when the user asks for more ideas", () => {
    const currentCards = INITIAL_RELEASE_FOCUSED_CARD_POOL.slice(
      0,
      CARDS_TO_SHOW,
    );
    const nextCards = pickNextFocusedCards(
      INITIAL_RELEASE_FOCUSED_CARD_POOL,
      currentCards,
      CARDS_TO_SHOW,
    );
    const currentIds = new Set(currentCards.map((card) => card.id));

    expect(nextCards).toHaveLength(CARDS_TO_SHOW);
    expect(nextCards.every((card) => !currentIds.has(card.id))).toBe(true);
  });
});
