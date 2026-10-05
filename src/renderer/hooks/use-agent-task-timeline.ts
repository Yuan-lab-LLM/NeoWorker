import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskEvent, TaskTimelinePageCursor } from "../../shared/types";
import {
  loadTaskTimelineWithLegacyFallback,
  mergeTaskEventsByIdentity,
  reconcileTaskDeliveryEvents,
} from "../utils/task-event-stream";

/** Each open expert owns its timeline, independent of the team's summary buffer. */
export function useAgentTaskTimeline(task: Task | null, liveEvents: TaskEvent[]) {
  const taskId = task?.id ?? null;
  const generation = useRef(0);
  const busy = useRef(false);
  const cursor = useRef<TaskTimelinePageCursor | null>(null);
  const [state, setState] = useState({
    taskId,
    events: [] as TaskEvent[],
    hasMore: false,
    loading: false,
    error: null as string | null,
  });

  const fetchPage = useCallback(
    async (older: boolean, token: number) => {
      if (!taskId || busy.current) return;
      busy.current = true;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await loadTaskTimelineWithLegacyFallback({
          request: {
            taskId,
            cursor: older ? cursor.current : null,
            limit: 160,
            byteLimit: 512 * 1024,
            singleEventByteLimit: 64 * 1024,
          },
          getTaskTimelinePage: window.electronAPI.getTaskTimelinePage,
          getTaskEvents: window.electronAPI.getTaskEvents,
        });
        if (token !== generation.current) return;
        cursor.current = result.timelinePage?.nextCursor ?? null;
        setState((s) => ({
          taskId,
          events: mergeTaskEventsByIdentity(
            s.taskId === taskId ? s.events : [],
            result.events.filter((e) => e.taskId === taskId),
          ),
          hasMore: result.timelinePage?.hasMoreHistory === true,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (token === generation.current)
          setState((s) => ({ ...s, loading: false, error: String(error) }));
      } finally {
        if (token === generation.current) busy.current = false;
      }
    },
    [taskId],
  );

  useEffect(() => {
    const token = ++generation.current;
    busy.current = false;
    cursor.current = null;
    setState({ taskId, events: [], hasMore: false, loading: true, error: null });
    if (!taskId) return;
    // Subscribe before loading so events produced during the initial read survive.
    const unsubscribe = window.electronAPI.onTaskEvent?.((event: TaskEvent) => {
      if (generation.current !== token || event.taskId !== taskId) return;
      setState((s) => ({ ...s, events: mergeTaskEventsByIdentity(s.events, [event]) }));
    });
    void fetchPage(false, token);
    return () => {
      generation.current++;
      unsubscribe?.();
    };
  }, [taskId, fetchPage]);

  const events = useMemo(
    () =>
      reconcileTaskDeliveryEvents(
        task,
        mergeTaskEventsByIdentity(
          state.taskId === taskId ? state.events : [],
          liveEvents.filter((e) => e.taskId === taskId),
        ),
      ),
    [task, taskId, state.taskId, state.events, liveEvents],
  );
  const loadMore = useCallback(
    () => fetchPage(cursor.current !== null, generation.current),
    [fetchPage],
  );
  const loadDetail = useCallback(
    async (eventId: string, requestedTaskId: string) => {
      if (requestedTaskId !== taskId) return;
      const token = generation.current;
      const result = await window.electronAPI.getTaskEventDetail({
        taskId: requestedTaskId,
        eventId,
      });
      if (token === generation.current && result.event?.taskId === taskId) {
        setState((s) => ({ ...s, events: mergeTaskEventsByIdentity(s.events, [result.event!]) }));
      }
    },
    [taskId],
  );
  return {
    events,
    hasMore: state.taskId === taskId && state.hasMore,
    loading: state.taskId !== taskId || state.loading,
    error: state.taskId === taskId ? state.error : null,
    loadMore,
    loadDetail,
  };
}
