import { createHash } from "node:crypto";

import type { RawRuntimeEvent, RuntimeEventType } from "../../shared/runtime";
import { HTTP_HOOK_DETAIL_MAX_CHARS } from "./constants";
import { stableAgentRuntimeIdForSource } from "./runtimeHub";

type JsonObject = Record<string, unknown>;

export interface ParseClaudeHttpHookPayloadOptions {
  now?: () => number;
  sourceUrl?: string;
  maxDetailChars?: number;
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function readPath(value: unknown, pathKey: string): unknown {
  const segments = pathKey.split(".");
  let cursor: unknown = value;
  for (const segment of segments) {
    const current = asObject(cursor);
    if (!current || !(segment in current)) {
      return undefined;
    }
    cursor = current[segment];
  }
  return cursor;
}

function pickString(value: unknown, pathKeys: string[]): string | undefined {
  for (const pathKey of pathKeys) {
    const raw = readPath(value, pathKey);
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function pickBoolean(value: unknown, pathKeys: string[]): boolean | undefined {
  for (const pathKey of pathKeys) {
    const raw = readPath(value, pathKey);
    if (typeof raw === "boolean") {
      return raw;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }
  }
  return undefined;
}

function normalizeHookEventName(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function canonicalHookEventName(raw: string | null): string {
  return (raw ?? "").replace(/[\s_-]/g, "").toLowerCase();
}

export function mapHookEventNameToRuntimeType(hookEventName: string | null): RuntimeEventType {
  const event = canonicalHookEventName(hookEventName);
  switch (event) {
    case "pretooluse":
      return "tool_start";
    case "posttooluse":
      return "tool_done";
    case "notification":
      return "assistant_text";
    case "userpromptsubmit":
    case "sessionstart":
      return "turn_active";
    case "sessionend":
    case "stop":
    case "subagentstop":
      return "turn_waiting";
    case "permissionrequest":
      return "permission_wait";
    default:
      return "assistant_text";
  }
}

function inferTimestampMs(raw: unknown, now: () => number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1_000_000_000_000) {
      return Math.floor(raw);
    }
    if (raw > 1_000_000_000) {
      return Math.floor(raw * 1000);
    }
    return now();
  }
  if (typeof raw === "string") {
    const parsedNumber = Number(raw);
    if (Number.isFinite(parsedNumber)) {
      return inferTimestampMs(parsedNumber, now);
    }
    const parsedDate = Date.parse(raw);
    if (Number.isFinite(parsedDate)) {
      return parsedDate;
    }
  }
  return now();
}

function clampMaxDetailChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return HTTP_HOOK_DETAIL_MAX_CHARS;
  }
  const floored = Math.floor(value);
  if (floored <= 0) {
    return 0;
  }
  return floored;
}

function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars);
}

function summarizePayload(payload: JsonObject, maxChars: number): string | undefined {
  const direct = pickString(payload, [
    "detail",
    "message",
    "text",
    "summary",
    "tool_input.command",
    "tool_input.prompt",
    "tool_input.description",
    "tool_output.message",
    "error.message"
  ]);
  if (direct) {
    const summary = truncate(direct, maxChars);
    return summary.length > 0 ? summary : undefined;
  }

  try {
    const raw = JSON.stringify(payload);
    const summary = truncate(raw, maxChars);
    return summary.length > 0 ? summary : undefined;
  } catch {
    return undefined;
  }
}

export function stableAgentRuntimeIdForHookSession(sessionId: string): string {
  const normalized = sessionId.trim().toLowerCase();
  const suffix = createHash("sha1").update(normalized).digest("hex").slice(0, 8);
  return `hook-session-${suffix}`;
}

export function parseClaudeHttpHookPayload(
  payload: unknown,
  options?: ParseClaudeHttpHookPayloadOptions
): RawRuntimeEvent | null {
  const obj = asObject(payload);
  if (!obj) {
    return null;
  }

  const now = options?.now ?? (() => Date.now());
  const maxDetailChars = clampMaxDetailChars(options?.maxDetailChars);

  const hookEventName = normalizeHookEventName(
    pickString(obj, ["hook_event_name", "hookEventName", "event_name", "eventName", "event"])
  );
  const eventType = mapHookEventNameToRuntimeType(hookEventName);

  const sourcePath = pickString(obj, ["transcript_path", "transcriptPath", "transcript.path"]);
  const hookSessionId = pickString(obj, ["session_id", "sessionId", "session.id"]);
  const hookMatcher = pickString(obj, ["matcher", "hook_matcher", "hookMatcher"]);
  const hookDecision = pickString(obj, ["decision", "action", "permission_decision", "permissionDecision"]) ?? null;

  const toolName = pickString(obj, ["tool_name", "toolName", "tool.name", "tool_name_raw"]);
  const toolId = pickString(obj, ["tool_use_id", "toolUseId", "tool_id", "toolId"]);
  const workingDir = pickString(obj, ["cwd", "working_dir", "workingDir"]);
  const filePath = pickString(obj, [
    "file_path",
    "filePath",
    "path",
    "tool_input.file_path",
    "tool_input.filePath",
    "tool_input.path"
  ]);
  const isError = pickBoolean(obj, ["is_error", "isError", "error", "tool_output.is_error", "tool_output.isError"]);

  const tsRaw = readPath(obj, "timestamp") ?? readPath(obj, "ts") ?? readPath(obj, "time");
  const ts = inferTimestampMs(tsRaw, now);

  const agentRuntimeId = sourcePath
    ? stableAgentRuntimeIdForSource(sourcePath)
    : hookSessionId
      ? stableAgentRuntimeIdForHookSession(hookSessionId)
      : `hook-agent-${createHash("sha1").update(JSON.stringify(obj)).digest("hex").slice(0, 8)}`;

  return {
    runtime: "claude-http-hook",
    ingestSource: "http",
    agentRuntimeId,
    sessionRuntimeId: hookSessionId ?? null,
    ts,
    type: eventType,
    sourcePath,
    hookEventName: hookEventName ?? undefined,
    hookMatcher,
    hookSessionId,
    hookDecision,
    hookSourceUrl: options?.sourceUrl,
    toolName,
    toolId,
    filePath,
    workingDir,
    detail: summarizePayload(obj, maxDetailChars),
    isError
  };
}
