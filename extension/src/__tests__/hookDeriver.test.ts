import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { deriveHookGateState } from "../domain/hookDeriver";

function event(type: RawRuntimeEvent["type"], isError = false): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "agent",
    ts: Date.now(),
    type,
    isError
  };
}

describe("deriveHookGateState", () => {
  it("maps permission wait to blocked", () => {
    expect(deriveHookGateState(event("permission_wait"))).toBe("blocked");
  });

  it("maps error to failed", () => {
    expect(deriveHookGateState(event("tool_done", true))).toBe("failed");
  });

  it("maps tool done to closed", () => {
    expect(deriveHookGateState(event("tool_done"))).toBe("closed");
  });

  it("maps start/active to open", () => {
    expect(deriveHookGateState(event("tool_start"))).toBe("open");
    expect(deriveHookGateState(event("turn_active"))).toBe("open");
  });

  it("maps waiting to closed", () => {
    expect(deriveHookGateState(event("turn_waiting"))).toBe("closed");
  });
});
