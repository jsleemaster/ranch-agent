import { describe, expect, it } from "vitest";

import { stableAgentRuntimeIdForSource } from "../runtimeHub";

describe("stableAgentRuntimeIdForSource", () => {
  it("returns deterministic id for same file path", () => {
    const filePath = "/tmp/claude/projects/repo/session-main.jsonl";
    const first = stableAgentRuntimeIdForSource(filePath);
    const second = stableAgentRuntimeIdForSource(filePath);
    expect(first).toBe(second);
  });

  it("distinguishes ids for different files with same basename", () => {
    const first = stableAgentRuntimeIdForSource("/tmp/a/session-main.jsonl");
    const second = stableAgentRuntimeIdForSource("/tmp/b/session-main.jsonl");
    expect(first).not.toBe(second);
  });

  it("keeps readable base and appends hash suffix", () => {
    const id = stableAgentRuntimeIdForSource("/tmp/repo/subagents/code reviewer.jsonl");
    expect(id).toMatch(/^code-reviewer-[a-f0-9]{6}$/);
  });
});
