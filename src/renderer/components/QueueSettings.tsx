import { useState, useEffect } from "react";
import { ListOrdered } from "lucide-react";
import {
  QueueSettings as QueueSettingsType,
  DEFAULT_QUEUE_SETTINGS,
  MAX_QUEUE_TASK_TIMEOUT_MINUTES,
} from "../../shared/types";
import { translate, useLanguage } from "../i18n";

export function QueueSettings() {
  useLanguage();
  const [settings, setSettings] = useState<QueueSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loaded = await window.electronAPI.getQueueSettings();
      setSettings(loaded || DEFAULT_QUEUE_SETTINGS);
    } catch (error) {
      console.error("Failed to load queue settings:", error);
      // Fall back to defaults if loading fails
      setSettings(DEFAULT_QUEUE_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      await window.electronAPI.saveQueueSettings(settings);
    } catch (error) {
      console.error("Failed to save queue settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_QUEUE_SETTINGS);
  };

  if (loading || !settings) {
    return (
      <div className="settings-loading">
        {translate("queueSettings.loading", "Loading queue settings...")}
      </div>
    );
  }

  const timeoutHours = Math.max(
    1,
    Math.round(settings.taskTimeoutMinutes / 60),
  );

  return (
    <div className="automation-page queue-settings-page">
      <div className="automation-page-intro">
        <div className="automation-page-header">
          <div className="automation-page-heading">
            <span className="automation-page-heading-icon" aria-hidden="true">
              <ListOrdered size={18} />
            </span>
            <h3>{translate("queueSettings.title", "Task Queue")}</h3>
            <p className="settings-description">
              {translate(
                "queueSettings.description",
                "Set concurrency and recovery limits for background tasks.",
              )}
            </p>
          </div>
        </div>
      </div>
      {/* Parallel Execution Section */}
      <div className="settings-section queue-config-card">
        <h3>
          {translate("queueSettings.parallel.title", "Parallel Task Execution")}
        </h3>
        <p className="settings-description">
          {translate(
            "queueSettings.parallel.description",
            "Control how many tasks can run simultaneously. Higher values allow more parallel work but use more system resources.",
          )}
        </p>

        <div className="settings-slider-group">
          <label>
            {translate(
              "queueSettings.parallel.maxConcurrent",
              "Maximum concurrent tasks:",
            )}
          </label>
          <div className="slider-with-value">
            <input
              type="range"
              className="settings-slider"
              min={1}
              max={20}
              value={settings.maxConcurrentTasks}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxConcurrentTasks: parseInt(e.target.value),
                })
              }
            />
            <span className="slider-value">{settings.maxConcurrentTasks}</span>
          </div>
        </div>

        <p className="settings-hint">
          {translate(
            "queueSettings.parallel.defaultHint",
            "Default: 8. Tasks beyond this limit will be queued and start automatically when a slot becomes available.",
          )}
        </p>
      </div>

      <div className="settings-section queue-config-card">
        <h3>
          {translate("queueSettings.watchdog.title", "Task Session Watchdog")}
        </h3>
        <p className="settings-description">
          {translate(
            "queueSettings.watchdog.description",
            "This timeout is a last-resort watchdog for genuinely stuck task sessions. It is not a per-step or per-message limit.",
          )}
        </p>

        <div className="settings-slider-group">
          <label>
            {translate("queueSettings.watchdog.timeout", "Watchdog timeout:")}
          </label>
          <div className="slider-with-value">
            <input
              type="range"
              className="settings-slider"
              min={1}
              max={24}
              value={timeoutHours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  taskTimeoutMinutes: Math.min(
                    MAX_QUEUE_TASK_TIMEOUT_MINUTES,
                    parseInt(e.target.value) * 60,
                  ),
                })
              }
            />
            <span className="slider-value">
              {translate(
                timeoutHours === 1
                  ? "queueSettings.watchdog.hour"
                  : "queueSettings.watchdog.hours",
                timeoutHours === 1 ? "{count} hour" : "{count} hours",
                { count: timeoutHours },
              )}
            </span>
          </div>
        </div>

        <p className="settings-hint">
          {translate(
            "queueSettings.watchdog.defaultHint",
            "Default: 24 hours. Long-running interactive tasks can continue across multiple follow-ups without being cut off by the old 60-minute timeout.",
          )}
        </p>
      </div>

      {/* Queue Behavior Info Section */}
      <div className="settings-section queue-behavior-card">
        <h3>{translate("queueSettings.behavior.title", "Queue Behavior")}</h3>
        <p className="settings-description">
          {translate(
            "queueSettings.behavior.description",
            "When you create more tasks than the concurrency limit allows, extra tasks are placed in a queue.",
          )}
        </p>

        <ul className="settings-info-list">
          <li>
            <strong>
              {translate("queueSettings.behavior.fifo.title", "FIFO Order:")}
            </strong>{" "}
            {translate(
              "queueSettings.behavior.fifo.description",
              "Tasks are processed in the order they were created, first-in, first-out.",
            )}
          </li>
          <li>
            <strong>
              {translate(
                "queueSettings.behavior.autoStart.title",
                "Auto-Start:",
              )}
            </strong>{" "}
            {translate(
              "queueSettings.behavior.autoStart.description",
              "Queued tasks automatically start when a running task completes.",
            )}
          </li>
          <li>
            <strong>
              {translate(
                "queueSettings.behavior.persistence.title",
                "Persistence:",
              )}
            </strong>{" "}
            {translate(
              "queueSettings.behavior.persistence.description",
              "Queued tasks are saved and will resume after app restart.",
            )}
          </li>
          <li>
            <strong>
              {translate(
                "queueSettings.behavior.cancel.title",
                "Cancel Anytime:",
              )}
            </strong>{" "}
            {translate(
              "queueSettings.behavior.cancel.description",
              "You can cancel queued tasks from the queue panel before they start.",
            )}
          </li>
          <li>
            <strong>
              {translate(
                "queueSettings.behavior.recovery.title",
                "Stuck-Task Recovery:",
              )}
            </strong>{" "}
            {translate(
              "queueSettings.behavior.recovery.description",
              "The session watchdog only exists to clean up runs that hang for an unusually long time.",
            )}
          </li>
        </ul>
      </div>

      {/* Actions */}
      <div className="settings-actions">
        <button
          className="button-secondary"
          onClick={handleReset}
          disabled={saving}
        >
          {translate("queueSettings.actions.reset", "Reset to Default")}
        </button>
        <button
          className="button-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? translate("queueSettings.actions.saving", "Saving...")
            : translate("queueSettings.actions.save", "Save Settings")}
        </button>
      </div>
    </div>
  );
}
