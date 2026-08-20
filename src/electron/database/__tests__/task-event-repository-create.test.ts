import { describe, expect, it } from "vitest";
import { TaskEventRepository } from "../repositories";

class FakeCreateTaskEventDb {
  insertArgs: unknown[] | null = null;
  updateArgs: unknown[] | null = null;

  prepare(sql: string): { run: (...args: unknown[]) => void } {
    if (sql.includes("INSERT INTO task_events")) {
      return {
        run: (...args: unknown[]) => {
          this.insertArgs = args;
        },
      };
    }
    if (sql.includes("UPDATE task_events")) {
      return {
        run: (...args: unknown[]) => {
          this.updateArgs = args;
        },
      };
    }
    throw new Error(`Unexpected SQL in create test: ${sql}`);
  }
}

describe("TaskEventRepository.create", () => {
  it("sanitizes timeline payloads before storage and returns the stored shape", () => {
    const db = new FakeCreateTaskEventDb();
    const repo = new TaskEventRepository(db as never);
    const screenshotBase64 = "a".repeat(2_000_000);

    const event = repo.create({
      id: "event-1",
      taskId: "task-1",
      timestamp: 1000,
      type: "assistant_message",
      payload: {
        message: "captured screenshot",
        result: {
          screenshotBase64,
          metadata: { width: 1440, height: 900 },
        },
      },
    });

    expect(db.insertArgs).not.toBeNull();
    const storedPayload = JSON.parse(String(db.insertArgs![4])) as {
      result: Record<string, unknown>;
    };

    expect(storedPayload.result.screenshotBase64).toBeUndefined();
    expect(storedPayload.result.screenshotBase64Omitted).toBe(true);
    expect(storedPayload.result.screenshotBase64OriginalChars).toBe(screenshotBase64.length);
    expect((event.payload as typeof storedPayload).result.screenshotBase64Omitted).toBe(true);
  });

  it("sanitizes payload updates before rewriting task events", () => {
    const db = new FakeCreateTaskEventDb();
    const repo = new TaskEventRepository(db as never);
    const imageBase64 = "b".repeat(1_000_000);

    repo.updatePayloadById("event-1", {
      result: {
        imageBase64,
      },
    });

    expect(db.updateArgs).not.toBeNull();
    const storedPayload = JSON.parse(String(db.updateArgs![0])) as {
      result: Record<string, unknown>;
    };
    expect(storedPayload.result.imageBase64).toBeUndefined();
    expect(storedPayload.result.imageBase64Omitted).toBe(true);
    expect(storedPayload.result.imageBase64OriginalChars).toBe(imageBase64.length);
  });
});
