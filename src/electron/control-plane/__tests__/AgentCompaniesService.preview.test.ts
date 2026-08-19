import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-sqlite3", () => ({
  default: class MockDatabase {},
}));

import { AgentCompaniesService } from "../AgentCompaniesService";

function writeFiles(rootDir: string, files: Array<[string, string]>): void {
  for (const [relativePath, content] of files) {
    const absolutePath = path.join(rootDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
}

function createService() {
  return new AgentCompaniesService(
    {
      prepare: () => ({
        get: () => undefined,
        all: () => [],
      }),
    } as Any,
    {
      listCompanies: () => [],
      getCompany: () => undefined,
      listIssues: () => [],
      listProjects: () => [],
    } as Any,
    {
      findByCompanyId: () => [],
    } as Any,
  );
}

describe("AgentCompaniesService preview", () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    while (tmpRoots.length > 0) {
      const next = tmpRoots.pop();
      if (next) {
        fs.rmSync(next, { recursive: true, force: true });
      }
    }
  });

  it("builds a resolved preview graph from a local Agent Companies package", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-agent-companies-preview-"));
    tmpRoots.push(rootDir);
    writeFiles(rootDir, [
      [
        "COMPANY.md",
        `---
name: "GStack"
slug: "gstack"
---
Package root.
`,
      ],
      [
        "engineering/TEAM.md",
        `---
name: "Engineering"
slug: "engineering"
manager: "cto"
includes:
  - "cto/AGENTS.md"
---
Engineering.
`,
      ],
      [
        "ceo/AGENTS.md",
        `---
name: "CEO"
slug: "ceo"
---
`,
      ],
      [
        "engineering/cto/AGENTS.md",
        `---
name: "CTO"
slug: "cto"
reportsTo: "../../ceo/AGENTS.md"
skills:
  - "../../skills/release-review/SKILL.md"
---
`,
      ],
      [
        "skills/release-review/SKILL.md",
        `---
name: "release-review"
slug: "release-review"
---
`,
      ],
      [
        "projects/platform/PROJECT.md",
        `---
name: "Platform"
slug: "platform"
---
`,
      ],
      [
        "projects/platform/release/TASK.md",
        `---
name: "Ship release"
slug: "ship-release"
project: "../PROJECT.md"
assignee: "cto"
---
`,
      ],
    ]);

    const preview = createService().previewImport({
      source: {
        sourceKind: "local",
        rootUri: rootDir,
        localPath: rootDir,
      },
    });

    expect(preview.graph.packageName).toBe("GStack");
    expect(preview.graph.manifests).toHaveLength(7);
    expect(preview.graph.nodes).toHaveLength(7);
    expect(preview.warnings).toEqual([]);
    expect(preview.graph.edges.map((edge) => edge.kind)).toEqual(
      expect.arrayContaining([
        "contains",
        "reports_to",
        "manages_team",
        "belongs_to",
        "attaches_skill",
        "assigned_to",
        "related_to_project",
      ]),
    );
  });

  it("warns when COMPANY.md is missing and references cannot be resolved", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-agent-companies-preview-"));
    tmpRoots.push(rootDir);
    writeFiles(rootDir, [
      [
        "agents/AGENTS.md",
        `---
name: "Operator"
slug: "operator"
reportsTo: "missing-manager"
---
`,
      ],
    ]);

    const preview = createService().previewImport({
      source: {
        sourceKind: "local",
        rootUri: rootDir,
        localPath: rootDir,
      },
    });

    expect(preview.graph.packageName).toBe(path.basename(rootDir));
    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        "No COMPANY.md found at the package root. Import will infer the company from the folder name.",
        'Could not resolve reportsTo target "missing-manager" from agents/AGENTS.md',
      ]),
    );
  });

  it("throws an actionable error when the package folder does not exist", () => {
    const rootDir = path.join(os.tmpdir(), "neoworker-agent-companies-missing-folder");

    expect(() =>
      createService().previewImport({
        source: {
          sourceKind: "local",
          rootUri: rootDir,
          localPath: rootDir,
        },
      }),
    ).toThrow(`Package folder not found: ${rootDir}`);
  });
});
