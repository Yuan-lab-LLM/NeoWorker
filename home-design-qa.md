# 首页工作区设计核对

- 设计基准：`/var/folders/f6/v2yvmyfx77xdvgw7gfyj1xdr0000gn/T/codex-clipboard-642a56a6-046d-4715-96b4-a368365c07cd.png`
- 实现：`src/renderer/components/HomeDashboard.tsx` 与 `src/renderer/components/MainContent/main-content.css`
- 目标状态：桌面端首页、浅色主题。

## 已完成的实现核对

- 首屏采用蓝白速度感背景、左侧叙事文案和创建团队主操作。
- 右侧保留三条有内容层级的协作/交付动态，不使用统计数字堆砌。
- 下方保留三位智能体的团队入口和一行能力承诺。
- 所有主页入口都映射到现有的新建任务、任务详情、日常智能体或任务管理操作。
- `npm run build:react` 与 `git diff --check` 已通过。

## 可视核对状态

原有的 `design-qa.md` 是其他页面的验收文件，未修改。尝试使用隔离 Electron 窗口对照截图时，macOS 处于锁定状态，无法取得实现截图或进行同屏比较。

final result: blocked
