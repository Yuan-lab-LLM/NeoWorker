import { describe, expect, it } from "vitest";
import { TaskCreateSchema } from "../validation";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "44444444-4444-4444-8444-444444444444";

describe("TaskCreateSchema project and session context", () => {
  it("preserves explicit project, company, and inherited session IDs", () => {
    const parsed = TaskCreateSchema.parse({
      title: "项目任务",
      prompt: "继续完成项目工作",
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      sessionId: SESSION_ID,
    });

    expect(parsed).toMatchObject({
      projectId: PROJECT_ID,
      companyId: COMPANY_ID,
      sessionId: SESSION_ID,
    });
  });

  it("rejects malformed context IDs instead of silently accepting cross-context data", () => {
    expect(() =>
      TaskCreateSchema.parse({
        title: "项目任务",
        prompt: "继续完成项目工作",
        workspaceId: WORKSPACE_ID,
        projectId: "not-a-project-id",
      }),
    ).toThrow();
  });
});
