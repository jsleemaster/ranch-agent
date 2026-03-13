import type { StatuslineRawSnapshot } from "../../shared/runtime";

type JsonObject = Record<string, unknown>;

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

function inferTs(value: unknown): number {
  const candidates = [
    pickNumber(value, ["timestamp", "ts", "updated_at_ms", "updatedAtMs"]),
    pickNumber(value, ["timestamp_iso"]),
    pickNumber(value, ["updated_at"])
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
      continue;
    }
    if (candidate > 1_000_000_000_000) {
      return Math.floor(candidate);
    }
    if (candidate > 1_000_000_000) {
      return Math.floor(candidate * 1000);
    }
  }

  const dateString = pickString(value, ["timestamp_iso", "updated_at", "timestamp"]);
  if (dateString) {
    const parsed = Date.parse(dateString);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Date.now();
}

function sumNumbers(value: unknown): number | undefined {
  const object = asObject(value);
  if (!object) {
    return undefined;
  }

  let total = 0;
  let sawNumber = false;
  for (const raw of Object.values(object)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      total += raw;
      sawNumber = true;
    }
  }
  return sawNumber ? total : undefined;
}

export function parseClaudeStatuslinePayload(payload: Record<string, unknown>): StatuslineRawSnapshot | null {
  const sessionRuntimeId = pickString(payload, ["session_id", "sessionId"]);
  const transcriptPath = pickString(payload, ["transcript_path", "transcriptPath"]);
  if (!sessionRuntimeId && !transcriptPath) {
    return null;
  }

  const contextUsedTokens = sumNumbers(readPath(payload, "context_window.current_usage"));
  const contextMaxTokens = pickNumber(payload, ["context_window.context_window_size", "context_window.max_tokens"]);
  const contextPercentRaw = pickNumber(payload, ["context_window.used_percentage", "context_window.used_percent"]);
  const contextPercent =
    typeof contextPercentRaw === "number"
      ? Math.max(0, Math.min(100, contextPercentRaw))
      : typeof contextUsedTokens === "number" && typeof contextMaxTokens === "number" && contextMaxTokens > 0
        ? Math.max(0, Math.min(100, (contextUsedTokens / contextMaxTokens) * 100))
        : undefined;

  const sessionInputTokensTotal = pickNumber(payload, [
    "context_window.total_input_tokens",
    "usage.total_input_tokens",
    "session.total_input_tokens"
  ]);
  const sessionOutputTokensTotal = pickNumber(payload, [
    "context_window.total_output_tokens",
    "usage.total_output_tokens",
    "session.total_output_tokens"
  ]);

  const sessionTokensTotalDirect = pickNumber(payload, [
    "context_window.total_tokens",
    "usage.total_tokens",
    "session.total_tokens"
  ]);
  const sessionTokensTotal =
    typeof sessionTokensTotalDirect === "number"
      ? sessionTokensTotalDirect
      : typeof sessionInputTokensTotal === "number" || typeof sessionOutputTokensTotal === "number"
        ? (sessionInputTokensTotal ?? 0) + (sessionOutputTokensTotal ?? 0)
        : undefined;

  return {
    ts: inferTs(payload),
    sessionRuntimeId: sessionRuntimeId ?? null,
    transcriptPath: transcriptPath ?? null,
    cwd: pickString(payload, ["cwd"]),
    workspaceCurrentDir: pickString(payload, ["workspace.current_dir", "workspace.currentDir"]),
    workspaceProjectDir: pickString(payload, ["workspace.project_dir", "workspace.projectDir"]),
    modelId: pickString(payload, ["model.id", "model.name"]),
    modelDisplayName: pickString(payload, ["model.display_name", "model.displayName"]),
    version: pickString(payload, ["version"]),
    totalCostUsd: pickNumber(payload, ["cost.total_cost_usd", "cost.totalCostUsd"]),
    totalDurationMs: pickNumber(payload, ["cost.total_duration_ms", "cost.totalDurationMs"]),
    contextUsedTokens,
    contextMaxTokens,
    contextPercent,
    sessionInputTokensTotal,
    sessionOutputTokensTotal,
    sessionTokensTotal
  };
}
