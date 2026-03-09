import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { SkillKind } from "../../../shared/domain";
import type { RawRuntimeEvent } from "../../../shared/runtime";
import { normalizeSkill } from "../domain/skillNormalizer";

const DEFAULT_RELATIVE_LOG_PATH = ".local-debug/unmapped-skill-events.ndjson";
const FLUSH_INTERVAL_MS = 800;
const IMMEDIATE_FLUSH_COUNT = 32;
const MAX_BUFFERED_LINES = 1024;
export const DEFAULT_UNMAPPED_SKILL_MAX_DETAIL_CHARS = 1200;

type TrackedEventType = "assistant_text" | "tool_start" | "tool_done";
const TRACKED_EVENT_TYPES = new Set<TrackedEventType>(["assistant_text", "tool_start", "tool_done"]);

export type UnmappedSkillReason = "unknown_tool_name" | "assistant_without_tool_name" | "missing_tool_name";
export const DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS: UnmappedSkillReason[] = [
  "unknown_tool_name",
  "missing_tool_name",
  "assistant_without_tool_name"
];

export interface UnmappedSkillLoggerConfig {
  enabled: boolean;
  filePath: string;
  maxDetailChars: number;
  captureReasons: UnmappedSkillReason[];
}

export type RelativeLogPathBase = "workspace" | "global";

export interface ResolveUnmappedSkillLogPathOptions {
  globalRoot?: string;
  relativeBase?: RelativeLogPathBase;
}

interface OutputLike {
  appendLine(message: string): void;
}

export interface UnmappedSkillRecord {
  ts: number;
  isoTime: string;
  runtime: RawRuntimeEvent["runtime"];
  agentRuntimeId: string;
  sessionRuntimeId?: string | null;
  eventType: RawRuntimeEvent["type"];
  toolName: string | null;
  mappedSkill: SkillKind | null;
  reason: UnmappedSkillReason;
  detail?: string;
  detailOriginalLength?: number;
  detailTruncated?: boolean;
  invokedAgentHint?: string | null;
  invokedSkillHint?: string | null;
  invokedAgentMdId?: string | null;
  invokedSkillMdId?: string | null;
}

interface BuildRecordOptions {
  captureReasons?: readonly UnmappedSkillReason[];
  maxDetailChars?: number;
}

function normalizeToolName(toolName: string | undefined): string | null {
  const normalized = (toolName ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function clampMaxDetailChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_UNMAPPED_SKILL_MAX_DETAIL_CHARS;
  }
  const floored = Math.floor(value);
  if (floored <= 0) {
    return 0;
  }
  return floored;
}

function normalizeCaptureReasons(reasons: readonly UnmappedSkillReason[] | undefined): Set<UnmappedSkillReason> {
  const source = reasons && reasons.length > 0 ? reasons : DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS;
  return new Set(source);
}

function trimDetail(
  detail: string | undefined,
  maxDetailChars: number
): Pick<UnmappedSkillRecord, "detail" | "detailOriginalLength" | "detailTruncated"> {
  if (typeof detail !== "string") {
    return {};
  }

  const originalLength = detail.length;
  if (maxDetailChars <= 0) {
    return {
      detailOriginalLength: originalLength,
      detailTruncated: originalLength > 0
    };
  }

  if (originalLength <= maxDetailChars) {
    return {
      detail
    };
  }

  return {
    detail: detail.slice(0, maxDetailChars),
    detailOriginalLength: originalLength,
    detailTruncated: true
  };
}

function normalizeLoggerConfig(config: UnmappedSkillLoggerConfig): UnmappedSkillLoggerConfig {
  const maxDetailChars = clampMaxDetailChars(config.maxDetailChars);
  const captureReasons = [...normalizeCaptureReasons(config.captureReasons)];
  return {
    ...config,
    maxDetailChars,
    captureReasons
  };
}

export function buildUnmappedSkillRecord(event: RawRuntimeEvent, options?: BuildRecordOptions): UnmappedSkillRecord | null {
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

  const captureReasons = normalizeCaptureReasons(options?.captureReasons);
  if (!captureReasons.has(reason)) {
    return null;
  }

  const detailFields = trimDetail(event.detail, clampMaxDetailChars(options?.maxDetailChars));

  return {
    ts: event.ts,
    isoTime: new Date(event.ts).toISOString(),
    runtime: event.runtime,
    agentRuntimeId: event.agentRuntimeId,
    sessionRuntimeId: event.sessionRuntimeId ?? null,
    eventType: event.type,
    toolName,
    mappedSkill,
    reason,
    ...detailFields,
    invokedAgentHint: event.invokedAgentHint ?? null,
    invokedSkillHint: event.invokedSkillHint ?? null,
    invokedAgentMdId: event.invokedAgentMdId ?? null,
    invokedSkillMdId: event.invokedSkillMdId ?? null
  };
}

function resolveHomePrefixedPath(value: string): string | null {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return null;
}

export function resolveUnmappedSkillLogPath(
  workspaceRoot: string,
  configuredPath: string | undefined,
  options?: ResolveUnmappedSkillLogPathOptions
): string {
  const trimmed = (configuredPath ?? "").trim();
  const value = trimmed.length > 0 ? trimmed : DEFAULT_RELATIVE_LOG_PATH;
  const homePrefixed = resolveHomePrefixedPath(value);
  if (homePrefixed) {
    return homePrefixed;
  }
  if (path.isAbsolute(value)) {
    return value;
  }

  const relativeBase = options?.relativeBase ?? "workspace";
  if (relativeBase === "global" && options?.globalRoot && options.globalRoot.trim().length > 0) {
    return path.resolve(options.globalRoot, value);
  }

  return path.resolve(workspaceRoot, value);
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
    this.config = normalizeLoggerConfig(config);
  }

  updateConfig(next: UnmappedSkillLoggerConfig): void {
    this.config = normalizeLoggerConfig(next);
  }

  capture(event: RawRuntimeEvent): void {
    if (!this.config.enabled) {
      return;
    }

    const record = buildUnmappedSkillRecord(event, {
      captureReasons: this.config.captureReasons,
      maxDetailChars: this.config.maxDetailChars
    });
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
