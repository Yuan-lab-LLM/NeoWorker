export const SKILL_INVENTORY_UPDATED_EVENT =
  "neoworker:skill-inventory-updated";

export function notifySkillInventoryUpdated(): void {
  window.dispatchEvent(new Event(SKILL_INVENTORY_UPDATED_EVENT));
}
