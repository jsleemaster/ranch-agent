import { describe, expect, it } from "vitest";

import { parseClaudeJsonlLine } from "../runtimeParser";

describe("parseClaudeJsonlLine", () => {
  it("parses tool start", () => {
    const line = JSON.stringify({
      type: "tool_start",
      timestamp: 1730000000,
      agent_id: "alpha",
      tool_name: "Read",
      input: { file_path: "src/app.ts" }
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool_start");
    expect(parsed?.agentRuntimeId).toBe("alpha");
    expect(parsed?.toolName).toBe("Read");
    expect(parsed?.filePath).toBe("src/app.ts");
  });

  it("parses permission wait", () => {
    const line = JSON.stringify({
      event: "permission_request",
      agentId: "beta",
      ts: Date.now(),
      toolName: "Bash"
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed?.type).toBe("permission_wait");
  });

  it("parses tool done with error", () => {
    const line = JSON.stringify({
      type: "tool_result",
      agentId: "gamma",
      tool_name: "Write",
      status: "failed",
      error: { message: "boom" }
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed?.type).toBe("tool_done");
    expect(parsed?.isError).toBe(true);
  });

  it("parses claude content tool_use with subagent_type", () => {
    const line = JSON.stringify({
      type: "assistant",
      sessionId: "sess-1",
      gitBranch: "main",
      cwd: "/repo",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_1",
            name: "Task",
            input: {
              subagent_type: "reviewer",
              prompt: "Use .claude/agents/reviewer.md to review changes"
            }
          }
        ]
      },
      timestamp: "2026-02-26T08:30:00.000Z"
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("tool_start");
    expect(parsed?.toolName).toBe("Task");
    expect(parsed?.toolId).toBe("toolu_1");
    expect(parsed?.agentRuntimeId).toBe("sess-1");
    expect(parsed?.branchName).toBe("main");
    expect(parsed?.invokedAgentHint).toBe("reviewer");
  });

  it("parses invoked skill hint from SKILL.md path", () => {
    const line = JSON.stringify({
      type: "assistant",
      sessionId: "sess-2",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_2",
            name: "Task",
            input: {
              prompt: "Follow .claude/skills/fix-pr/SKILL.md before implementation"
            }
          }
        ]
      },
      timestamp: "2026-02-26T08:31:00.000Z"
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed).not.toBeNull();
    expect(parsed?.invokedSkillHint).toBe("fix-pr/SKILL.md");
  });

  it("parses token usage from usage payload", () => {
    const line = JSON.stringify({
      type: "assistant",
      agentId: "delta",
      timestamp: "2026-02-27T01:24:00.000Z",
      usage: {
        input_tokens: 1201,
        output_tokens: 233,
        total_tokens: 1434
      },
      message: {
        role: "assistant",
        content: [{ type: "text", text: "done" }]
      }
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed).not.toBeNull();
    expect(parsed?.type).toBe("assistant_text");
    expect(parsed?.promptTokens).toBe(1201);
    expect(parsed?.completionTokens).toBe(233);
    expect(parsed?.totalTokens).toBe(1434);
  });

  it("derives total tokens when only prompt/completion are present", () => {
    const line = JSON.stringify({
      type: "assistant_text",
      agentId: "epsilon",
      usage: {
        prompt_tokens: 77,
        completion_tokens: 19
      },
      message: {
        role: "assistant",
        content: [{ type: "text", text: "ok" }]
      }
    });

    const parsed = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: "fallback" });
    expect(parsed).not.toBeNull();
    expect(parsed?.promptTokens).toBe(77);
    expect(parsed?.completionTokens).toBe(19);
    expect(parsed?.totalTokens).toBe(96);
  });
});
