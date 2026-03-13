import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { HTTP_HOOK_MAX_BODY_BYTES, HTTP_HOOK_QUEUE_LIMIT } from "../constants";
import {
  ClaudeHttpHookRuntimeHub,
  isHttpHookAuthorized,
  isHttpHookPayloadTooLarge
} from "../httpHookRuntimeHub";

function makeEvent(index: number): RawRuntimeEvent {
  return {
    runtime: "claude-http-hook",
    ingestSource: "http",
    agentRuntimeId: `hook-agent-${index}`,
    ts: 1_000 + index,
    type: "assistant_text",
    hookEventName: "Notification"
  };
}

describe("httpHookRuntimeHub helpers", () => {
  it("validates bearer auth token", () => {
    expect(isHttpHookAuthorized(undefined, "")).toBe(true);
    expect(isHttpHookAuthorized("Bearer abc", "")).toBe(true);
    expect(isHttpHookAuthorized(undefined, "secret")).toBe(false);
    expect(isHttpHookAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isHttpHookAuthorized("Bearer wrong", "secret")).toBe(false);
  });

  it("enforces payload size limit", () => {
    expect(isHttpHookPayloadTooLarge(HTTP_HOOK_MAX_BODY_BYTES)).toBe(false);
    expect(isHttpHookPayloadTooLarge(HTTP_HOOK_MAX_BODY_BYTES + 1)).toBe(true);
  });
});

describe("ClaudeHttpHookRuntimeHub queue backpressure", () => {
  it("drops events above queue limit and logs overflow", () => {
    const events: RawRuntimeEvent[] = [];
    const logs: string[] = [];

    const hub = new ClaudeHttpHookRuntimeHub({
      onEvent: (event) => events.push(event),
      onLog: (message) => logs.push(message)
    });

    // Freeze draining to force queue saturation deterministically.
    (hub as any).draining = true;
    for (let index = 0; index < HTTP_HOOK_QUEUE_LIMIT + 10; index += 1) {
      (hub as any).enqueueEvent(makeEvent(index));
    }

    expect((hub as any).queue.length).toBe(HTTP_HOOK_QUEUE_LIMIT);
    expect(logs.some((line) => line.includes("queue overflow"))).toBe(true);
    expect(events).toHaveLength(0);

    hub.stop();
  });
});
