import { getCurrentLanguage } from "../i18n";
import { getLocalizedSkillNameFromIdentifier } from "./localized-skills";
import { normalizeInternalToolNamesForDisplay } from "./internal-tool-display";

const ZH_EXACT_PROGRESS_TEXT: Record<string, string> = {
  activity: "活动",
  "action required": "需要操作",
  "adjusting approach": "正在调整方法",
  "adjusting the plan": "正在调整计划",
  "all done": "全部完成",
  "applying fixes": "正在应用修复",
  "approved requests...": "已批准请求...",
  "attached evidence": "已附加证据",
  "awaiting approval": "等待审批",
  "awaiting instruction": "等待指令",
  "beginning task.": "开始任务。",
  building: "构建中",
  cancelled: "已取消",
  "collect details from you": "向你收集细节",
  "command failed: osascript": "命令失败：osascript",
  "checking results": "正在检查结果",
  "choosing the best planning approach": "正在选择规划方案",
  "complete.": "完成。",
  completed: "已完成",
  "completed - action required": "已完成 - 需要操作",
  "completed - partial success": "已完成 - 部分成功",
  "completed a step": "已完成一个步骤",
  "completed with warnings": "已完成但有警告",
  continuing: "正在继续",
  "continuing with available context": "正在用可用上下文继续",
  "creating execution plan": "正在创建执行计划",
  "creating files...": "正在创建文件...",
  "decision required.": "需要确认。",
  "deciding next steps": "正在决定下一步",
  "directly answer the user question before any deep expansion":
    "先直接回答用户问题，再做深入展开",
  "directly answer the user question before any deep expansion.":
    "先直接回答用户问题，再做深入展开。",
  "editing files...": "正在编辑文件...",
  "error reported": "已报告错误",
  failed: "失败",
  "follow-up received": "已收到后续消息",
  "exploring files and searching the codebase...":
    "正在查看文件并搜索代码库...",
  "gathering web sources...": "正在收集网页来源...",
  "getting started": "准备开始",
  "getting started...": "准备开始...",
  "in progress": "进行中",
  "issue encountered.": "遇到问题。",
  "just now": "刚刚",
  "keep research/tool loops bounded; stop once the answer is supportable.":
    "限制研究/工具循环，答案有支撑后就停止。",
  log: "日志",
  "making room to continue": "正在腾出上下文空间以继续",
  "never end silently": "不要静默结束",
  "never end silently.": "不要静默结束。",
  "never end silently. always return a complete best-effort answer":
    "不要静默结束。始终返回完整的最佳努力答案",
  "never end silently. always return a complete best-effort answer.":
    "不要静默结束。始终返回完整的最佳努力答案。",
  "needs your go-ahead": "需要你的确认",
  "needs user action": "需要用户操作",
  "nudging agent to begin writing": "正在推动智能体开始写入",
  "no plan steps yet": "还没有计划步骤",
  paused: "已暂停",
  "paused before continuing": "继续前已暂停",
  "paused to avoid getting stuck": "已暂停以避免卡住",
  "planning the approach": "正在规划方法",
  "preparing final response": "正在准备最终回复",
  "progress update": "进度更新",
  "processing...": "处理中...",
  "preparing the office document quality check...":
    "正在准备 Office 文档质检...",
  "checking the office file structure...": "正在检查 Office 文件结构...",
  "scanning content, formatting, and structure...":
    "正在扫描内容、格式和结构问题...",
  "rendering a visual preview and checking layout...":
    "正在生成可视化预览并检查版面...",
  "the office file was generated, but structural validation failed.":
    "Office 文件已生成，但结构校验未通过。",
  "the office file passed structural checks and a visual preview was completed.":
    "Office 文件已通过结构检查，并完成可视化预览。",
  "the office file passed structural checks.": "Office 文件已通过结构检查。",
  ready: "就绪",
  "ready to continue": "已准备好继续",
  "reading files...": "正在读取文件...",
  "retrying the file write": "正在重试文件写入",
  "running commands...": "正在运行命令...",
  "running run_command": "正在运行命令",
  "running run_command...": "正在运行命令...",
  "searching the codebase...": "正在搜索代码库...",
  "step complete": "步骤完成",
  "step complete.": "步骤完成。",
  "step completed": "步骤已完成",
  "step failed": "步骤失败",
  "started a step": "已开始一个步骤",
  "starting the work": "开始执行",
  "still working on this step - waiting for the first file write":
    "仍在处理此步骤，等待首次写入文件",
  stopped: "已停止",
  "strategy prepared.": "已准备好策略。",
  "trying a different approach": "正在尝试另一种方法",
  "understanding the request": "正在理解任务需求",
  "selecting relevant skills": "正在选择相关技能",
  "structured input dismissed": "已关闭结构化输入",
  "structured input requested": "已请求结构化输入",
  "structured input submitted": "已提交结构化输入",
  waiting: "等待中",
  "waiting for file activity to begin": "等待文件操作开始",
  "waiting for approval": "等待审批",
  "waiting for your cue": "等待你的指令",
  working: "工作中",
  "working...": "工作中...",
  "working on your request": "正在处理你的请求",
  "understanding the request and planning...": "正在理解问题并制定方案...",
  "searching reliable sources...": "正在检索可靠来源...",
  "reading key material...": "正在读取关键资料...",
  "a source is responding slowly; switching or retrying...":
    "目标来源响应较慢，正在切换或重试...",
  "sources collected; preparing the conclusion...": "资料已收集，正在整理结论...",
  "analyzing the collected information...": "正在分析已收集的信息...",
  "working on the task...": "正在推进任务...",
};

function canonicalizeProgressText(n: string): string {
  return n
    .trim()
    .replace(/…/g, "...")
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[-•]\s*/, "")
    .toLowerCase();
}

function localizeCountLabel(n: string): string | null {
  let s = n.match(/^(\d+) completed steps?$/i);
  if (s) return `${s[1]} 个已完成步骤`;
  if (((s = n.match(/^(\d+) planned steps?$/i)), s))
    return `${s[1]} 个计划步骤`;
  if (((s = n.match(/^(\d+) more steps?$/i)), s)) return `${s[1]} 个更多步骤`;
  if (((s = n.match(/^(\d+) steps?$/i)), s)) return `${s[1]} 个步骤`;
  if (((s = n.match(/^(\d+) actions?$/i)), s)) return `${s[1]} 个动作`;
  if (((s = n.match(/^(\d+) tool calls?$/i)), s)) return `${s[1]} 次工具调用`;
  if (((s = n.match(/^(\d+) web lookups?$/i)), s)) return `${s[1]} 次网页查询`;
  if (
    ((s = n.match(/^(\d+) of (\d+) steps complete(?:, (\d+) failed)?$/i)), s)
  ) {
    const i = s[3] ? `，${s[3]} 个失败` : "";
    return `${s[1]} / ${s[2]} 个步骤已完成${i}`;
  }
  return null;
}

function localizeActionSummary(n: string): string | null {
  let s = n.match(/^created (\d+) files?, edited (\d+) files?$/i);
  return s
    ? `已创建 ${s[1]} 个文件，已编辑 ${s[2]} 个文件`
    : ((s = n.match(/^created (\d+) files?$/i)),
      s
        ? `已创建 ${s[1]} 个文件`
        : ((s = n.match(/^edited (\d+) files?$/i)),
          s
            ? `已编辑 ${s[1]} 个文件`
            : ((s = n.match(/^explored (\d+) files?, (\d+) searches$/i)),
              s
                ? `已查看 ${s[1]} 个文件，搜索 ${s[2]} 次`
                : ((s = n.match(/^explored (\d+) files?$/i)),
                  s
                    ? `已查看 ${s[1]} 个文件`
                    : ((s = n.match(/^searched (\d+) times?$/i)),
                      s
                        ? `搜索 ${s[1]} 次`
                        : ((s = n.match(/^(?:ran|Ran) (\d+) commands?$/)),
                          s
                            ? `运行了 ${s[1]} 条命令`
                            : ((s = n.match(/^approved (\d+) requests?$/i)),
                              s ? `已批准 ${s[1]} 个请求` : null)))))));
}

export function localizeProgressText(n: string): string {
  n = normalizeInternalToolNamesForDisplay(n);
  if (getCurrentLanguage() !== "zh-CN") return n;
  const s = n.trim();
  if (!s) return n;
  const i = localizeCountLabel(s);
  if (i) return i;
  const r = localizeActionSummary(s);
  if (r) return r;
  const a = ZH_EXACT_PROGRESS_TEXT[canonicalizeProgressText(s)];
  if (a) return a;
  const officeIssueMatch = s.match(
    /^The Office file was generated, but the quality check found (\d+) issue\(s\) to address\.?$/i,
  );
  if (officeIssueMatch) {
    return `Office 文件已生成，质检发现 ${officeIssueMatch[1]} 个待处理问题。`;
  }
  let c = s.match(/^completed task:\s*(.+)$/i);
  return c
    ? `已完成任务：${localizeProgressText(c[1])}`
    : ((c = s.match(/^skipped unavailable source:\s*(.+)$/i)),
      c
        ? `已跳过不可用来源：${c[1]}`
        : /^source unavailable, skipped$/i.test(s)
          ? "来源不可用，已跳过"
          : ((c = s.match(/^step (\d+)$/i)),
            c
              ? `步骤 ${c[1]}`
              : ((c = s.match(/^step complete:\s*(.+)$/i)),
                c
                  ? `步骤完成：${localizeProgressText(c[1])}`
                  : ((c = s.match(/^completed:\s*(.+)$/i)),
                    c
                      ? `已完成：${localizeProgressText(c[1])}`
                      : ((c = s.match(/^completed\s+(.+)$/i)),
                        c
                          ? `已完成：${localizeProgressText(c[1])}`
                          : ((c = s.match(/^attached (\d+) evidence links?$/i)),
                            c
                              ? `已附加 ${c[1]} 条证据链接`
                              : ((c = s.match(/^follow-up:\s*(.+)$/i)),
                                c
                                  ? `后续：${c[1]}`
                                  : ((c = s.match(
                                      /^starting tool batch\s*\((\d+)\)$/i,
                                    )),
                                    c
                                      ? `开始执行 ${c[1]} 项工具操作`
                                      : ((c = s.match(
                                          /^tool batch\s*\((\d+)\)$/i,
                                        )),
                                        c
                                          ? `${c[1]} 项工具操作`
                                          : ((c =
                                              s.match(/^starting:\s*(.+)$/i)),
                                            c
                                              ? `开始：${localizeProgressText(c[1])}`
                                              : ((c =
                                                  s.match(
                                                    /^starting\s+(.+)$/i,
                                                  )),
                                                c
                                                  ? `开始：${localizeProgressText(c[1])}`
                                                  : ((c =
                                                      s.match(
                                                        /^failed:\s*(.+)$/i,
                                                      )),
                                                    c
                                                      ? `失败：${localizeProgressText(c[1])}`
                                                      : ((c =
                                                          s.match(
                                                            /^failed\s+(.+)$/i,
                                                          )),
                                                        c
                                                          ? `失败：${localizeProgressText(c[1])}`
                                                          : /^claude api key or subscription token is required\b/i.test(
                                                                s,
                                                              )
                                                            ? "缺少 Claude API 密钥或订阅令牌，请在“设置”中完成配置，或前往 Anthropic 控制台获取密钥。"
                                                            : ((c =
                                                                s.match(
                                                                  /^(.+)\s+started$/i,
                                                                )),
                                                              c
                                                                ? `已开始：${localizeProgressText(c[1])}`
                                                                : ((c =
                                                                    s.match(
                                                                      /^(.+)\s+done$/i,
                                                                    )),
                                                                  c
                                                                    ? `已完成：${localizeProgressText(c[1])}`
                                                                    : ((c =
                                                                        s.match(
                                                                          /^(.+)\s+failed$/i,
                                                                        )),
                                                                      c
                                                                        ? `失败：${localizeProgressText(c[1])}`
                                                                        : ((c =
                                                                            s.match(
                                                                              /^working on:\s*(.+)$/i,
                                                                            )),
                                                                          c
                                                                            ? `正在处理：${localizeProgressText(c[1])}`
                                                                            : ((c =
                                                                                s.match(
                                                                                  /^retrying \(attempt (\d+)\)\.?$/i,
                                                                                )),
                                                                              c
                                                                                ? `正在重试（第 ${c[1]} 次）。`
                                                                                : ((c =
                                                                                    s.match(
                                                                                      /^verification passed\.? \(attempt (\d+)\)$/i,
                                                                                    )),
                                                                                  c
                                                                                    ? `验证通过（第 ${c[1]} 次）`
                                                                                    : ((c =
                                                                                        s.match(
                                                                                          /^verification failed\.? \(attempt (\d+)\/(\d+)\)$/i,
                                                                                        )),
                                                                                      c
                                                                                        ? `验证失败（第 ${c[1]} / ${c[2]} 次）`
                                                                                        : ((c =
                                                                                            s.match(
                                                                                              /^run the ([\w -]+) skill$/i,
                                                                                            )),
                                                                                          c
                                                                                            ? `运行 ${getLocalizedSkillNameFromIdentifier(c[1].trim())} 技能`
                                                                                            : ((c =
                                                                                                s.match(
                                                                                                  /^running ([\w -]+) skill$/i,
                                                                                                )),
                                                                                              c
                                                                                                ? `正在运行 ${getLocalizedSkillNameFromIdentifier(c[1].trim())} 技能`
                                                                                                : ((c =
                                                                                                    s.match(
                                                                                                      /^using ([\w -]+)$/i,
                                                                                                    )),
                                                                                                  c
                                                                                                    ? `正在使用 ${getLocalizedSkillNameFromIdentifier(c[1].trim())}`
                                                                                                    : n)))))))))))))))))))))));
}

export function localizeProgressSummary(n: string[]): string {
  return getCurrentLanguage() !== "zh-CN"
    ? n.join(", ")
    : n.map((s) => localizeProgressText(s)).join("，");
}
