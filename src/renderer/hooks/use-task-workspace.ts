import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Task, Workspace } from "../../shared/types";

export type TaskWorkspaceError = "missing" | "unavailable" | "failed" | "timeout";
export const TASK_WORKSPACE_LOAD_TIMEOUT_MS = 15_000;

function classifyWorkspaceError(error: unknown): TaskWorkspaceError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("WORKSPACE_PATH_UNAVAILABLE:missing")) return "missing";
  if (message.includes("WORKSPACE_PATH_UNAVAILABLE:")) return "unavailable";
  return "failed";
}

/** Resolve only the selected conversation's folder; never replace a missing folder. */
export function useTaskWorkspace({ task, workspace, setWorkspace, requestSequence, remote }: {
  task: Pick<Task, "id" | "workspaceId"> | undefined;
  workspace: Workspace | null;
  setWorkspace: Dispatch<SetStateAction<Workspace | null>>;
  requestSequence: RefObject<number>;
  remote: boolean;
}) {
  const taskId = task?.id;
  const workspaceId = task?.workspaceId;
  const currentWorkspaceId = workspace?.id;
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<{
    taskId: string; workspaceId: string; error: TaskWorkspaceError;
  } | null>(null);
  const retry = useCallback(() => {
    setFailure(null);
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    if (remote || !taskId || !workspaceId || currentWorkspaceId === workspaceId) return;
    const sequence = ++requestSequence.current;
    let settled = false;
    const isCurrent = () => !settled && sequence === requestSequence.current;
    setFailure(null);
    const fail = (error: TaskWorkspaceError) => {
      if (!isCurrent()) return;
      settled = true;
      setFailure({ taskId, workspaceId, error });
    };
    const timeout = setTimeout(() => fail("timeout"), TASK_WORKSPACE_LOAD_TIMEOUT_MS);
    void (async () => {
      try {
        const resolved = await window.electronAPI.selectWorkspace(workspaceId);
        if (!isCurrent()) return;
        if (!resolved) {
          fail("missing");
        } else if (resolved.id !== workspaceId) {
          fail("failed");
        } else {
          settled = true;
          setWorkspace(resolved);
        }
      } catch (error) {
        fail(classifyWorkspaceError(error));
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      settled = true;
      clearTimeout(timeout);
    };
  }, [taskId, workspaceId, currentWorkspaceId, remote, attempt, requestSequence, setWorkspace]);

  const error = !remote && currentWorkspaceId !== workspaceId &&
    failure?.taskId === taskId && failure?.workspaceId === workspaceId
    ? failure?.error ?? null : null;
  return { error, retry };
}
