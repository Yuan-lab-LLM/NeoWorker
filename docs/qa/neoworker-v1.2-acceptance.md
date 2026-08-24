# NeoWorker v1.2 — 第 1–3 批验收矩阵

- 验收日期：2026-08-03（Asia/Shanghai）
- 应用：NeoWorker / NeoWorker Electron
- 版本：0.5.49
- 平台：macOS arm64
- 结论：**通过**

## 范围

| 批次 | 范围 | 结果 |
| --- | --- | --- |
| 第 1 批 | 项目空间、会话多任务节点、PDF 预览性能 | PASS |
| 第 2 批 | 数据闭环、恢复能力、项目来源与工作区完整性 | PASS |
| 第 3 批 | Electron 端到端、性能门禁、构建打包与发布冒烟 | PASS |

## 验收项

| # | 验收项 | 通过标准 | 证据 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | 项目五页共享上下文 | 概览、任务、文件、产物、团队使用同一项目及工作区筛选条件 | Electron E2E `project_workspace_tabs`；`tmp/neoworker-project-e2e.png` | PASS |
| 2 | 项目与主工作区原子创建 | 项目创建和用户选择的主工作区一次提交；不残留默认工作区 | Electron E2E `atomic_project_creation`；`createProjectWithWorkspace` IPC | PASS |
| 3 | 多工作区管理及不变量 | 可关联、设为主工作区、移除非主工作区；禁止移除最后一个关联；移除主工作区时自动提升剩余项 | Electron E2E `workspace_management`；Control Plane 合约测试 | PASS |
| 4 | 项目任务完整性 | 项目任务只能创建或移动到已关联工作区；非法请求在代理执行前拒绝 | Electron E2E `project_workspace_integrity`；任务创建上下文校验 | PASS |
| 5 | 项目来源传播 | 子任务与分叉会话继承 `companyId`、`goalId`、`projectId` | `daemon-child-task.test.ts`、`daemon-fork-session.test.ts` | PASS |
| 6 | 会话多任务节点与来源 | 同一会话可呈现多个任务节点，项目上下文和来源在后续操作中保持 | 项目/会话渲染与合约测试 | PASS |
| 7 | 异步恢复与陈旧请求保护 | 文件、产物、团队加载失败有可见错误和重试；筛选快速切换时旧响应不能覆盖新状态 | `ProjectWorkspaceView` 合约与组件测试 | PASS |
| 8 | PDF 预览性能 | 1 MB、5 MB、10 MB PDF 的首次画布 p95 均低于 1500 ms | `tmp/pdf-preview-benchmark-latest.json` | PASS |
| 9 | 真实 Electron 隔离 E2E | 使用真实 preload、IPC、SQLite 和渲染端，在一次流程中完成项目及工作区闭环 | `tmp/neoworker-electron-e2e-latest.json`（4.002 s） | PASS |
| 10 | macOS 构建、打包和启动冒烟 | 全量构建、原生模块重建、临时签名、DMG 校验和挂载、应用结构检查全部成功 | `npm run package:mac:unsigned` | PASS |

## 性能结果

目标：最大 10 MB，首次画布 p95 < 1500 ms；每个尺寸 12 次。

| PDF | p50 | p95 | 最大值 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 1 MB | 242.4 ms | 246.7 ms | 246.7 ms | PASS |
| 5 MB | 339.0 ms | 344.4 ms | 344.4 ms | PASS |
| 10 MB | 454.8 ms | 461.5 ms | 461.5 ms | PASS |

## 执行记录

### 发布质量门禁

```bash
npm run qa:neoworker-release
```

- React 构建：PASS
- Electron TypeScript 构建：PASS
- 定向 Vitest：31 passed、8 skipped（7 个测试文件通过，1 个测试文件跳过）
- PDF 性能门禁：PASS
- Electron E2E：PASS（7/7 检查项）

### macOS 产物

```bash
npm run package:mac:unsigned
```

- 全量 React / Electron / daemon / CLI / connectors 构建：PASS
- `release/NeoWorker-0.5.49-arm64.dmg`：366 MB，DMG 校验、挂载和应用检查通过
- `release/NeoWorker-0.5.49-arm64-mac.zip`：354 MB
- `release/mac-arm64/NeoWorker.app`：1.0 GB，ad hoc 签名验证通过
- updater metadata 文件名校验：PASS

## 已知测试环境说明

`ControlPlaneCoreService.test.ts` 在普通 Node Vitest 进程中跳过 8 项，因为本机 `better-sqlite3` 二进制使用 Electron ABI。该路径没有被当作未验证项：隔离的真实 Electron E2E 使用匹配的 Electron 原生模块，实际执行了 SQLite、preload、IPC、原子创建、工作区完整性及 UI 管理闭环。发布包构建过程也重新编译了 `better-sqlite3` 和 `node-pty` 并通过 macOS 产物冒烟检查。
