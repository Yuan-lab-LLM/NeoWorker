import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { TaskEvent, Task } from "../../shared/types";

export type ReplaySpeed = 1 | 2 | 5 | 10;

export interface ReplayControls {
  isReplayMode: boolean;
  isPlaying: boolean;
  areControlsVisible: boolean;
  replayIndex: number;
  totalEvents: number;
  speed: ReplaySpeed;
  replayEvents: TaskEvent[];
  startReplay: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  hideControls: () => void;
  showControls: () => void;
  setSpeed: (s: ReplaySpeed) => void;
}

function isTerminalTask(task: Task | undefined): boolean {
  return (
    task?.status === "completed" ||
    task?.status === "failed" ||
    task?.status === "cancelled"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getReplayStartIndex(events: TaskEvent[]): number {
  // Never enter replay with an empty projection when events are available.
  // The zero-event frame briefly strips the task view of all derived state and
  // can leave a large session rendering as an empty window while React rebuilds
  // the timeline. The first event is the real beginning of the replay.
  return events.length > 0 ? 1 : 0;
}

export function useReplayMode(
  events: TaskEvent[],
  task: Task | undefined,
): ReplayControls {
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [areControlsVisible, setAreControlsVisible] = useState(true);
  const [replayIndex, setReplayIndex] = useState(0);
  const [speed, setSpeedState] = useState<ReplaySpeed>(1);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventsRef = useRef(events);
  const speedRef = useRef(speed);
  const replayIndexRef = useRef(replayIndex);
  const isPlayingRef = useRef(isPlaying);
  const isReplayModeRef = useRef(isReplayMode);

  eventsRef.current = events;
  speedRef.current = speed;
  replayIndexRef.current = replayIndex;
  isPlayingRef.current = isPlaying;
  isReplayModeRef.current = isReplayMode;

  // Reset replay when the task changes (different task selected)
  const taskId = task?.id;
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsReplayMode(false);
    setIsPlaying(false);
    setAreControlsVisible(true);
    setReplayIndex(0);
    isReplayModeRef.current = false;
    isPlayingRef.current = false;
    replayIndexRef.current = 0;
  }, [taskId]);

  // Advance replay index on a timer
  const scheduleNext = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const currentIndex = replayIndexRef.current;
    const currentEvents = eventsRef.current;

    if (currentIndex >= currentEvents.length) {
      // Replay complete
      setIsPlaying(false);
      return;
    }

    let delay: number;
    if (currentIndex === 0) {
      delay = 300;
    } else {
      const prev = currentEvents[currentIndex - 1];
      const curr = currentEvents[currentIndex];
      const rawDelay =
        typeof prev?.timestamp === "number" &&
        typeof curr?.timestamp === "number"
          ? curr.timestamp - prev.timestamp
          : 200;
      delay = clamp(rawDelay / speedRef.current, 50, 2000);
    }

    timerRef.current = setTimeout(() => {
      setReplayIndex((prev) => {
        const next = Math.min(prev + 1, eventsRef.current.length);
        replayIndexRef.current = next;
        if (isPlayingRef.current && next < eventsRef.current.length) {
          scheduleNext();
        } else if (next >= eventsRef.current.length) {
          setIsPlaying(false);
          isPlayingRef.current = false;
        }
        return next;
      });
    }, delay);
  }, []);

  // When isPlaying turns on, kick off the timer
  useEffect(() => {
    if (isPlaying) {
      scheduleNext();
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, scheduleNext]);

  // When speed changes mid-play, the next scheduled tick will read the updated speedRef
  // No additional action needed

  const startReplay = useCallback(() => {
    if (!isTerminalTask(task)) return;
    const initialIndex = getReplayStartIndex(eventsRef.current);
    if (initialIndex === 0) return;
    setReplayIndex(initialIndex);
    replayIndexRef.current = initialIndex;
    setIsReplayMode(true);
    setIsPlaying(true);
    setAreControlsVisible(true);
    isReplayModeRef.current = true;
    isPlayingRef.current = true;
  }, [task]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const resume = useCallback(() => {
    if (!isReplayModeRef.current) return;
    if (replayIndexRef.current >= eventsRef.current.length) return;
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const initialIndex = getReplayStartIndex(eventsRef.current);
    setReplayIndex(initialIndex);
    replayIndexRef.current = initialIndex;
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  const setSpeed = useCallback((s: ReplaySpeed) => {
    setSpeedState(s);
    speedRef.current = s;
  }, []);

  const hideControls = useCallback(() => {
    setAreControlsVisible(false);
  }, []);

  const showControls = useCallback(() => {
    setAreControlsVisible(true);
  }, []);

  const replayEvents = useMemo(
    () => (isReplayMode ? events.slice(0, replayIndex) : events),
    [isReplayMode, events, replayIndex],
  );

  return {
    isReplayMode,
    isPlaying,
    areControlsVisible,
    replayIndex,
    totalEvents: events.length,
    speed,
    replayEvents,
    startReplay,
    pause,
    resume,
    reset,
    hideControls,
    showControls,
    setSpeed,
  };
}
