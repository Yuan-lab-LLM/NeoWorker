/**
 * Notification Service - Manages in-app notifications
 * Provides CRUD operations and emits events for UI updates
 */

import { randomUUID } from "node:crypto";
import type { AppNotification, NotificationType, NotificationStoreFile } from "../../shared/types";
import {
  loadNotificationStore as _loadNotificationStore,
  loadNotificationStoreSync,
  saveNotificationStoreSync,
  saveNotificationStore,
  getNotificationStorePath,
} from "./store";
import { createLogger } from "../utils/logger";

const log = createLogger("NotificationService");

export type NotificationEventType = "added" | "updated" | "removed" | "cleared";

export interface NotificationEvent {
  type: NotificationEventType;
  notification?: AppNotification;
  notifications?: AppNotification[];
}

export interface NotificationServiceConfig {
  storePath?: string;
  onEvent?: (event: NotificationEvent) => void;
}

type AddNotificationParams = {
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  cronJobId?: string;
  workspaceId?: string;
  suggestionId?: string;
  recommendedDelivery?: "briefing" | "inbox" | "nudge";
  companionStyle?: "email" | "note";
};

function getInputRequiredDedupeKey(notification: AppNotification): string | null {
  if (notification.type !== "input_required" || !notification.taskId) return null;
  return `input_required:${notification.taskId}`;
}

function getIntegrationAuthDedupeKey(notification: AppNotification): string | null {
  if (notification.type !== "warning") return null;
  const title = notification.title.trim();
  const message = notification.message.trim();
  if (!/^Reconnect\s+\S/.test(title)) return null;
  if (!/\bneeds attention in\b/.test(message) || !/\bReconnect or resync\b/.test(message)) {
    return null;
  }
  return `integration_auth:${title.toLowerCase()}`;
}

function getPersistentDedupeKey(notification: AppNotification): string | null {
  return getInputRequiredDedupeKey(notification) || getIntegrationAuthDedupeKey(notification);
}

function collapseDuplicateNotifications(notifications: AppNotification[]): {
  notifications: AppNotification[];
  changed: boolean;
} {
  const newestByDedupeKey = new Map<string, AppNotification>();

  for (const notification of notifications) {
    const dedupeKey = getPersistentDedupeKey(notification);
    if (!dedupeKey) continue;
    const existing = newestByDedupeKey.get(dedupeKey);
    if (!existing || notification.createdAt > existing.createdAt) {
      newestByDedupeKey.set(dedupeKey, notification);
    }
  }

  if (newestByDedupeKey.size === 0) {
    return { notifications, changed: false };
  }

  const keptDedupeIds = new Set(
    [...newestByDedupeKey.values()].map((notification) => notification.id),
  );
  const collapsed = notifications.filter((notification) => {
    const dedupeKey = getPersistentDedupeKey(notification);
    return !dedupeKey || keptDedupeIds.has(notification.id);
  });

  return {
    notifications: collapsed,
    changed: collapsed.length !== notifications.length,
  };
}

export class NotificationService {
  private notifications: AppNotification[] = [];
  private storePath: string;
  private onEvent?: (event: NotificationEvent) => void;

  constructor(config: NotificationServiceConfig = {}) {
    this.storePath = config.storePath || getNotificationStorePath();
    this.onEvent = config.onEvent;

    // Load notifications synchronously on startup
    const store = loadNotificationStoreSync(this.storePath);
    const collapsed = collapseDuplicateNotifications(store.notifications);
    this.notifications = collapsed.notifications;
    if (collapsed.changed) {
      try {
        saveNotificationStoreSync(
          { version: store.version, notifications: this.notifications },
          this.storePath,
        );
      } catch (error) {
        log.warn("Failed to save deduplicated notification store:", error);
      }
    }
    log.info(`Loaded ${this.notifications.length} notifications from store`);
  }

  /**
   * Get all notifications (sorted by date, newest first)
   */
  list(): AppNotification[] {
    return [...this.notifications].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  /**
   * Add a new notification
   */
  async add(params: AddNotificationParams): Promise<AppNotification> {
    const existing = this.findExistingPersistentNotification(params);
    if (existing) {
      return existing;
    }

    const notification: AppNotification = {
      id: randomUUID(),
      type: params.type,
      title: params.title,
      message: params.message,
      read: false,
      createdAt: Date.now(),
      taskId: params.taskId,
      cronJobId: params.cronJobId,
      workspaceId: params.workspaceId,
      suggestionId: params.suggestionId,
      recommendedDelivery: params.recommendedDelivery,
      companionStyle: params.companionStyle,
    };

    this.notifications.unshift(notification);
    await this.save();

    this.emit({ type: "added", notification });
    return notification;
  }

  private findExistingPersistentNotification(
    params: AddNotificationParams,
  ): AppNotification | null {
    const candidate: AppNotification = {
      id: "",
      type: params.type,
      title: params.title,
      message: params.message,
      read: false,
      createdAt: 0,
      taskId: params.taskId,
      cronJobId: params.cronJobId,
      workspaceId: params.workspaceId,
      suggestionId: params.suggestionId,
      recommendedDelivery: params.recommendedDelivery,
      companionStyle: params.companionStyle,
    };
    const dedupeKey = getPersistentDedupeKey(candidate);
    if (!dedupeKey) {
      return null;
    }
    return (
      this.notifications
        .filter((notification) => {
          return getPersistentDedupeKey(notification) === dedupeKey;
        })
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null
    );
  }

  /**
   * Mark a notification as read
   */
  async markRead(id: string): Promise<AppNotification | null> {
    const notification = this.notifications.find((n) => n.id === id);
    if (!notification) return null;

    notification.read = true;
    await this.save();

    this.emit({ type: "updated", notification });
    return notification;
  }

  /**
   * Mark all notifications as read
   */
  async markAllRead(): Promise<void> {
    const unread = this.notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    for (const n of unread) {
      n.read = true;
    }
    await this.save();

    this.emit({ type: "updated", notifications: this.notifications });
  }

  /**
   * Delete a notification
   */
  async delete(id: string): Promise<boolean> {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index === -1) return false;

    const [removed] = this.notifications.splice(index, 1);
    await this.save();

    this.emit({ type: "removed", notification: removed });
    return true;
  }

  /**
   * Delete all notifications
   */
  async deleteAll(): Promise<void> {
    if (this.notifications.length === 0) return;

    this.notifications = [];
    await this.save();

    this.emit({ type: "cleared" });
  }

  /**
   * Save notifications to disk
   */
  private async save(): Promise<void> {
    const store: NotificationStoreFile = {
      version: 1,
      notifications: this.notifications,
    };
    await saveNotificationStore(store, this.storePath);
  }

  /**
   * Emit an event to listeners
   */
  private emit(event: NotificationEvent): void {
    if (this.onEvent) {
      this.onEvent(event);
    }
  }
}
