import { X } from "lucide-react";
import type { ReplayControls, ReplaySpeed } from "../hooks/useReplayMode";
import { translate, useLanguage } from "../i18n";

const SPEEDS: ReplaySpeed[] = [1, 2, 5, 10];

interface ReplayControlsBarProps {
  controls: ReplayControls;
}

export function ReplayControlsBar({ controls }: ReplayControlsBarProps) {
  useLanguage();
  const t = translate;
  const {
    isPlaying,
    replayIndex,
    totalEvents,
    speed,
    pause,
    resume,
    reset,
    startReplay,
    setSpeed,
    hideControls,
  } = controls;

  const isComplete = replayIndex >= totalEvents;
  const progress = totalEvents > 0 ? (replayIndex / totalEvents) * 100 : 0;

  return (
    <div className="replay-controls-bar">
      <div className="replay-controls-progress-track">
        <div
          className="replay-controls-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="replay-controls-row">
        <div className="replay-controls-left">
          <button
            className="replay-btn replay-btn-reset"
            onClick={reset}
            title={t("replay.resetBeginning", "Reset to beginning")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.65" />
            </svg>
          </button>

          {isComplete ? (
            <button
              className="replay-btn replay-btn-play"
              onClick={startReplay}
              title={t("replay.again", "Replay again")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{t("replay.replay", "Replay")}</span>
            </button>
          ) : isPlaying ? (
            <button
              className="replay-btn replay-btn-play"
              onClick={pause}
              title={t("common.pause", "Pause")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              <span>{t("common.pause", "Pause")}</span>
            </button>
          ) : (
            <button
              className="replay-btn replay-btn-play"
              onClick={resume}
              title={t("common.play", "Play")}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>{t("common.play", "Play")}</span>
            </button>
          )}
        </div>

        <div className="replay-controls-center">
          <span className="replay-step-counter">
            {t("replay.stepCounter", "Step {current} / {total}", {
              current: replayIndex,
              total: totalEvents,
            })}
          </span>
        </div>

        <div className="replay-controls-right">
          <span className="replay-speed-label">
            {t("replay.speed", "Speed")}
          </span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={`replay-speed-btn ${speed === s ? "active" : ""}`}
              onClick={() => setSpeed(s)}
              title={t("replay.speedTitle", "{speed}× speed", { speed: s })}
            >
              {s}×
            </button>
          ))}
          <button
            type="button"
            className="replay-btn replay-btn-hide"
            onClick={hideControls}
            title={t("replay.hideControls", "Hide replay controls")}
            aria-label={t("replay.hideControls", "Hide replay controls")}
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
