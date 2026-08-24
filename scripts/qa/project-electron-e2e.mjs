import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "../..");
const reportPath = path.join(appRoot, "tmp/neoworker-electron-e2e-latest.json");
const screenshotPath = path.join(appRoot, "tmp/neoworker-project-e2e.png");
const isolatedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "neoworker-electron-e2e-"));
const workspaceOnePath = path.join(isolatedRoot, "workspace-primary");
const workspaceTwoPath = path.join(isolatedRoot, "workspace-secondary");
const startedAt = Date.now();
const checks = [];
let electronApp;
let page;

function record(name, detail) {
  checks.push({ name, passed: true, detail });
}

async function writeReport(passed, error) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(
    reportPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      passed,
      durationMs: Date.now() - startedAt,
      isolatedUserData: true,
      checks,
      ...(error ? { error } : {}),
    }, null, 2)}\n`,
  );
}

try {
  await Promise.all([
    fs.mkdir(workspaceOnePath, { recursive: true }),
    fs.mkdir(workspaceTwoPath, { recursive: true }),
    fs.mkdir(path.dirname(screenshotPath), { recursive: true }),
  ]);

  electronApp = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ELECTRON_RUN_AS_NODE: "",
      NEOWORKER_USER_DATA_DIR: path.join(isolatedRoot, "user-data"),
      NEOWORKER_STARTUP_QUIET: "1",
      NEOWORKER_BACKGROUND_AUTOSTART: "0",
      NEOWORKER_DISABLE_AUTO_UPDATE: "1",
    },
    timeout: 45_000,
  });

  page = await electronApp.firstWindow({ timeout: 45_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(
    () => typeof window.electronAPI?.createProjectWithWorkspace === "function",
    undefined,
    { timeout: 30_000 },
  );
  record("electron_preload_ready", "Electron renderer exposed the real preload API.");

  const safetyConsent = page.getByText("是，我理解", { exact: true });
  const safetyNoticeVisible = await safetyConsent
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (safetyNoticeVisible) {
    await safetyConsent.click();
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await page.waitForTimeout(700);
    record("isolated_safety_consent", "Accepted the safety notice in the disposable QA profile.");
  }

  const workspaceInput = (name, workspacePath) => ({
    name,
    path: workspacePath,
    permissions: { read: true, write: true, delete: true, network: false, shell: false },
  });
  const [primaryWorkspace, secondaryWorkspace] = await Promise.all([
    page.evaluate(
      (input) => window.electronAPI.createWorkspace(input),
      workspaceInput("QA Primary", workspaceOnePath),
    ),
    page.evaluate(
      (input) => window.electronAPI.createWorkspace(input),
      workspaceInput("QA Secondary", workspaceTwoPath),
    ),
  ]);

  const projectName = `NeoWorker Release QA ${Date.now()}`;
  const creation = await page.evaluate(
    (input) => window.electronAPI.createProjectWithWorkspace(input),
    {
      name: projectName,
      description: "Verify project context, workspace integrity, and release UI.",
      workspaceId: primaryWorkspace.id,
    },
  );
  assert.equal(creation.project.name, projectName);
  assert.equal(creation.link.workspaceId, primaryWorkspace.id);
  assert.equal(creation.link.isPrimary, true);
  record("atomic_project_creation", "Project and primary workspace link were returned together.");

  const invalidProject = await page.evaluate(
    (input) => window.electronAPI.createProjectWithWorkspace(input),
    {
      name: "Workspace integrity sentinel",
      description: "Used to verify invalid project/workspace combinations are rejected.",
      workspaceId: primaryWorkspace.id,
    },
  );
  const integrityError = await page.evaluate(
    async ({ projectId, workspaceId }) => {
      try {
        await window.electronAPI.createTask({
          title: "Must not start",
          prompt: "This request must be rejected before execution.",
          projectId,
          workspaceId,
        });
        return "";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
    { projectId: invalidProject.project.id, workspaceId: secondaryWorkspace.id },
  );
  assert.match(integrityError, /not linked to this project/i);
  record("project_workspace_integrity", "An unlinked workspace was rejected before task execution.");

  await page.getByRole("button", { name: "项目", exact: true }).click();
  await page.getByRole("heading", { name: "项目", exact: true }).waitFor({ timeout: 20_000 });
  const projectCard = page.locator("article").filter({ hasText: projectName }).first();
  await projectCard.getByRole("button", { name: "查看详情", exact: true }).click();
  const projectTabs = page.getByLabel("项目页面");
  await projectTabs.getByRole("button", { name: "概览", exact: true }).waitFor();
  for (const tabName of ["概览", "任务", "文件", "产物", "团队"]) {
    await projectTabs.getByRole("button", { name: tabName, exact: true }).waitFor();
  }
  record("project_workspace_tabs", "All five project pages rendered in the packaged renderer.");

  const linkForm = page.locator(".project-workspace-link-form");
  await linkForm.locator("select").selectOption(secondaryWorkspace.id);
  await linkForm.getByRole("button", { name: "关联工作区", exact: true }).click();
  const secondaryLink = page
    .locator(".project-workspace-managed-links span")
    .filter({ hasText: "QA Secondary" });
  await secondaryLink.getByRole("button", { name: "设为主要", exact: true }).click();
  const primaryLink = page
    .locator(".project-workspace-managed-links span")
    .filter({ hasText: "QA Primary" });
  await primaryLink.getByRole("button", { name: /移除/ }).click();

  await page.waitForFunction(
    async ({ projectId, workspaceId }) => {
      const links = await window.electronAPI.listProjectWorkspaces(projectId);
      return links.length === 1 && links[0]?.workspaceId === workspaceId && links[0]?.isPrimary;
    },
    { projectId: creation.project.id, workspaceId: secondaryWorkspace.id },
    { timeout: 10_000 },
  );
  await primaryLink.waitFor({ state: "detached", timeout: 10_000 });

  const finalLinks = await page.evaluate(
    (projectId) => window.electronAPI.listProjectWorkspaces(projectId),
    creation.project.id,
  );
  assert.deepEqual(
    finalLinks.map((link) => ({ workspaceId: link.workspaceId, isPrimary: link.isPrimary })),
    [{ workspaceId: secondaryWorkspace.id, isPrimary: true }],
  );
  record("workspace_management", "Link, change-primary, and unlink completed through the UI.");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  record("visual_evidence", path.relative(appRoot, screenshotPath));
  await writeReport(true);
  console.log(`NeoWorker Electron E2E PASS (${Date.now() - startedAt}ms)`);
  console.log(`Report: ${reportPath}`);
  console.log(`Screenshot: ${screenshotPath}`);
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  if (page) {
    const rendererText = await page.locator("body").innerText().catch(() => "");
    checks.push({
      name: "failure_renderer_state",
      passed: false,
      detail: rendererText.slice(0, 3000),
    });
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
  }
  await writeReport(false, message);
  console.error(`NeoWorker Electron E2E FAIL\n${message}`);
  process.exitCode = 1;
} finally {
  if (electronApp) await electronApp.close().catch(() => undefined);
  await fs.rm(isolatedRoot, { recursive: true, force: true });
}
