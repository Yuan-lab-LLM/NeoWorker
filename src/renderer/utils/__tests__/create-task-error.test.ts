import { beforeEach, describe, expect, it } from "vitest";
import { applyPersistedLanguage } from "../../i18n";
import {
  formatCreateTaskError,
  unwrapCreateTaskError,
} from "../create-task-error";

describe("create task error presentation", () => {
  beforeEach(() => {
    applyPersistedLanguage("zh-CN");
  });

  it("removes the Electron IPC wrapper", () => {
    expect(
      unwrapCreateTaskError(
        new Error(
          "Error invoking remote method 'task:create': Error: The selected workspace is not linked to this project.",
        ),
      ),
    ).toBe("The selected workspace is not linked to this project.");
  });

  it("turns the workspace/project mismatch into actionable Chinese", () => {
    expect(
      formatCreateTaskError(
        "Error invoking remote method 'task:create': Error: The selected workspace is not linked to this project.",
      ),
    ).toBe("当前工作区未关联到所选项目，请重新选择工作区或项目后再试。");
  });
});
