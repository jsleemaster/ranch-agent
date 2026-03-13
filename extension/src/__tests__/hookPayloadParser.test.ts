import { describe, expect, it } from "vitest";

import {
  mapHookEventNameToRuntimeType,
  parseClaudeHttpHookPayload,
  stableAgentRuntimeIdForHookSession
} from "../hookPayloadParser";
import { stableAgentRuntimeIdForSource } from "../runtimeHub";

describe("mapHookEventNameToRuntimeType", () => {
  it("maps known hook events to runtime event types", () => {
    expect(mapHookEventNameToRuntimeType("PreToolUse")).toBe("tool_start");
    expect(mapHookEventNameToRuntimeType("PostToolUse")).toBe("tool_done");
    expect(mapHookEventNameToRuntimeType("PermissionRequest")).toBe("permission_wait");
    expect(mapHookEventNameToRuntimeType("SessionEnd")).toBe("turn_waiting");
    expect(mapHookEventNameToRuntimeType("Notification")).toBe("assistant_text");
  });

  it("falls back unknown events to assistant_text", () => {
    expect(mapHookEventNameToRuntimeType("UnknownEvent")).toBe("assistant_text");
  });
});

describe("parseClaudeHttpHookPayload", () => {
  it("parses a PreToolUse payload", () => {
    const payload = {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_use_id: "tool-1",
      transcript_path: "/tmp/claude/my-session.jsonl",
      timestamp: 1_700_000_000_123
    };

    const event = parseClaudeHttpHookPayload(payload);
    expect(event).not.toBeNull();
    expect(event?.runtime).toBe("claude-http-hook");
    expect(event?.ingestSource).toBe("http");
    expect(event?.type).toBe("tool_start");
    expect(event?.toolName).toBe("Read");
    expect(event?.toolId).toBe("tool-1");
    expect(event?.sourcePath).toBe(payload.transcript_path);
    expect(event?.agentRuntimeId).toBe(stableAgentRuntimeIdForSource(payload.transcript_path));
  });

  it("uses session id when transcript_path is missing", () => {
    const payload = {
      hook_event_name: "Notification",
      session_id: "sess-abc-123",
      message: "hello"
    };
    const event = parseClaudeHttpHookPayload(payload, { now: () => 1000 });
    expect(event?.agentRuntimeId).toBe(stableAgentRuntimeIdForHookSession("sess-abc-123"));
  });

  it("maps PermissionRequest to permission_wait", () => {
    const payload = {
      hook_event_name: "PermissionRequest",
      session_id: "sess-1",
      tool_name: "Bash"
    };
    const event = parseClaudeHttpHookPayload(payload, { now: () => 1000 });
    expect(event?.type).toBe("permission_wait");
  });

  it("keeps unknown hook event as assistant_text with summarized detail", () => {
    const payload = {
      hook_event_name: "CustomThing",
      payload: {
        nested: true
      }
    };
    const event = parseClaudeHttpHookPayload(payload, { now: () => 1000, maxDetailChars: 50 });
    expect(event?.type).toBe("assistant_text");
    expect(event?.detail).toBeTypeOf("string");
  });

  it("supports ISO timestamp parsing", () => {
    const payload = {
      hook_event_name: "Notification",
      session_id: "sess-iso",
      timestamp: "2026-03-05T10:00:00.000Z"
    };
    const event = parseClaudeHttpHookPayload(payload, { now: () => 0 });
    expect(event?.ts).toBe(Date.parse("2026-03-05T10:00:00.000Z"));
  });
});

