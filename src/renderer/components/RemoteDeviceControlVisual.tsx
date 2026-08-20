import { Bell, Laptop, Monitor, Sparkles } from "lucide-react";
import { translate, useLanguage } from "../i18n";

export function RemoteDeviceControlVisual() {
  useLanguage();
  const t = translate;

  return (
    <section
      className="remote-device-visual"
      aria-label={t(
        "remoteDeviceVisual.aria",
        "Remote device control overview",
      )}
    >
      <div className="remote-device-visual-hero" aria-hidden="true">
        <div className="remote-device-laptop">
          <div className="remote-device-laptop-screen">
            <span />
            <span />
            <span />
          </div>
          <div className="remote-device-laptop-base" />
        </div>
        <div className="remote-device-connection-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="remote-device-node">
          <Monitor size={26} strokeWidth={1.7} />
        </div>
      </div>

      <div className="remote-device-visual-body">
        <h3>
          {t("remoteDeviceVisual.title", "Control other devices from this Mac")}
        </h3>
        <p>
          {t(
            "remoteDeviceVisual.description",
            "Connect another NeoWorker device, then start and monitor work from here.",
          )}
        </p>

        <div className="remote-device-visual-points">
          <div className="remote-device-visual-point">
            <Laptop size={18} strokeWidth={1.8} />
            <div>
              <strong>
                {t(
                  "remoteDeviceVisual.pickUp.title",
                  "Pick up where you left off",
                )}
              </strong>
              <span>
                {t(
                  "remoteDeviceVisual.pickUp.description",
                  "Open remote tasks and continue the thread from this device.",
                )}
              </span>
            </div>
          </div>
          <div className="remote-device-visual-point">
            <Bell size={18} strokeWidth={1.8} />
            <div>
              <strong>
                {t("remoteDeviceVisual.loop.title", "Stay in the loop")}
              </strong>
              <span>
                {t(
                  "remoteDeviceVisual.loop.description",
                  "See status, approvals, alerts, and task history for connected machines.",
                )}
              </span>
            </div>
          </div>
          <div className="remote-device-visual-point">
            <Sparkles size={18} strokeWidth={1.8} />
            <div>
              <strong>
                {t(
                  "remoteDeviceVisual.remoteStart.title",
                  "Start something remotely",
                )}
              </strong>
              <span>
                {t(
                  "remoteDeviceVisual.remoteStart.description",
                  "Send a task to a Mac mini, workstation, or server with its own tools.",
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
