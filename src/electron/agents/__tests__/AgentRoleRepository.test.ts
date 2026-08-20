import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const Database = module.default;
      const probe = new Database(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("AgentRoleRepository heartbeat policy compatibility", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: import("../../database/schema").DatabaseManager;
  let agentRoleRepo: import("../AgentRoleRepository").AgentRoleRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-agent-role-"));
    previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = tmpDir;

    const [{ DatabaseManager }, { AgentRoleRepository }] = await Promise.all([
      import("../../database/schema"),
      import("../AgentRoleRepository"),
    ]);

    manager = new DatabaseManager();
    agentRoleRepo = new AgentRoleRepository(manager.getDatabase());
  });

  afterEach(() => {
    manager?.close();
    if (previousUserDataDir === undefined) {
      delete process.env.NEOWORKER_USER_DATA_DIR;
    } else {
      process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persists heartbeat policy metadata for downstream compatibility", () => {
    const created = agentRoleRepo.create({
      name: "ops-planner",
      displayName: "Ops Planner",
      capabilities: ["plan"],
      heartbeatPolicy: {
        enabled: false,
        cadenceMinutes: 30,
        staggerOffsetMinutes: 5,
        dispatchCooldownMinutes: 90,
        maxDispatchesPerDay: 3,
        profile: "operator",
        activeHours: {
          startHour: 9,
          endHour: 17,
          timezone: "UTC",
        },
        primaryCategories: ["planning"],
        proactiveTasks: [
          {
            title: "Review queue health",
            prompt: "Check whether the queue is growing faster than work is closing.",
          },
        ],
      },
    });

    expect(created.heartbeatPolicy).toMatchObject({
      enabled: false,
      cadenceMinutes: 30,
      staggerOffsetMinutes: 5,
      dispatchCooldownMinutes: 90,
      maxDispatchesPerDay: 3,
      profile: "operator",
      primaryCategories: ["planning"],
    });
    expect(created.heartbeatPolicy?.proactiveTasks).toHaveLength(1);

    const persisted = agentRoleRepo.findById(created.id);
    expect(persisted?.heartbeatPolicy?.primaryCategories).toEqual(["planning"]);
    expect(persisted?.heartbeatPolicy?.proactiveTasks).toHaveLength(1);

    const soul = JSON.parse(persisted?.soul || "{}") as Record<string, unknown>;
    expect(soul.automationProfileMetadata).toMatchObject({
      primaryCategories: ["planning"],
    });
  });
});
