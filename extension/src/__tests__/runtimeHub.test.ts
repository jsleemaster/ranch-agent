import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { ClaudeJsonlRuntimeHub, stableAgentRuntimeIdForSource } from "../runtimeHub";

interface TestSource {
  filePath: string;
  offset: number;
  remainder: string;
  nextRetryAt: number;
  didReportError: boolean;
}

function createSource(filePath: string): TestSource {
  return {
    filePath,
    offset: 0,
    remainder: "",
    nextRetryAt: 0,
    didReportError: false
  };
}

function consumeLines(hub: ClaudeJsonlRuntimeHub, source: TestSource, lines: Array<Record<string, unknown>>): void {
  const payload = `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
  (hub as any).consumeChunk(source, payload);
}

function doneEvents(events: RawRuntimeEvent[]): RawRuntimeEvent[] {
  return events.filter((event) => event.type === "tool_done");
}

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

describe("ClaudeJsonlRuntimeHub tool_done backfill", () => {
  it("keeps stable lineage id while preserving parsed sessionRuntimeId", () => {
    const events: RawRuntimeEvent[] = [];
    const hub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => events.push(event)
    });
    const sourcePath = "/tmp/ranch/runtime-hub-session-a.jsonl";
    const source = createSource(sourcePath);

    consumeLines(hub, source, [
      { type: "assistant_text", timestamp: 1_700_000_000_000, sessionId: "sess-1", message: "hello" }
    ]);

    expect(events[0]?.agentRuntimeId).toBe(stableAgentRuntimeIdForSource(sourcePath));
    expect(events[0]?.sessionRuntimeId).toBe("sess-1");
  });

  it("backfills missing toolName from matching tool_start", () => {
    const events: RawRuntimeEvent[] = [];
    const hub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => events.push(event)
    });
    const source = createSource("/tmp/ranch/runtime-hub-backfill-a.jsonl");

    consumeLines(hub, source, [
      { type: "tool_start", timestamp: 1_700_000_001_000, tool_name: "Read", tool_id: "tool-a" }
    ]);
    consumeLines(hub, source, [
      { type: "tool_done", timestamp: 1_700_000_001_200, tool_id: "tool-a" }
    ]);

    const done = doneEvents(events)[0];
    expect(done?.toolName).toBe("Read");
    expect(done?.toolId).toBe("tool-a");
  });

  it("prioritizes toolId matching before toolName", () => {
    const events: RawRuntimeEvent[] = [];
    const hub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => events.push(event)
    });
    const source = createSource("/tmp/ranch/runtime-hub-backfill-b.jsonl");

    consumeLines(hub, source, [
      { type: "tool_start", timestamp: 1_700_000_002_000, tool_name: "Read", tool_id: "tool-a" },
      { type: "tool_start", timestamp: 1_700_000_002_010, tool_name: "Edit", tool_id: "tool-b" }
    ]);

    consumeLines(hub, source, [
      // Intentionally conflicting tool_name. Matching should use tool_id first.
      { type: "tool_done", timestamp: 1_700_000_002_030, tool_id: "tool-a", tool_name: "Edit" },
      { type: "tool_done", timestamp: 1_700_000_002_050 }
    ]);

    const done = doneEvents(events);
    expect(done).toHaveLength(2);
    expect(done[1]?.toolName).toBe("Edit");
    expect(done[1]?.toolId).toBe("tool-b");
  });

  it("falls back to FIFO when neither toolId nor toolName is provided", () => {
    const events: RawRuntimeEvent[] = [];
    const hub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => events.push(event)
    });
    const source = createSource("/tmp/ranch/runtime-hub-backfill-c.jsonl");

    consumeLines(hub, source, [
      { type: "tool_start", timestamp: 1_700_000_003_000, tool_name: "Read", tool_id: "tool-a" },
      { type: "tool_start", timestamp: 1_700_000_003_010, tool_name: "Edit", tool_id: "tool-b" }
    ]);
    consumeLines(hub, source, [
      { type: "tool_done", timestamp: 1_700_000_003_100 },
      { type: "tool_done", timestamp: 1_700_000_003_150 }
    ]);

    const done = doneEvents(events);
    expect(done).toHaveLength(2);
    expect(done[0]?.toolName).toBe("Read");
    expect(done[0]?.toolId).toBe("tool-a");
    expect(done[1]?.toolName).toBe("Edit");
    expect(done[1]?.toolId).toBe("tool-b");
  });

  it("keeps event unchanged when no pending tool_start exists", () => {
    const events: RawRuntimeEvent[] = [];
    const hub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => events.push(event)
    });
    const source = createSource("/tmp/ranch/runtime-hub-backfill-d.jsonl");

    consumeLines(hub, source, [
      { type: "tool_done", timestamp: 1_700_000_004_000 }
    ]);

    const done = doneEvents(events)[0];
    expect(done?.toolName).toBeUndefined();
    expect(done?.toolId).toBeUndefined();
  });
});
