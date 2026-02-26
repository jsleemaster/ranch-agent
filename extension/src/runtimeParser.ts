import type { RawRuntimeEvent, RuntimeEventType, RuntimeKind } from "../../shared/runtime";

interface ParseOptions {
  fallbackAgentRuntimeId: string;
  runtime?: RuntimeKind;
  now?: () => number;
}

type JsonObject = Record<string, unknown>;

const TOOL_START_HINTS = new Set(["tool_start", "tool_use", "tool_call_start", "tool_called", "tool_invoked"]);
const TOOL_DONE_HINTS = new Set(["tool_done", "tool_result", "tool_call_end", "tool_finished", "tool_use_done"]);

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
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
}

function pickNumber(value: unknown, pathKeys: string[]): number | undefined {
  for (const pathKey of pathKeys) {
    const raw = readPath(value, pathKey);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
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
      if (raw.toLowerCase() === "true") {
        return true;
      }
      if (raw.toLowerCase() === "false") {
        return false;
      }
    }
  }
  return undefined;
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

function inferEventType(obj: JsonObject, toolName: string | undefined): RuntimeEventType | null {
  const rawHint =
    pickString(obj, ["type", "event", "kind", "message_type", "payload.type", "payload.event"])?.toLowerCase() ?? "";

  if (rawHint === "assistant_text") {
    return "assistant_text";
  }

  if (rawHint.includes("permission")) {
    return "permission_wait";
  }

  if (rawHint === "turn_waiting" || rawHint.includes("waiting")) {
    return "turn_waiting";
  }

  if (rawHint === "turn_active" || rawHint.includes("turn_active")) {
    return "turn_active";
  }

  if (TOOL_START_HINTS.has(rawHint)) {
    return "tool_start";
  }

  if (TOOL_DONE_HINTS.has(rawHint)) {
    return "tool_done";
  }

  if (rawHint.includes("assistant") || rawHint.includes("response")) {
    return "assistant_text";
  }

  const status = pickString(obj, ["status", "state", "result.status", "payload.status"])?.toLowerCase();
  if (status) {
    if (["started", "running", "start", "in_progress"].includes(status) && toolName) {
      return "tool_start";
    }
    if (["done", "finished", "success", "ok", "complete", "completed"].includes(status) && toolName) {
      return "tool_done";
    }
    if (["waiting", "idle", "paused"].includes(status)) {
      return "turn_waiting";
    }
  }

  const hasAssistantText =
    typeof readPath(obj, "text") === "string" ||
    typeof readPath(obj, "message") === "string" ||
    typeof readPath(obj, "content") === "string";

  if (hasAssistantText && !toolName) {
    return "assistant_text";
  }

  return null;
}

function inferDetail(obj: JsonObject): string | undefined {
  const fromText = pickString(obj, [
    "detail",
    "text",
    "message",
    "content",
    "output",
    "error.message",
    "input.command",
    "arguments.command"
  ]);
  if (fromText) {
    return fromText;
  }
  const contentArray = readPath(obj, "content");
  if (Array.isArray(contentArray)) {
    const joined = contentArray
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        const node = asObject(item);
        if (!node) {
          return "";
        }
        return pickString(node, ["text", "message"]) ?? "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
    return joined.length > 0 ? joined : undefined;
  }
  return undefined;
}

function inferFilePath(obj: JsonObject): string | undefined {
  return pickString(obj, [
    "filePath",
    "file_path",
    "path",
    "file.path",
    "input.filePath",
    "input.file_path",
    "input.path",
    "tool_input.filePath",
    "tool_input.file_path",
    "tool_input.path",
    "arguments.filePath",
    "arguments.file_path",
    "arguments.path"
  ]);
}

export function parseClaudeJsonlLine(line: string, options: ParseOptions): RawRuntimeEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const obj = asObject(parsed);
  if (!obj) {
    return null;
  }

  const agentRuntimeId =
    pickString(obj, ["agentRuntimeId", "agentId", "agent_id", "session_id", "conversation_id", "request_id"]) ??
    options.fallbackAgentRuntimeId;

  const toolName = pickString(obj, ["toolName", "tool_name", "tool.name", "name"]);
  const eventType = inferEventType(obj, toolName);
  if (!eventType) {
    return null;
  }

  const tsRaw = pickNumber(obj, ["ts", "timestamp", "time", "created_at", "createdAt"]) ??
    pickString(obj, ["ts", "timestamp", "time", "created_at", "createdAt"]);
  const ts = inferTimestampMs(tsRaw, options.now ?? Date.now);

  const status = pickString(obj, ["status", "state", "result.status", "payload.status"])?.toLowerCase();
  const explicitError = pickBoolean(obj, ["isError", "is_error", "error", "result.error"]);
  const hasErrorObject = asObject(readPath(obj, "error")) !== null;
  const inferredError = hasErrorObject || status === "error" || status === "failed";
  const isError = explicitError ?? inferredError;

  return {
    runtime: options.runtime ?? "claude-jsonl",
    agentRuntimeId,
    ts,
    type: eventType,
    toolName,
    toolId: pickString(obj, ["toolId", "tool_id", "tool.id", "id"]),
    filePath: inferFilePath(obj),
    detail: inferDetail(obj),
    isError
  };
}
