import { afterEach, describe, expect, it, vi } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { RuntimeMux } from "../runtimeMux";

function makeEvent(partial: Partial<RawRuntimeEvent>): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    ingestSource: "jsonl",
    agentRuntimeId: "agent-1",
    ts: 1_000,
    type: "tool_start",
    ...partial
  };
}

describe("RuntimeMux", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates identical events within the window", () => {
    const seen: RawRuntimeEvent[] = [];
    const mux = new RuntimeMux({
      onEvent: (event) => seen.push(event),
      dedupeWindowMs: 1500,
      holdHttpMs: 0
    });

    mux.push(makeEvent({ ts: 1_000, type: "tool_start", toolName: "Read" }));
    mux.push(makeEvent({ ts: 1_300, type: "tool_start", toolName: "Read" }));

    expect(seen).toHaveLength(1);
    mux.dispose();
  });

  it("drops HTTP duplicate when JSONL already exists in jsonl_primary mode", () => {
    const seen: RawRuntimeEvent[] = [];
    const mux = new RuntimeMux({
      onEvent: (event) => seen.push(event),
      dedupeWindowMs: 1500,
      holdHttpMs: 0
    });

    mux.push(makeEvent({ ts: 1_000, type: "tool_done", toolName: "Edit", ingestSource: "jsonl", runtime: "claude-jsonl" }));
    mux.push(
      makeEvent({
        ts: 1_200,
        type: "tool_done",
        toolName: "Edit",
        hookEventName: "PostToolUse",
        ingestSource: "http",
        runtime: "claude-http-hook"
      })
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.runtime).toBe("claude-jsonl");
    mux.dispose();
  });

  it("accepts HTTP event when JSONL duplicate does not exist", () => {
    vi.useFakeTimers();
    const seen: RawRuntimeEvent[] = [];
    const mux = new RuntimeMux({
      onEvent: (event) => seen.push(event),
      dedupeWindowMs: 1500,
      holdHttpMs: 250
    });

    mux.push(
      makeEvent({
        ts: 2_000,
        type: "assistant_text",
        hookEventName: "Notification",
        ingestSource: "http",
        runtime: "claude-http-hook"
      })
    );
    expect(seen).toHaveLength(0);

    vi.advanceTimersByTime(251);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.runtime).toBe("claude-http-hook");
    mux.dispose();
  });

  it("prefers JSONL when matching HTTP event is still pending", () => {
    vi.useFakeTimers();
    const seen: RawRuntimeEvent[] = [];
    const mux = new RuntimeMux({
      onEvent: (event) => seen.push(event),
      dedupeWindowMs: 1500,
      holdHttpMs: 250
    });

    mux.push(
      makeEvent({
        ts: 3_000,
        type: "tool_start",
        toolName: "Bash",
        hookEventName: "PreToolUse",
        ingestSource: "http",
        runtime: "claude-http-hook"
      })
    );
    mux.push(
      makeEvent({
        ts: 3_020,
        type: "tool_start",
        toolName: "Bash",
        ingestSource: "jsonl",
        runtime: "claude-jsonl"
      })
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.runtime).toBe("claude-jsonl");

    vi.advanceTimersByTime(300);
    expect(seen).toHaveLength(1);
    mux.dispose();
  });
});

