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
});
