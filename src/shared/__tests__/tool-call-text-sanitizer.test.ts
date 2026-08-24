import { describe, expect, it } from "vitest";
import { sanitizeToolCallTextFromAssistant } from "../tool-call-text-sanitizer";

describe("sanitizeToolCallTextFromAssistant", () => {
  it("removes xml-style tool call markup", () => {
    const result = sanitizeToolCallTextFromAssistant(
      'Before<tool_call><tool_name>run_command</tool_name><parameters>{"command":"pwd"}</parameters></tool_call>After',
    );

    expect(result.text).toBe("BeforeAfter");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes Kimi native tool protocol from user-visible text", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '正在查看图片。\n<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>{"file_path":"/tmp/image.png"}<|tool_call_end|><|tool_calls_section_end|>',
    );

    expect(result.text).toBe("正在查看图片。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("suppresses plain-text run_command transcripts", () => {
    const result = sanitizeToolCallTextFromAssistant(
      'to=run_command џьjson\n{"command":"git status --short","cwd":"/tmp/repo"}\nassistant to=run_command մեկնաբանություն\n{"command":"git diff --stat","cwd":"/tmp/repo","timeout_ms":1000}',
    );

    expect(result.text).toBe("");
    expect(result.hadToolCallText).toBe(true);
    expect(result.removedSegments).toBeGreaterThan(0);
  });

  it("strips skill_list-style transcript noise before the real payload", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '{}【analysis to=skill_list code:\n{"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );

    expect(result.text).toBe(
      '{"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );
    expect(result.hadToolCallText).toBe(true);
  });

  it("strips same-line skill_list transcript prefixes before the real payload", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '{}【analysis to=skill_list code: {"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );

    expect(result.text).toBe(
      '{"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );
    expect(result.hadToolCallText).toBe(true);
  });

  it("strips mixed leading transcript noise after an empty object and preserves inline JSON", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '{}\n【analysis to=skill_list code: {"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );

    expect(result.text).toBe(
      '{"description":"Execution plan","steps":[{"id":"1","description":"Review the repo."}]}',
    );
    expect(result.hadToolCallText).toBe(true);
  });

  it("keeps normal prose that merely mentions commands", () => {
    const result = sanitizeToolCallTextFromAssistant(
      "I ran git status locally and the working tree is clean.",
    );

    expect(result.text).toBe("I ran git status locally and the working tree is clean.");
    expect(result.hadToolCallText).toBe(false);
  });

  it("removes flattened tool activity records while keeping the user-facing reply", () => {
    const result = sanitizeToolCallTextFromAssistant(
      "文档已生成，包含销售激励方案。\n\nParse Document .neoworker/uploads/source.docx · Create Document 销售激励方案.docx · Inspect Workspace · Read File source.docx · Scratchpad Write · Glob · List Directory · Web Search Python-docx · Http Request https://pypi.org/pypi/python-docx/json",
    );

    expect(result.text).toBe("文档已生成，包含销售激励方案。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes an isolated tool activity label leaked after a reply", () => {
    const result = sanitizeToolCallTextFromAssistant(
      "内容收到后，我会立即按默认格式输出总结。\n\nList Directory",
    );

    expect(result.text).toBe("内容收到后，我会立即按默认格式输出总结。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes inline tool json plus generic tool tags from mixed progress text", () => {
    const result = sanitizeToolCallTextFromAssistant(
      'Tackling: {"id":"call_skill_list","tool":"skill_list","input":{}} <tool name="skill_list">{}</tool>\n{"tool_name":"list_directory","arguments":"{\\"path\\":\\".\\"}"} {"description":"Assuming the goal is a publication-safe analysis","steps":[]}',
    );

    expect(result.text).toBe(
      'Tackling:\n{"description":"Assuming the goal is a publication-safe analysis","steps":[]}',
    );
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes standalone namespaced tool tags", () => {
    const result = sanitizeToolCallTextFromAssistant(
      'Planner output:\n<minimax:tool_call>\ntask_list_create\ngoal: "Research"',
    );

    expect(result.text).toContain("Planner output:\n");
    expect(result.text).toContain('task_list_create\ngoal: "Research"');
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes DSML tool call markup while keeping surrounding prose", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '让我先查一下WAIC 2026的具体地点和日程，帮你做精准规划。\n< | | DSML | | tool_calls> < | | DSML | | invoke name="web_search"> < | | DSML | | parameter name="query" string="true">WAIC 2026 世界人工智能大会 时间地点 7月</ | | DSML | | parameter> </ | | DSML | | invoke> </ | | DSML | | tool_calls>',
    );

    expect(result.text).toBe("让我先查一下WAIC 2026的具体地点和日程，帮你做精准规划。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes compact DSML tool call markup", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '<||DSML||tool_calls><||DSML||invoke name="web_search"><||DSML||parameter name="query">WAIC 2026</||DSML||parameter></||DSML||invoke></||DSML||tool_calls>',
    );

    expect(result.text).toBe("");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes unnamespaced invoke markup and its Function Calls label", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '准备先检查工作区。\nFunction Calls\n<invoke name="glob"><parameter name="pattern" string="true">**/*.md</parameter><parameter name="path" string="true">/tmp/project</parameter></invoke>\n检查完成。',
    );

    expect(result.text).toBe("准备先检查工作区。\n检查完成。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("suppresses a truncated invoke block instead of exposing its parameters", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '正在读取资料。\nFunction Calls\n<invoke name="web_fetch"><parameter name="url">https://example.com</parameter>',
    );

    expect(result.text).toBe("正在读取资料。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes DSML markup even when separators are visually similar characters", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '明白。\n< ｜ ｜ DSML ｜ ｜ tool_calls> < ｜ ｜ DSML ｜ ｜ invoke name="web_search"> < ｜ ｜ DSML ｜ ｜ parameter name="query">WAIC 2026 上海 7月完整日程</ ｜ ｜ DSML ｜ ｜ parameter> </ ｜ ｜ DSML ｜ ｜ invoke> </ ｜ ｜ DSML ｜ ｜ tool_calls>',
    );

    expect(result.text).toBe("明白。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes escaped DSML markup with multiple invokes", () => {
    const result = sanitizeToolCallTextFromAssistant(
      '明白。那我再查一次 WAIC 2026 的完整日程。\n&lt; | | DSML | | tool_calls&gt; &lt; | | DSML | | invoke name=&quot;web_search&quot;&gt;&lt; | | DSML | | parameter name=&quot;query&quot; string=&quot;true&quot;&gt;WAIC 2026 世界人工智能大会 7月17日 日程&lt;/ | | DSML | | parameter&gt; &lt;/ | | DSML | | invoke&gt; &lt; | | DSML | | invoke name=&quot;web_search&quot;&gt;&lt; | | DSML | | parameter name=&quot;query&quot; string=&quot;true&quot;&gt;WAIC 2026 上海 7月完整日程&lt;/ | | DSML | | parameter&gt;&lt;/ | | DSML | | invoke&gt; &lt;/ | | DSML | | tool_calls&gt;',
    );

    expect(result.text).toBe("明白。那我再查一次 WAIC 2026 的完整日程。");
    expect(result.hadToolCallText).toBe(true);
  });

  it("removes the provider-specific function-call envelopes used by Pitch Agent", () => {
    const result = sanitizeToolCallTextFromAssistant(
      'Checking the workspace.\n<FunctionCalls><Invoke name="glob"><Parameter name="pattern">**/*.json</Parameter></Invoke></FunctionCalls>\n<InvokeFunction><target_name>list_memory</target_name></InvokeFunction>\n<functions><function><name>execute_command</name></function></functions>\nFinished checking.',
    );

    expect(result.text).toBe("Checking the workspace.\n\nFinished checking.");
    expect(result.hadToolCallText).toBe(true);
  });

  it("keeps disclosure content while removing literal HTML tags", () => {
    const result = sanitizeToolCallTextFromAssistant(
      "<details><summary>Workspace scan</summary>Found no source files.</details>",
    );

    expect(result.text).toBe("Workspace scanFound no source files.");
  });
});
