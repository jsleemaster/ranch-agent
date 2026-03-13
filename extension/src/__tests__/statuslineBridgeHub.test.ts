import { describe, expect, it } from "vitest";

import type { StatuslineRawSnapshot } from "../../../shared/runtime";
import { STATUSLINE_MAX_BODY_BYTES, STATUSLINE_QUEUE_LIMIT } from "../constants";
import {
  ClaudeStatuslineBridgeHub,
  isStatuslineAuthorized,
  isStatuslinePayloadTooLarge
} from "../statuslineBridgeHub";

function makeSnapshot(index: number): StatuslineRawSnapshot {
  return {
    ts: 1_000 + index,
    sessionRuntimeId: `sess-${index}`,
    transcriptPath: `/tmp/status-${index}.jsonl`
  };
}

describe("statuslineBridgeHub helpers", () => {
  it("validates bearer auth token", () => {
    expect(isStatuslineAuthorized(undefined, "")).toBe(true);
    expect(isStatuslineAuthorized("Bearer abc", "")).toBe(true);
    expect(isStatuslineAuthorized(undefined, "secret")).toBe(false);
    expect(isStatuslineAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isStatuslineAuthorized("Bearer wrong", "secret")).toBe(false);
  });

  it("enforces payload size limit", () => {
    expect(isStatuslinePayloadTooLarge(STATUSLINE_MAX_BODY_BYTES)).toBe(false);
    expect(isStatuslinePayloadTooLarge(STATUSLINE_MAX_BODY_BYTES + 1)).toBe(true);
  });
});

describe("ClaudeStatuslineBridgeHub queue backpressure", () => {
  it("drops snapshots above queue limit and logs overflow", () => {
    const snapshots: StatuslineRawSnapshot[] = [];
    const logs: string[] = [];

    const hub = new ClaudeStatuslineBridgeHub({
      onSnapshot: (snapshot) => snapshots.push(snapshot),
      onLog: (message) => logs.push(message)
    });

    (hub as any).draining = true;
    for (let index = 0; index < STATUSLINE_QUEUE_LIMIT + 10; index += 1) {
      (hub as any).enqueueSnapshot(makeSnapshot(index));
    }

    expect((hub as any).queue.length).toBe(STATUSLINE_QUEUE_LIMIT);
    expect(logs.some((line) => line.includes("queue overflow"))).toBe(true);
    expect(snapshots).toHaveLength(0);

    hub.stop();
  });
});
