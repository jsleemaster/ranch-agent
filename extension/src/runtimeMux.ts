import type { RawRuntimeEvent } from "../../shared/runtime";
import { HTTP_HOOK_DEDUPE_WINDOW_MS, HTTP_HOOK_JSONL_PRIMARY_HTTP_HOLD_MS } from "./constants";

export type RuntimeMergeMode = "jsonl_primary";
type IngestSource = "jsonl" | "http";

interface RuntimeMuxOptions {
  onEvent: (event: RawRuntimeEvent) => void;
  onError?: (error: unknown) => void;
  mergeMode?: RuntimeMergeMode;
  dedupeWindowMs?: number;
  holdHttpMs?: number;
  now?: () => number;
}

interface SeenEntry {
  ts: number;
  source: IngestSource;
  seenAt: number;
}

interface PendingHttpEntry {
  event: RawRuntimeEvent;
  timer: NodeJS.Timeout;
  queuedAt: number;
}

function inferIngestSource(event: RawRuntimeEvent): IngestSource {
  if (event.ingestSource === "http") {
    return "http";
  }
  if (event.runtime === "claude-http-hook") {
    return "http";
  }
  return "jsonl";
}

function normalizeToken(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function canonicalHookEventName(event: RawRuntimeEvent): string {
  const explicit = normalizeToken(event.hookEventName);
  if (explicit.length > 0) {
    return explicit;
  }

  switch (event.type) {
    case "tool_start":
      return "pretooluse";
    case "tool_done":
      return "posttooluse";
    case "assistant_text":
      return "notification";
    case "turn_active":
      return "turnactive";
    case "turn_waiting":
      return "turnwaiting";
    case "permission_wait":
      return "permissionrequest";
    default:
      return "";
  }
}

function safeTs(event: RawRuntimeEvent): number {
  return Number.isFinite(event.ts) ? event.ts : Date.now();
}

export function runtimeEventFingerprint(event: RawRuntimeEvent): string {
  const ts = safeTs(event);
  const bucket = Math.floor(ts / 1000);
  const toolName = normalizeToken(event.toolName);
  const hookEventName = canonicalHookEventName(event);
  const sessionRuntimeId = normalizeToken(event.sessionRuntimeId ?? undefined);
  return `${event.agentRuntimeId}|${sessionRuntimeId}|${event.type}|${toolName}|${hookEventName}|${bucket}`;
}

export class RuntimeMux {
  private readonly onEvent: (event: RawRuntimeEvent) => void;
  private readonly onError?: (error: unknown) => void;
  private mergeMode: RuntimeMergeMode;
  private readonly dedupeWindowMs: number;
  private readonly holdHttpMs: number;
  private readonly now: () => number;

  private readonly seen = new Map<string, SeenEntry>();
  private readonly pendingHttp = new Map<string, PendingHttpEntry>();

  constructor(options: RuntimeMuxOptions) {
    this.onEvent = options.onEvent;
    this.onError = options.onError;
    this.mergeMode = options.mergeMode ?? "jsonl_primary";
    this.dedupeWindowMs = options.dedupeWindowMs ?? HTTP_HOOK_DEDUPE_WINDOW_MS;
    this.holdHttpMs = options.holdHttpMs ?? HTTP_HOOK_JSONL_PRIMARY_HTTP_HOLD_MS;
    this.now = options.now ?? (() => Date.now());
  }

  updateMergeMode(mode: RuntimeMergeMode): void {
    this.mergeMode = mode;
  }

  push(event: RawRuntimeEvent): void {
    const now = this.now();
    this.cleanup(now);

    const fingerprint = runtimeEventFingerprint(event);
    const source = inferIngestSource(event);
    const eventTs = safeTs(event);

    const pending = this.pendingHttp.get(fingerprint);
    if (pending) {
      if (source === "jsonl") {
        clearTimeout(pending.timer);
        this.pendingHttp.delete(fingerprint);
        this.emit(event, source, fingerprint, now);
      }
      return;
    }

    const seen = this.seen.get(fingerprint);
    if (seen && Math.abs(eventTs - seen.ts) <= this.dedupeWindowMs) {
      if (this.mergeMode === "jsonl_primary" && seen.source === "jsonl" && source === "http") {
        return;
      }
      return;
    }

    if (this.mergeMode === "jsonl_primary" && source === "http") {
      const timer = setTimeout(() => {
        const candidate = this.pendingHttp.get(fingerprint);
        if (!candidate) {
          return;
        }
        this.pendingHttp.delete(fingerprint);
        this.emit(candidate.event, "http", fingerprint, this.now());
      }, this.holdHttpMs);
      this.pendingHttp.set(fingerprint, {
        event,
        timer,
        queuedAt: now
      });
      return;
    }

    this.emit(event, source, fingerprint, now);
  }

  dispose(): void {
    for (const pending of this.pendingHttp.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingHttp.clear();
    this.seen.clear();
  }

  private emit(event: RawRuntimeEvent, source: IngestSource, fingerprint: string, now: number): void {
    try {
      this.seen.set(fingerprint, {
        ts: safeTs(event),
        source,
        seenAt: now
      });
      this.onEvent(event);
    } catch (error) {
      this.onError?.(error);
    }
  }

  private cleanup(now: number): void {
    const seenRetentionMs = Math.max(this.dedupeWindowMs * 4, 10_000);
    for (const [fingerprint, entry] of this.seen.entries()) {
      if (now - entry.seenAt > seenRetentionMs) {
        this.seen.delete(fingerprint);
      }
    }

    for (const [fingerprint, entry] of this.pendingHttp.entries()) {
      if (now - entry.queuedAt > this.dedupeWindowMs * 2) {
        clearTimeout(entry.timer);
        this.pendingHttp.delete(fingerprint);
      }
    }
  }
}
