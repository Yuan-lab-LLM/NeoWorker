import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Ellipsis,
  GripVertical,
  MessageSquareText,
  Paperclip,
  Pencil,
  Trash2,
} from "lucide-react";
import type { TaskQueuedFollowUp } from "../../shared/types";
import { translate } from "../i18n";
import {
  moveQueueItemByOffset,
  reorderQueueItems,
  type QueueDropPosition,
} from "../utils/task-follow-up-queue-order";

type TaskFollowUpQueueProps = {
  taskId: string | null;
  active: boolean;
};

const QUEUE_MENU_WIDTH = 192;
const QUEUE_MENU_GUTTER = 10;

export function TaskFollowUpQueue({ taskId, active }: TaskFollowUpQueueProps) {
  const [items, setItems] = useState<TaskQueuedFollowUp[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    left: number;
    bottom: number;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [dragState, setDragState] = useState<{
    draggedId: string;
    targetId: string;
    position: QueueDropPosition;
  } | null>(null);
  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cancelEditRef = useRef(false);
  const suspendRefreshRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const reorderInFlightRef = useRef(false);

  const closeMenu = useCallback(() => {
    setMenuId(null);
    setMenuPosition(null);
  }, []);

  const refresh = useCallback(async () => {
    if (suspendRefreshRef.current || refreshInFlightRef.current) return;
    if (!taskId) {
      setItems([]);
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const next = await window.electronAPI.listQueuedFollowUps(taskId);
      if (mountedRef.current && !suspendRefreshRef.current) setItems(next);
    } catch (error) {
      console.error("Failed to load queued follow-ups:", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [taskId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = window.setInterval(
      () => void refresh(),
      active ? 1200 : 3000,
    );
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [active, refresh]);

  useEffect(() => {
    setEditingId(null);
    closeMenu();
  }, [closeMenu, taskId]);

  useEffect(() => {
    if (!menuId) return;
    const closeMenu = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setMenuId(null);
        setMenuPosition(null);
      }
    };
    const closeOnViewportChange = () => {
      setMenuId(null);
      setMenuPosition(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOnViewportChange();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuId]);

  const beginEdit = (item: TaskQueuedFollowUp) => {
    cancelEditRef.current = false;
    closeMenu();
    setEditingId(item.id);
    setEditingValue(item.message);
  };

  const cancelEdit = () => {
    cancelEditRef.current = true;
    setEditingId(null);
  };

  const saveEdit = async (item: TaskQueuedFollowUp) => {
    if (!taskId || busyId === item.id) return;
    const message = editingValue.trim();
    if (!message) {
      setEditingValue(item.message);
      setEditingId(null);
      return;
    }
    if (message === item.message) {
      setEditingId(null);
      return;
    }
    setBusyId(item.id);
    try {
      const updated = await window.electronAPI.updateQueuedFollowUp(
        taskId,
        item.id,
        message,
      );
      if (updated) {
        setItems((current) =>
          current.map((queued) => (queued.id === item.id ? updated : queued)),
        );
      }
      setEditingId(null);
    } catch (error) {
      console.error("Failed to update queued follow-up:", error);
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (item: TaskQueuedFollowUp) => {
    if (!taskId || busyId === item.id) return;
    setBusyId(item.id);
    closeMenu();
    try {
      const result = await window.electronAPI.removeQueuedFollowUp(
        taskId,
        item.id,
      );
      if (result.removed) {
        setItems((current) =>
          current.filter((queued) => queued.id !== item.id),
        );
      }
    } catch (error) {
      console.error("Failed to remove queued follow-up:", error);
    } finally {
      setBusyId(null);
    }
  };

  const persistOrder = async (
    nextItems: TaskQueuedFollowUp[],
    previousItems: TaskQueuedFollowUp[],
  ) => {
    if (!taskId || reorderInFlightRef.current) return;
    suspendRefreshRef.current = true;
    reorderInFlightRef.current = true;
    setIsReordering(true);
    setItems(nextItems);
    try {
      const saved = await window.electronAPI.reorderQueuedFollowUps(
        taskId,
        nextItems.map((item) => item.id),
      );
      if (mountedRef.current) setItems(saved);
    } catch (error) {
      if (mountedRef.current) setItems(previousItems);
      console.error("Failed to reorder queued follow-ups:", error);
    } finally {
      reorderInFlightRef.current = false;
      suspendRefreshRef.current = false;
      if (mountedRef.current) setIsReordering(false);
      void refresh();
    }
  };

  const getDropPosition = (
    event: DragEvent<HTMLElement>,
  ): QueueDropPosition => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY >= rect.top + rect.height / 2 ? "after" : "before";
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    item: TaskQueuedFollowUp,
  ) => {
    if (
      editingId === item.id ||
      busyId ||
      isReordering ||
      reorderInFlightRef.current
    ) {
      event.preventDefault();
      return;
    }
    closeMenu();
    suspendRefreshRef.current = true;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    setDragState({
      draggedId: item.id,
      targetId: item.id,
      position: "before",
    });
  };

  const handleDragOver = (
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ) => {
    if (!dragState || dragState.draggedId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = getDropPosition(event);
    setDragState((current) =>
      current
        ? {
            ...current,
            targetId,
            position,
          }
        : current,
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (!dragState) return;
    event.preventDefault();
    const previousItems = items;
    const nextItems = reorderQueueItems(
      previousItems,
      dragState.draggedId,
      targetId,
      getDropPosition(event),
    );
    setDragState(null);
    if (
      nextItems.every((item, index) => item.id === previousItems[index]?.id)
    ) {
      suspendRefreshRef.current = false;
      return;
    }
    void persistOrder(nextItems, previousItems);
  };

  const handleDragEnd = () => {
    setDragState(null);
    if (!reorderInFlightRef.current) suspendRefreshRef.current = false;
  };

  const handleGripKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    item: TaskQueuedFollowUp,
  ) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (busyId || isReordering || reorderInFlightRef.current) return;
    const previousItems = items;
    const nextItems = moveQueueItemByOffset(
      previousItems,
      item.id,
      event.key === "ArrowUp" ? -1 : 1,
    );
    if (
      nextItems.every((queued, index) => queued.id === previousItems[index]?.id)
    ) {
      return;
    }
    void persistOrder(nextItems, previousItems);
  };

  const toggleMenu = (item: TaskQueuedFollowUp, trigger: HTMLButtonElement) => {
    if (menuId === item.id) {
      closeMenu();
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(
      QUEUE_MENU_GUTTER,
      Math.min(
        rect.right - QUEUE_MENU_WIDTH,
        window.innerWidth - QUEUE_MENU_WIDTH - QUEUE_MENU_GUTTER,
      ),
    );
    setMenuPosition({
      left,
      bottom: Math.max(QUEUE_MENU_GUTTER, window.innerHeight - rect.top + 6),
    });
    setMenuId(item.id);
  };

  if (items.length === 0) return null;

  const menuItem = menuId
    ? (items.find((item) => item.id === menuId) ?? null)
    : null;

  return (
    <>
      <section
        ref={rootRef}
        className="task-follow-up-queue"
        aria-label={translate("composer.queue.label", "Queued messages")}
      >
        <div className="task-follow-up-queue-list" role="list">
          {items.map((item) => {
            const isEditing = editingId === item.id;
            const isBusy = busyId === item.id || isReordering;
            const dropPosition =
              dragState?.targetId === item.id && dragState.draggedId !== item.id
                ? dragState.position
                : null;
            return (
              <div
                className={`task-follow-up-queue-row${isEditing ? " is-editing" : ""}${dragState?.draggedId === item.id ? " is-dragging" : ""}${dropPosition ? ` drop-${dropPosition}` : ""}`}
                key={item.id}
                role="listitem"
                aria-posinset={items.indexOf(item) + 1}
                aria-setsize={items.length}
                onDragOver={(event) => handleDragOver(event, item.id)}
                onDrop={(event) => handleDrop(event, item.id)}
              >
                <button
                  type="button"
                  className="task-follow-up-queue-grip"
                  draggable={!isEditing && !isBusy}
                  onDragStart={(event) => handleDragStart(event, item)}
                  onDragEnd={handleDragEnd}
                  onKeyDown={(event) => handleGripKeyDown(event, item)}
                  disabled={isEditing || isBusy}
                  title={translate(
                    "composer.queue.reorder",
                    "Drag to reorder queued message",
                  )}
                  aria-label={translate(
                    "composer.queue.reorder",
                    "Drag to reorder queued message",
                  )}
                >
                  <GripVertical size={13} aria-hidden="true" />
                </button>
                <span className="task-follow-up-queue-kind" aria-hidden="true">
                  {item.attachmentCount > 0 ? (
                    <Paperclip size={13} />
                  ) : (
                    <MessageSquareText size={13} />
                  )}
                </span>
                {isEditing ? (
                  <input
                    className="task-follow-up-queue-editor"
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveEdit(item);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEdit();
                      }
                    }}
                    onBlur={() => {
                      if (cancelEditRef.current) {
                        cancelEditRef.current = false;
                        return;
                      }
                      void saveEdit(item);
                    }}
                    aria-label={translate(
                      "composer.queue.editMessage",
                      "Edit queued message",
                    )}
                    autoFocus
                  />
                ) : (
                  <span
                    className="task-follow-up-queue-message"
                    title={item.message}
                  >
                    {item.message}
                  </span>
                )}
                <span className="task-follow-up-queue-status">
                  {translate("composer.queue.statusQueued", "Queued")}
                </span>
                <div className="task-follow-up-queue-actions">
                  <button
                    type="button"
                    className="task-follow-up-queue-icon-button"
                    onClick={() => void removeItem(item)}
                    disabled={isBusy}
                    title={translate(
                      "composer.queue.remove",
                      "Remove from queue",
                    )}
                    aria-label={translate(
                      "composer.queue.remove",
                      "Remove from queue",
                    )}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                  <div className="task-follow-up-queue-more-wrap">
                    <button
                      type="button"
                      className="task-follow-up-queue-icon-button"
                      onClick={(event) => toggleMenu(item, event.currentTarget)}
                      disabled={isBusy}
                      title={translate("composer.queue.more", "More actions")}
                      aria-label={translate(
                        "composer.queue.more",
                        "More actions",
                      )}
                      aria-haspopup="menu"
                      aria-expanded={menuId === item.id}
                    >
                      <Ellipsis size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      {menuItem && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className="task-follow-up-queue-menu"
              role="menu"
              style={{
                left: menuPosition.left,
                bottom: menuPosition.bottom,
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => beginEdit(menuItem)}
              >
                <Pencil size={15} aria-hidden="true" />
                {translate("composer.queue.editMessage", "Edit message")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-destructive"
                onClick={() => void removeItem(menuItem)}
              >
                <Trash2 size={15} aria-hidden="true" />
                {translate("composer.queue.closeQueue", "Stop queueing")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
