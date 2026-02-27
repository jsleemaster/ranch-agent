import type { RawRuntimeEvent, RuntimeEventType, RuntimeKind } from "../../shared/runtime";

interface ParseOptions {
  fallbackAgentRuntimeId: string;
  runtime?: RuntimeKind;
  now?: () => number;
}

type JsonObject = Record<string, unknown>;

const TOOL_START_HINTS = new Set(["tool_start", "tool_use", "tool_call_start", "tool_called", "tool_invoked"]);
const TOOL_DONE_HINTS = new Set(["tool_done", "tool_result", "tool_call_end", "tool_finished", "tool_use_done"]);
const AGENT_MD_PATH_PATTERN = /(?:^|\/)\.claude\/agents\/([a-z0-9._-]+)\.md(?:$|[?#/])/i;
const SKILL_MD_PATH_PATTERN = /(?:^|[\s"'`([{]|\/)\.claude\/skills\/([^?#\s]+?\.md)\b/i;

interface ContentSignals {
  toolUse: {
    id?: string;
    name?: string;
    input?: JsonObject;
  } | null;
  toolResult: {
    toolUseId?: string;
    isError?: boolean;
    contentText?: string;
  } | null;
  textParts: string[];
}

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
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

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readBoolean(value: unknown, key: string): boolean | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const raw = (value as Record<string, unknown>)[key];
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
  return undefined;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function parseContentSignals(obj: JsonObject): ContentSignals {
  const signals: ContentSignals = {
    toolUse: null,
    toolResult: null,
    textParts: []
  };

  const messageObj = asObject(readPath(obj, "message"));
  const content = asArray(messageObj?.content) ?? asArray(readPath(obj, "content")) ?? [];

  for (const item of content) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text.length > 0) {
        signals.textParts.push(text);
      }
      continue;
    }

    const node = asObject(item);
    if (!node) {
      continue;
    }

    const nodeType = readString(node, "type")?.toLowerCase();
    const text = readString(node, "text") ?? readString(node, "message") ?? readString(node, "content");
    if (text) {
      signals.textParts.push(text);
    }

    if (nodeType === "tool_use" && !signals.toolUse) {
      signals.toolUse = {
        id: readString(node, "id"),
        name: readString(node, "name"),
        input: asObject(node.input) ?? undefined
      };
      continue;
    }

    const toolUseId = readString(node, "tool_use_id");
    if ((nodeType === "tool_result" || toolUseId) && !signals.toolResult) {
      signals.toolResult = {
        toolUseId: toolUseId,
        isError: readBoolean(node, "is_error"),
        contentText: readString(node, "content")
      };
    }
  }

  return signals;
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

function inferEventType(obj: JsonObject, toolName: string | undefined, contentSignals: ContentSignals): RuntimeEventType | null {
  if (contentSignals.toolUse) {
    return "tool_start";
  }
  if (contentSignals.toolResult) {
    return "tool_done";
  }

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

function inferDetail(obj: JsonObject, contentSignals: ContentSignals): string | undefined {
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

  const toolInput = contentSignals.toolUse?.input;
  const fromToolInput = pickString(toolInput, ["description", "prompt", "command", "activeForm", "subject"]);
  if (fromToolInput) {
    return fromToolInput;
  }

  if (contentSignals.toolResult?.contentText) {
    return contentSignals.toolResult.contentText;
  }

  if (contentSignals.textParts.length > 0) {
    const joined = contentSignals.textParts.join(" ").trim();
    if (joined.length > 0) {
      return joined;
    }
  }

  return undefined;
}

function inferFilePath(obj: JsonObject, contentSignals: ContentSignals): string | undefined {
  const direct = pickString(obj, [
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
  if (direct) {
    return direct;
  }

  return pickString(contentSignals.toolUse?.input, ["filePath", "file_path", "path"]);
}

function inferWorkingDir(obj: JsonObject): string | undefined {
  return pickString(obj, [
    "cwd",
    "working_directory",
    "workingDirectory",
    "workspace",
    "workspace_root",
    "project_dir",
    "input.cwd",
    "tool_input.cwd",
    "arguments.cwd"
  ]);
}

function inferBranchName(obj: JsonObject): string | null {
  const value = pickString(obj, [
    "branch",
    "gitBranch",
    "branch_name",
    "git_branch",
    "git.branch",
    "metadata.branch",
    "payload.branch"
  ]);
  if (!value) {
    return null;
  }
  return value;
}

function inferInvokedAgentHint(obj: JsonObject, contentSignals: ContentSignals): string | null {
  const fromInput = pickString(contentSignals.toolUse?.input, ["subagent_type", "subagentType", "agent", "agent_name"]);
  if (fromInput) {
    return fromInput;
  }

  const direct = pickString(obj, ["subagent_type", "subagentType", "agent", "agent_name"]);
  if (direct) {
    return direct;
  }

  const fromText = inferDetail(obj, contentSignals);
  if (!fromText) {
    return null;
  }

  const matched = fromText.replace(/\\/g, "/").match(AGENT_MD_PATH_PATTERN);
  if (!matched?.[1]) {
    return null;
  }
  return matched[1];
}

function inferInvokedSkillHint(obj: JsonObject, contentSignals: ContentSignals): string | null {
  const fromInput = pickString(contentSignals.toolUse?.input, ["skill", "skill_name", "skillName", "skill_id", "skillId"]);
  if (fromInput) {
    return fromInput;
  }

  const direct = pickString(obj, ["skill", "skill_name", "skillName", "skill_id", "skillId"]);
  if (direct) {
    return direct;
  }

  const fromText = inferDetail(obj, contentSignals);
  if (!fromText) {
    return null;
  }

  const matched = fromText.replace(/\\/g, "/").match(SKILL_MD_PATH_PATTERN);
  if (!matched?.[1]) {
    return null;
  }
  return matched[1];
}

function normalizeTokenCount(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  const floored = Math.floor(raw);
  if (floored < 0) {
    return undefined;
  }
  return floored;
}

function inferTokenUsage(obj: JsonObject): TokenUsage {
  const promptTokens = normalizeTokenCount(
    pickNumber(obj, [
      "usage.input_tokens",
      "usage.prompt_tokens",
      "message.usage.input_tokens",
      "message.usage.prompt_tokens",
      "token_usage.input_tokens",
      "token_usage.prompt_tokens",
      "input_tokens",
      "prompt_tokens"
    ])
  );

  const completionTokens = normalizeTokenCount(
    pickNumber(obj, [
      "usage.output_tokens",
      "usage.completion_tokens",
      "message.usage.output_tokens",
      "message.usage.completion_tokens",
      "token_usage.output_tokens",
      "token_usage.completion_tokens",
      "output_tokens",
      "completion_tokens"
    ])
  );

  const explicitTotalTokens = normalizeTokenCount(
    pickNumber(obj, [
      "usage.total_tokens",
      "message.usage.total_tokens",
      "token_usage.total_tokens",
      "total_tokens"
    ])
  );

  const totalTokens =
    explicitTotalTokens ??
    (typeof promptTokens === "number" || typeof completionTokens === "number"
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined);

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
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
    pickString(obj, [
      "agentRuntimeId",
      "agentId",
      "agent_id",
      "sessionId",
      "session_id",
      "conversation_id",
      "requestId",
      "request_id"
    ]) ??
    options.fallbackAgentRuntimeId;

  const contentSignals = parseContentSignals(obj);
  const toolName = pickString(obj, ["toolName", "tool_name", "tool.name", "name"]) ?? contentSignals.toolUse?.name;
  const eventType = inferEventType(obj, toolName, contentSignals);
  if (!eventType) {
    return null;
  }

  const tsRaw = pickNumber(obj, ["ts", "timestamp", "time", "created_at", "createdAt"]) ??
    pickString(obj, ["ts", "timestamp", "time", "created_at", "createdAt"]);
  const ts = inferTimestampMs(tsRaw, options.now ?? Date.now);

  const status = pickString(obj, ["status", "state", "result.status", "payload.status"])?.toLowerCase();
  const explicitError = pickBoolean(obj, ["isError", "is_error", "error", "result.error"]);
  const hasErrorObject = asObject(readPath(obj, "error")) !== null;
  const inferredError = hasErrorObject || status === "error" || status === "failed" || contentSignals.toolResult?.isError === true;
  const isError = explicitError ?? inferredError;
  const detail = inferDetail(obj, contentSignals);
  const invokedAgentHint = inferInvokedAgentHint(obj, contentSignals);
  const invokedSkillHint = inferInvokedSkillHint(obj, contentSignals);
  const tokenUsage = inferTokenUsage(obj);

  return {
    runtime: options.runtime ?? "claude-jsonl",
    agentRuntimeId,
    ts,
    type: eventType,
    toolName,
    toolId: pickString(obj, ["toolId", "tool_id", "tool.id", "id"]) ?? contentSignals.toolUse?.id ?? contentSignals.toolResult?.toolUseId,
    filePath: inferFilePath(obj, contentSignals),
    workingDir: inferWorkingDir(obj),
    branchName: inferBranchName(obj),
    invokedAgentHint,
    invokedSkillHint,
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
    totalTokens: tokenUsage.totalTokens,
    detail,
    isError
  };
}
