import { installBrowserElectronApi } from "../../../src/renderer/browser-electron-api";
installBrowserElectronApi();
const key = "personal-assistant-qa-fixture-v1";
const read = () =>
  JSON.parse(
    localStorage.getItem(key) || '{"agents":[],"environments":[],"sessions":[],"workspaces":[]}',
  );
const write = (data) => localStorage.setItem(key, JSON.stringify(data));
const api = window.electronAPI;
const browserCreateTask = api.createTask;
Object.assign(api, {
  listManagedAgents: async () => read().agents.map((item) => item.agent),
  getManagedAgent: async (id) => {
    const item = read().agents.find((item) => item.agent.id === id);
    return item ? { agent: item.agent, currentVersion: item.version } : null;
  },
  createManagedAgent: async (input) => {
    const data = read();
    const id = crypto.randomUUID();
    const now = Date.now();
    const item = {
      agent: {
        id,
        name: input.name,
        description: input.description,
        status: "draft",
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
      },
      version: { ...input, agentId: id, version: 1, createdAt: now },
    };
    data.agents.push(item);
    write(data);
    return item;
  },
  updateManagedAgent: async (input) => {
    const data = read();
    const item = data.agents.find((item) => item.agent.id === input.agentId);
    item.agent = {
      ...item.agent,
      ...(input.name ? { name: input.name } : {}),
      ...(input.description ? { description: input.description } : {}),
      currentVersion: item.agent.currentVersion + 1,
    };
    item.version = { ...item.version, ...input, version: item.agent.currentVersion };
    write(data);
    return item;
  },
  listManagedEnvironments: async () => read().environments,
  listManagedSessions: async () => read().sessions,
  listWorkspaces: async () => read().workspaces,
  selectWorkspace: async (id) => read().workspaces.find((workspace) => workspace.id === id),
  getManagedSessionWorkpaper: async (id) => ({ sessionId: id, artifacts: [] }),
  getWorkspaceContext: async (id) => ({
    workspaceId: id,
    sessionCount: 1,
    sessions: [],
    fileOrigins: [],
  }),
  createPersonalAssistantProject: async (input) => {
    const data = read();
    const workspaceId = crypto.randomUUID();
    data.workspaces.push({
      id: workspaceId,
      name: input.name,
      path: `/preview/${workspaceId}`,
      createdAt: Date.now(),
      permissions: { read: true, write: true, network: true, shell: false },
    });
    const project = {
      id: crypto.randomUUID(),
      name: input.name,
      status: "active",
      kind: "neoworker_local",
      revision: 1,
      createdAt: Date.now(),
      config: { workspaceId, personalAssistantId: input.agentId, filePaths: input.filePaths || [] },
    };
    data.environments.push(project);
    write(data);
    return project;
  },
  selectFiles: async () => [
    { path: "/preview/EPAI 产品介绍.pdf", name: "EPAI 产品介绍.pdf" },
    { path: "/preview/竞品资料索引.xlsx", name: "竞品资料索引.xlsx" },
  ],
  openFile: async () => "此交互预览使用示例文件。安装版会打开真实项目资料。",
  createManagedSession: async (input) => {
    const data = read();
    const item = data.agents.find((item) => item.agent.id === input.agentId);
    const project = data.environments.find((project) => project.id === input.environmentId);
    const task = await browserCreateTask({
      title: input.title,
      prompt: input.initialEvent.content[0].text,
      workspaceId: project.config.workspaceId,
    });
    task.workspaceId = project.config.workspaceId;
    task.agentConfig = {
      personalAssistant: {
        agentId: item.agent.id,
        agentName: item.agent.name,
        agentVersion: item.version.version,
        environmentId: project.id,
        projectName: project.name,
        referenceFiles: project.config.filePaths,
        preferences: item.version.metadata.studio.personalAssistant.preferences,
      },
    };
    const tasks = JSON.parse(localStorage.getItem("neoworker-browser:tasks") || "[]");
    localStorage.setItem(
      "neoworker-browser:tasks",
      JSON.stringify(tasks.map((entry) => (entry.id === task.id ? task : entry))),
    );
    const session = {
      id: crypto.randomUUID(),
      agentId: input.agentId,
      environmentId: project.id,
      title: input.title,
      status: "completed",
      surface: "runtime",
      workspaceId: project.config.workspaceId,
      backingTaskId: task.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    data.sessions.unshift(session);
    write(data);
    return session;
  },
});
await import("../../../src/renderer/main");
