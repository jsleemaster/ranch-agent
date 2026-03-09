import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { classifyRuntimeSignal } from "../domain/runtimeSignalNormalizer";

function makeEvent(type: RawRuntimeEvent["type"], patch: Partial<RawRuntimeEvent> = {}): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "agent-1",
    ts: 1,
    type,
    ...patch
  };
}

describe("runtimeSignalNormalizer", () => {
  it("classifies orchestration tools as orchestration signals", () => {
    expect(classifyRuntimeSignal(makeEvent("tool_start", { toolName: "Agent" }))).toBe("orchestration_signal");
    expect(classifyRuntimeSignal(makeEvent("tool_done", { toolName: "TaskOutput" }))).toBe("orchestration_signal");
    expect(classifyRuntimeSignal(makeEvent("tool_done", { toolName: "ExitPlanMode" }))).toBe("orchestration_signal");
  });

  it("classifies missing tool names and assistant text separately", () => {
    expect(classifyRuntimeSignal(makeEvent("tool_done"))).toBe("tool_name_missing_signal");
    expect(classifyRuntimeSignal(makeEvent("assistant_text"))).toBe("assistant_reply_signal");
  });

  it("classifies non-mapped tools as unknown tool signals", () => {
    expect(classifyRuntimeSignal(makeEvent("tool_start", { toolName: "MagicTool" }))).toBe("unknown_tool_signal");
  });

  it("does not classify mapped skills as runtime signals", () => {
    expect(classifyRuntimeSignal(makeEvent("tool_start", { toolName: "Read" }))).toBeNull();
    expect(classifyRuntimeSignal(makeEvent("tool_start", { toolName: "Bash" }))).toBeNull();
  });
});
