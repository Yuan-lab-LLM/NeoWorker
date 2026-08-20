# Project configuration

This directory keeps build and quality-tool configuration out of the repository root.

- `typescript/` — CLI, daemon, Electron, and Vite TypeScript projects.
- `vite.config.ts` and `vitest.config.ts` — renderer build and test configuration.
- `eslint.config.js`, `oxlint.json`, and `gitleaks.toml` — source and secret checks.
- `agent-policy.example.toml` — optional workspace policy example; copy it to a workspace as `agent-policy.toml` before customizing it.

Use the npm scripts in the root `package.json`; they already pass the correct configuration paths.
