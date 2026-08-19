import { describe, expect, it } from "vitest";
import {
  moveQueueItemByOffset,
  reorderQueueItems,
} from "../task-follow-up-queue-order";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("task follow-up queue ordering", () => {
  it("moves an item before the selected target", () => {
    expect(reorderQueueItems(items, "c", "a", "before")).toEqual([
      { id: "c" },
      { id: "a" },
      { id: "b" },
    ]);
  });

  it("moves an item after the selected target", () => {
    expect(reorderQueueItems(items, "a", "c", "after")).toEqual([
      { id: "b" },
      { id: "c" },
      { id: "a" },
    ]);
  });

  it("moves an item one position with the keyboard", () => {
    expect(moveQueueItemByOffset(items, "b", -1)).toEqual([
      { id: "b" },
      { id: "a" },
      { id: "c" },
    ]);
    expect(moveQueueItemByOffset(items, "b", 1)).toEqual([
      { id: "a" },
      { id: "c" },
      { id: "b" },
    ]);
  });

  it("does not change order for invalid moves", () => {
    expect(reorderQueueItems(items, "missing", "a", "before")).toEqual(items);
    expect(moveQueueItemByOffset(items, "a", -1)).toEqual(items);
  });
});
