import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { SkillKind } from "../../../shared/domain";
import type { RawRuntimeEvent } from "../../../shared/runtime";
import { normalizeSkill } from "../domain/skillNormalizer";

const DEFAULT_RELATIVE_LOG_PATH = ".local-debug/unmapped-skill-events.ndjson";
const FLUSH_INTERVAL_MS = 800;
const IMMEDIATE_FLUSH_COUNT = 32;
const MAX_BUFFERED_LINES = 1024;

type TrackedEventType = "assistant_text" | "tool_start" | "tool_done";
const TRACKED_EVENT_TYPES = new Set<TrackedEventType>(["assistant_text", "tool_start", "tool_done"]);

export type UnmappedSkillReason = "unknown_tool_name" | "assistant_without_tool_name" | "missing_tool_name";

export interface UnmappedSkillLoggerConfig {
  enabled: boolean;
  filePath: string;
}

interface OutputLike {
  appendLine(message: string): void;
}

export interface UnmappedSkillRecord {
  ts: number;
  isoTime: string;
  runtime: RawRuntimeEvent["runtime"];
  agentRuntimeId: string;
  eventType: RawRuntimeEvent["type"];
  toolName: string | null;
  mappedSkill: SkillKind | null;
  reason: UnmappedSkillReason;
  detail?: string;
  invokedAgentHint?: string | null;
  invokedSkillHint?: string | null;
  invokedAgentMdId?: string | null;
  invokedSkillMdId?: string | null;
}

function normalizeToolName(toolName: string | undefined): string | null {
  const normalized = (toolName ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function buildUnmappedSkillRecord(event: RawRuntimeEvent): UnmappedSkillRecord | null {
  if (!TRACKED_EVENT_TYPES.has(event.type as TrackedEventType)) {
    return null;
  }

  const toolName = normalizeToolName(event.toolName);
  const mappedSkill = normalizeSkill(toolName ?? undefined);
  if (mappedSkill && mappedSkill !== "other") {
    return null;
  }

  let reason: UnmappedSkillReason = "missing_tool_name";
  if (toolName && mappedSkill === "other") {
    reason = "unknown_tool_name";
  } else if (!toolName && event.type === "assistant_text") {
    reason = "assistant_without_tool_name";
  }

  return {
    ts: event.ts,
    isoTime: new Date(event.ts).toISOString(),
    runtime: event.runtime,
    agentRuntimeId: event.agentRuntimeId,
    eventType: event.type,
    toolName,
    mappedSkill,
    reason,
    detail: event.detail,
    invokedAgentHint: event.invokedAgentHint ?? null,
    invokedSkillHint: event.invokedSkillHint ?? null,
    invokedAgentMdId: event.invokedAgentMdId ?? null,
    invokedSkillMdId: event.invokedSkillMdId ?? null
  };
}

export function resolveUnmappedSkillLogPath(workspaceRoot: string, configuredPath: string | undefined): string {
  const trimmed = (configuredPath ?? "").trim();
  const value = trimmed.length > 0 ? trimmed : DEFAULT_RELATIVE_LOG_PATH;
  return path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value);
}

export class UnmappedSkillLogger {
  private config: UnmappedSkillLoggerConfig;
  private readonly output: OutputLike;
  private readonly lines: string[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private flushing = false;
  private droppedLines = 0;

  constructor(output: OutputLike, config: UnmappedSkillLoggerConfig) {
    this.output = output;
    this.config = config;
  }

  updateConfig(next: UnmappedSkillLoggerConfig): void {
    this.config = next;
  }

  capture(event: RawRuntimeEvent): void {
    if (!this.config.enabled) {
      return;
    }

    const record = buildUnmappedSkillRecord(event);
    if (!record) {
      return;
    }

    if (this.lines.length >= MAX_BUFFERED_LINES) {
      this.lines.shift();
      this.droppedLines += 1;
    }

    this.lines.push(`${JSON.stringify(record)}\n`);
    if (this.lines.length >= IMMEDIATE_FLUSH_COUNT) {
      void this.flush();
      return;
    }

    this.ensureFlushTimer();
  }

  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.lines.length > 0) {
      void this.flush();
    }
  }

  private ensureFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.lines.length === 0) {
      return;
    }

    this.flushing = true;
    const payload = this.lines.join("");
    this.lines.length = 0;

    try {
      await fs.mkdir(path.dirname(this.config.filePath), { recursive: true });
      await fs.appendFile(this.config.filePath, payload, "utf8");
      if (this.droppedLines > 0) {
        this.output.appendLine(
          `[debug] unmapped-skill logger dropped ${this.droppedLines} buffered lines due to backpressure`
        );
        this.droppedLines = 0;
      }
    } catch (error) {
      this.output.appendLine(`[debug] failed to write unmapped-skill log: ${String(error)}`);
    } finally {
      this.flushing = false;
      if (this.lines.length > 0) {
        this.ensureFlushTimer();
      }
    }
  }
}

