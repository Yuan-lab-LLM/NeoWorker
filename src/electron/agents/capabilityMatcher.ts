import type { AgentRole, AgentCapability } from "../../shared/types";
import { LLMProviderFactory } from "../agent/llm/provider-factory";
import type { LLMProvider } from "../agent/llm/types";
import { recordLlmCallError, recordLlmCallSuccess } from "../agent/llm/usage-telemetry";

/**
 * Keyword-based capability detection signals (used as fallback).
 * Maps each agent capability to a regex that detects relevant task content.
 */
const CAPABILITY_SIGNALS: Record<AgentCapability, RegExp> = {
  code: /(?:\b(code|implement|build|develop|program|function|class|api|endpoint|refactor|fix|bug|script|module)\b|代码|编程|开发|修复|脚本|接口|重构)/i,
  review:
    /(?:\b(review|audit|check|inspect|quality|PR|pull.?request|feedback|critique)\b|核对|核查|审核|审查|校验|检查|质量)/i,
  test: /(?:\b(test|spec|coverage|unit.?test|integration|e2e|QA|regression)\b|测试|回归|覆盖率)/i,
  design:
    /(?:\b(design|UI|UX|mockup|wireframe|layout|component|visual|interface)\b|设计|界面|视觉|布局|交互)/i,
  research:
    /(?:\b(research|investigate|explore|compare|evaluate|discover|survey|study)\b|调研|研究|调查|查询|搜索|查一下|天气|资料|来源)/i,
  analyze:
    /(?:\b(analy[sz]e|data|metrics|insight|trend|pattern|benchmark|performance|profil)\b|分析|数据|趋势|对比|比较|评估)/i,
  plan: /(?:\b(plan|architect|structure|system.?design|roadmap|strategy|approach)\b|规划|架构|路线|策略|方案)/i,
  document: /(?:\b(document|docs|readme|guide|tutorial|explanation)\b|文档|报告|手册|指南|说明)/i,
  write:
    /(?:\b(write|content|blog|article|copy|email|newsletter|draft)\b|撰写|写作|文章|邮件|草稿|分享)/i,
  security:
    /(?:\b(security|vulnerab|CVE|auth|encrypt|permission|OWASP|threat)\b|安全|漏洞|权限|加密)/i,
  ops: /(?:\b(deploy|CI.?CD|docker|kubernetes|pipeline|infrastructure|monitoring|devops)\b|部署|运维|监控|流水线)/i,
  communicate: /(?:\b(communicate|customer|support|outreach|respond)\b|沟通|客服|回复)/i,
  market: /(?:\b(market|campaign|growth|SEO|social.?media|brand|advertis)\b|市场|营销|品牌|推广)/i,
  manage:
    /(?:\b(manage|coordinate|timeline|sprint|milestone|project|priorit)\b|管理|协调|里程碑|进度)/i,
  product: /(?:\b(product|feature|user.?story|backlog|requirement|stakeholder)\b|产品|需求|功能)/i,
};

// ---------------------------------------------------------------------------
// LLM-based team selection
// ---------------------------------------------------------------------------

interface LLMTeamSelection {
  memberIds: string[];
  leaderId: string;
}

/**
 * Ask the LLM to pick the right team members and leader for a given task.
 * Returns `null` when the LLM call fails or returns unparseable output so the
 * caller can fall back to keyword matching.
 *
 * @param maxAgents - When provided (e.g. from "spawn 2 subagents"), the LLM is
 * instructed to pick exactly this many agents.
 */
async function selectViaLLM(
  prompt: string,
  activeRoles: AgentRole[],
  maxAgents?: number,
): Promise<LLMTeamSelection | null> {
  let provider: LLMProvider;
  let model: string;
  try {
    provider = LLMProviderFactory.createProvider();
    model = LLMProviderFactory.getSelectedModel();
  } catch {
    return null;
  }

  const agentDescriptions = activeRoles
    .map(
      (r) =>
        `- id: "${r.id}" | name: "${r.displayName}" | capabilities: [${r.capabilities.join(", ")}]${r.description ? ` | description: ${r.description}` : ""}`,
    )
    .join("\n");

  const countRule =
    maxAgents != null && maxAgents >= 1
      ? `- The user explicitly requested exactly ${maxAgents} agent(s). Pick EXACTLY ${maxAgents} agents — no more, no less.`
      : "- Pick between 2 and 5 agents depending on task complexity. Simple tasks need 2-3, complex tasks up to 5.";

  const systemPrompt = [
    "You are a team composition advisor. Given a task and a list of available agents, select the most appropriate team.",
    "",
    "Rules:",
    "- First identify the PRIMARY action of the task (writing, coding, research, design, etc.).",
    "- ALWAYS include the agent whose core specialization matches the primary action. E.g. a writing task MUST include a writer, a coding task MUST include a coder.",
    "- Then add agents that complement with relevant secondary skills (research, review, domain expertise).",
    countRule,
    "- Pick a leader who can best coordinate and synthesize the work — usually the agent with the primary skill.",
    "- Do NOT pick agents with only tangential relevance. A marketing agent is not a writer. A coder is not a researcher.",
    "",
    "Respond with ONLY a JSON object (no markdown fences, no explanation):",
    '{ "memberIds": ["id1", "id2", ...], "leaderId": "id1" }',
  ].join("\n");

  const userMessage = ["AVAILABLE AGENTS:", agentDescriptions, "", "TASK:", prompt].join("\n");

  try {
    const response = await provider.createMessage({
      model,
      maxTokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    recordLlmCallSuccess(
      {
        sourceKind: "capability_matcher",
        providerType: provider.type,
        modelKey: model,
        modelId: model,
      },
      response.usage,
    );

    // Extract text from response
    const text = response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Parse JSON — strip markdown fences if present
    const cleaned = text
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    if (!cleaned) return null;
    const parsed = JSON.parse(cleaned) as LLMTeamSelection;

    // Validate: memberIds must be an array of known IDs
    const roleIdSet = new Set(activeRoles.map((r) => r.id));
    if (!Array.isArray(parsed.memberIds)) return null;
    const validMembers = [...new Set(parsed.memberIds.filter((id) => roleIdSet.has(id)))];
    if (validMembers.length < (maxAgents === 1 ? 1 : 2)) return null;

    const leaderId =
      parsed.leaderId && roleIdSet.has(parsed.leaderId) ? parsed.leaderId : validMembers[0];

    // Ensure leader is in members
    if (!validMembers.includes(leaderId)) {
      validMembers.push(leaderId);
    }

    return { memberIds: validMembers, leaderId };
  } catch (err) {
    recordLlmCallError(
      {
        sourceKind: "capability_matcher",
        providerType: provider.type,
        modelKey: model,
        modelId: model,
      },
      err,
    );
    console.error("[capabilityMatcher] LLM selection failed, falling back:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Keyword-based fallback
// ---------------------------------------------------------------------------

function selectViaKeywords(
  prompt: string,
  activeRoles: AgentRole[],
  maxAgents?: number,
): { members: AgentRole[]; leader: AgentRole } {
  // Detect which capabilities the prompt needs
  const detected = new Set<AgentCapability>();
  for (const [cap, pattern] of Object.entries(CAPABILITY_SIGNALS)) {
    if (pattern.test(prompt)) detected.add(cap as AgentCapability);
  }

  if (detected.size === 0) {
    detected.add("research");
    detected.add("communicate");
  }

  // Use explicit max from prompt if provided, else heuristic
  let max = maxAgents ?? 3;
  if (maxAgents == null) {
    if (detected.size >= 5) max = 5;
    else if (detected.size >= 3) max = 4;
  }
  // When maxAgents is explicitly set (e.g. "spawn 1 agent"), respect it exactly.
  // Without an explicit cap, keep the existing floor of 2 so we always have a pair.
  const min = maxAgents != null ? maxAgents : Math.max(2, max - 1);

  // Score agents by how many detected capabilities they cover
  const scored = activeRoles
    .map((role) => ({
      role,
      score: role.capabilities.filter((c) => detected.has(c)).length,
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const members = scored.slice(0, max).map((s) => s.role);

  // Pad with general-purpose agents if under minimum
  if (members.length < min && maxAgents != null) {
    const remaining = activeRoles
      .filter((r) => !members.some((m) => m.id === r.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    members.push(...remaining.slice(0, min - members.length));
  }

  // Select leader: prefer "lead" autonomy among selected, else fallback
  let leader =
    members.find((m) => m.autonomyLevel === "lead") ||
    members[0] ||
    activeRoles.find((r) => r.capabilities.includes("research")) ||
    activeRoles[0];

  // Only add leader to members if not already present and we won't exceed maxAgents
  if (leader && !members.some((m) => m.id === leader!.id)) {
    if (maxAgents == null || members.length < maxAgents) {
      members.push(leader);
    } else {
      leader = members[0];
    }
  }

  return { members, leader: leader! };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Selects the best-fit agents for a task.
 *
 * Uses the configured LLM to analyze task complexity and pick agents.
 * Falls back to keyword-based matching if the LLM call fails.
 *
 * @param maxAgents - Optional cap from user prompt (e.g. "spawn 2 subagents" -> 2)
 */
export async function selectAgentsForTask(
  prompt: string,
  allRoles: AgentRole[],
  maxAgents?: number,
): Promise<{ members: AgentRole[]; leader: AgentRole }> {
  const active = allRoles.filter((r) => r.isActive);
  if (active.length === 0) {
    throw new Error("No active agent roles available for team selection");
  }

  // Try LLM-based selection first
  const llmResult = await selectViaLLM(prompt, active, maxAgents);

  if (llmResult) {
    const roleMap = new Map(active.map((r) => [r.id, r]));
    let memberIds = llmResult.memberIds;
    if (maxAgents != null && maxAgents >= 1) {
      memberIds = memberIds.slice(0, maxAgents);
    }
    const members = memberIds.map((id) => roleMap.get(id)).filter((r): r is AgentRole => r != null);
    const leader = roleMap.get(llmResult.leaderId) || members[0];
    if (members.length >= (maxAgents === 1 ? 1 : 2)) {
      return { members, leader: members.includes(leader) ? leader : members[0] };
    }
  }

  // Fallback to keyword matching
  let result = selectViaKeywords(prompt, active, maxAgents);
  if (maxAgents != null && maxAgents >= 1 && result.members.length > maxAgents) {
    result = {
      ...result,
      members: result.members.slice(0, maxAgents),
    };
  }
  return result;
}
