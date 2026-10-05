import { useCallback, useEffect, useState } from "react";
import type { Task, TaskEvent } from "../../shared/types";
import { shouldEndOptimisticFollowUp, shouldEndOptimisticFollowUpFromTask } from "../utils/task-working-state";

/** IPC may outlive the turn. Its pending promise must not keep Stop alive. */
export function usePendingTaskDispatches(key: string, task: Task | null | undefined, events: TaskEvent[]) {
  const [state, setState] = useState(() => ({ key, pending: new Map<symbol, number>() }));
  const clear = useCallback(() => {
    setState({ key, pending: new Map() });
  }, [key]);
  const begin = useCallback(() => {
    const id = Symbol("dispatch");
    const startedAt = Date.now();
    setState((s) => ({ key, pending: new Map(s.key === key ? s.pending : []).set(id, startedAt) }));
    return () => setState((s) => {
      if (s.key !== key || !s.pending.has(id)) return s;
      const pending = new Map(s.pending);
      pending.delete(id);
      return { key, pending };
    });
  }, [key]);
  useEffect(() => {
    setState((s) => {
      if (s.key !== key) return { key, pending: new Map() };
      if (!task || !s.pending.size) return s;
      const pending = new Map(s.pending);
      for (const [id, startedAt] of pending) {
        if (shouldEndOptimisticFollowUpFromTask(task, startedAt) || events.some(
          (event) => event.taskId === task.id && shouldEndOptimisticFollowUp(event, startedAt),
        )) pending.delete(id);
      }
      return pending.size === s.pending.size ? s : { key, pending };
    });
  }, [key, task, events]);
  return { count: state.key === key ? state.pending.size : 0, begin, clear };
}
