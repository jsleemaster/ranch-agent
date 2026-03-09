import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";

import type { RawRuntimeEvent } from "../../shared/runtime";
import { IDLE_WAIT_MS, INTERNAL_EVENT_LIMIT, MAX_POLLED_SOURCES_PER_TICK, WATCHER_POLL_MS, WATCHER_RETRY_MS } from "./constants";
import { parseClaudeJsonlLine } from "./runtimeParser";

interface RuntimeHubHandlers {
  onEvent: (event: RawRuntimeEvent) => void;
  onError?: (error: unknown) => void;
}

interface PendingToolStart {
  startTs: number;
  toolId: string | null;
  toolName: string | null;
  toolIdKey: string | null;
  toolNameKey: string | null;
}

interface WatchedSource {
  filePath: string;
  offset: number;
  remainder: string;
  nextRetryAt: number;
  didReportError: boolean;
}

const MAX_PENDING_TOOL_STARTS_PER_AGENT = 256;

function initialOffset(filePath: string): number {
  try {
    const stat = fsSync.statSync(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

async function readSlice(filePath: string, offset: number, size: number): Promise<string> {
  if (size <= 0) {
    return "";
  }
  const file = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(size);
    await file.read(buffer, 0, size, offset);
    return buffer.toString("utf8");
  } finally {
    await file.close();
  }
}

function normalizePaths(filePaths: string[]): string[] {
  const unique = new Set<string>();
  const ordered: string[] = [];
  for (const filePath of filePaths) {
    const trimmed = filePath.trim();
    if (!trimmed) {
      continue;
    }
    const absolute = path.resolve(trimmed);
    if (unique.has(absolute)) {
      continue;
    }
    unique.add(absolute);
    ordered.push(absolute);
  }
  return ordered;
}

function normalizeToolValue(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeToolMatchKey(raw: string | undefined): string | null {
  const value = normalizeToolValue(raw);
  return value ? value.toLowerCase() : null;
}

export function stableAgentRuntimeIdForSource(filePath: string): string {
  const base = path
    .basename(filePath)
    .replace(/\.jsonl$/i, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const normalizedBase = base.length > 0 ? base : "agent";
  const suffix = createHash("sha1").update(path.resolve(filePath)).digest("hex").slice(0, 6);
  return `${normalizedBase}-${suffix}`;
}

export class ClaudeJsonlRuntimeHub {
  private readonly handlers: RuntimeHubHandlers;
  private running = false;

  private pollInFlight = false;

  private pollTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  private readonly eventBuffer: RawRuntimeEvent[] = [];
  private readonly lastActivityByAgent = new Map<string, number>();
  private readonly currentSessionRuntimeIdByAgent = new Map<string, string | null>();
  private readonly idleAgents = new Set<string>();
  private readonly pendingToolStartsByAgent = new Map<string, PendingToolStart[]>();
  private readonly sources = new Map<string, WatchedSource>();
  private sourceCursor = 0;

  constructor(handlers: RuntimeHubHandlers) {
    this.handlers = handlers;
  }

  start(filePaths: string[]): void {
    const normalized = normalizePaths(filePaths);

    if (normalized.length === 0) {
      this.stop();
      return;
    }

    this.syncSources(normalized);

    if (this.running) {
      return;
    }

    this.running = true;
    this.startPollingLoop();
  }

  stop(): void {
    this.running = false;
    this.pollInFlight = false;

    this.lastActivityByAgent.clear();
    this.currentSessionRuntimeIdByAgent.clear();
    this.idleAgents.clear();
    this.pendingToolStartsByAgent.clear();
    this.sources.clear();
    this.sourceCursor = 0;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  getRecentEvents(): RawRuntimeEvent[] {
    return [...this.eventBuffer];
  }

  private syncSources(nextPaths: string[]): void {
    const nextSet = new Set(nextPaths);

    for (const existingPath of [...this.sources.keys()]) {
      if (!nextSet.has(existingPath)) {
        this.sources.delete(existingPath);
      }
    }

    for (const filePath of nextPaths) {
      if (!this.sources.has(filePath)) {
        this.sources.set(filePath, {
          filePath,
          // Start at EOF so historical transcripts do not flood the dashboard.
          offset: initialOffset(filePath),
          remainder: "",
          nextRetryAt: 0,
          didReportError: false
        });
      }
    }
  }

  private startPollingLoop(): void {
    void this.pollOnce();

    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, WATCHER_POLL_MS);

    this.idleTimer = setInterval(() => {
      this.handleIdleTick();
    }, 1000);
  }

  private async pollOnce(): Promise<void> {
    if (!this.running || this.pollInFlight) {
      return;
    }

    const sources = [...this.sources.values()];
    if (sources.length === 0) {
      this.stop();
      return;
    }

    this.pollInFlight = true;
    try {
      const targets = this.pickSourcesForTick(sources);
      await Promise.all(targets.map((source) => this.pollSource(source)));
    } finally {
      this.pollInFlight = false;
    }
  }

  private pickSourcesForTick(sources: WatchedSource[]): WatchedSource[] {
    if (sources.length <= MAX_POLLED_SOURCES_PER_TICK) {
      return sources;
    }

    const selected: WatchedSource[] = [];
    const start = this.sourceCursor % sources.length;
    for (let index = 0; index < MAX_POLLED_SOURCES_PER_TICK; index += 1) {
      selected.push(sources[(start + index) % sources.length]);
    }
    this.sourceCursor = (start + MAX_POLLED_SOURCES_PER_TICK) % sources.length;
    return selected;
  }

  private async pollSource(source: WatchedSource): Promise<void> {
    const now = Date.now();
    if (now < source.nextRetryAt) {
      return;
    }

    try {
      const stat = await fs.stat(source.filePath);

      if (stat.size < source.offset) {
        source.offset = 0;
        source.remainder = "";
      }

      const delta = stat.size - source.offset;
      if (delta <= 0) {
        source.didReportError = false;
        source.nextRetryAt = 0;
        return;
      }

      const nextChunk = await readSlice(source.filePath, source.offset, delta);
      source.offset = stat.size;
      source.didReportError = false;
      source.nextRetryAt = 0;

      this.consumeChunk(source, nextChunk);
    } catch (error) {
      source.nextRetryAt = now + WATCHER_RETRY_MS;
      if (!source.didReportError) {
        source.didReportError = true;
        this.handlers.onError?.(error);
      }
    }
  }

  private consumeChunk(source: WatchedSource, chunk: string): void {
    const merged = `${source.remainder}${chunk}`;
    const lines = merged.split(/\r?\n/);
    source.remainder = lines.pop() ?? "";

    const fallbackAgentId = stableAgentRuntimeIdForSource(source.filePath);

    for (const line of lines) {
      const event = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: fallbackAgentId });
      if (!event) {
        continue;
      }

      let sourceEvent: RawRuntimeEvent = {
        ...event,
        // Keep runtime identity stable per JSONL file to avoid request/session key churn.
        agentRuntimeId: fallbackAgentId,
        sessionRuntimeId: normalizeToolValue(event.sessionRuntimeId ?? undefined) ??
          this.currentSessionRuntimeIdByAgent.get(fallbackAgentId) ??
          null,
        sourcePath: source.filePath,
        ingestSource: "jsonl"
      };

      if (sourceEvent.sessionRuntimeId) {
        this.currentSessionRuntimeIdByAgent.set(sourceEvent.agentRuntimeId, sourceEvent.sessionRuntimeId);
      }

      if (sourceEvent.type === "tool_start") {
        this.recordToolStart(sourceEvent.agentRuntimeId, sourceEvent);
      } else if (sourceEvent.type === "tool_done") {
        const matched = this.consumePendingToolStart(sourceEvent.agentRuntimeId, sourceEvent);
        if (matched) {
          if (!normalizeToolValue(sourceEvent.toolName) && matched.toolName) {
            sourceEvent = {
              ...sourceEvent,
              toolName: matched.toolName
            };
          }
          if (!normalizeToolValue(sourceEvent.toolId) && matched.toolId) {
            sourceEvent = {
              ...sourceEvent,
              toolId: matched.toolId
            };
          }
        }
      }

      this.registerActivity(sourceEvent.agentRuntimeId, sourceEvent.ts, sourceEvent.type);

      if (sourceEvent.type === "turn_waiting") {
        this.idleAgents.add(sourceEvent.agentRuntimeId);
      }
      if (sourceEvent.type === "turn_active") {
        this.idleAgents.delete(sourceEvent.agentRuntimeId);
      }

      this.pushEvent(sourceEvent);
    }
  }

  private registerActivity(agentRuntimeId: string, ts: number, eventType: RawRuntimeEvent["type"]): void {
    const wasIdle = this.idleAgents.has(agentRuntimeId);
    this.lastActivityByAgent.set(agentRuntimeId, ts);

    if (wasIdle && eventType !== "turn_active") {
      this.idleAgents.delete(agentRuntimeId);
      this.pushEvent({
        runtime: "claude-jsonl",
        ingestSource: "jsonl",
        agentRuntimeId,
        sessionRuntimeId: this.currentSessionRuntimeIdByAgent.get(agentRuntimeId) ?? null,
        ts,
        type: "turn_active",
        detail: "activity resumed"
      });
    }
  }

  private handleIdleTick(): void {
    if (!this.running) {
      return;
    }

    const now = Date.now();
    for (const [agentRuntimeId, lastTs] of this.lastActivityByAgent.entries()) {
      if (this.pendingToolStartCount(agentRuntimeId) > 0) {
        continue;
      }
      if (now - lastTs >= IDLE_WAIT_MS && !this.idleAgents.has(agentRuntimeId)) {
        this.idleAgents.add(agentRuntimeId);
        this.pushEvent({
          runtime: "claude-jsonl",
          ingestSource: "jsonl",
          agentRuntimeId,
          sessionRuntimeId: this.currentSessionRuntimeIdByAgent.get(agentRuntimeId) ?? null,
          ts: now,
          type: "turn_waiting",
          detail: "idle timeout"
        });
      }
    }
  }

  private pushEvent(event: RawRuntimeEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > INTERNAL_EVENT_LIMIT) {
      this.eventBuffer.shift();
    }
    this.handlers.onEvent(event);
  }

  private pendingToolStartCount(agentRuntimeId: string): number {
    return this.pendingToolStartsByAgent.get(agentRuntimeId)?.length ?? 0;
  }

  private recordToolStart(agentRuntimeId: string, event: RawRuntimeEvent): void {
    const queue = this.pendingToolStartsByAgent.get(agentRuntimeId) ?? [];
    queue.push({
      startTs: Number.isFinite(event.ts) ? event.ts : Date.now(),
      toolId: normalizeToolValue(event.toolId),
      toolName: normalizeToolValue(event.toolName),
      toolIdKey: normalizeToolMatchKey(event.toolId),
      toolNameKey: normalizeToolMatchKey(event.toolName)
    });
    if (queue.length > MAX_PENDING_TOOL_STARTS_PER_AGENT) {
      queue.splice(0, queue.length - MAX_PENDING_TOOL_STARTS_PER_AGENT);
    }
    this.pendingToolStartsByAgent.set(agentRuntimeId, queue);
  }

  private consumePendingToolStart(agentRuntimeId: string, event: RawRuntimeEvent): PendingToolStart | null {
    const queue = this.pendingToolStartsByAgent.get(agentRuntimeId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const toolId = normalizeToolMatchKey(event.toolId);
    const toolName = normalizeToolMatchKey(event.toolName);

    let index = -1;
    if (toolId) {
      index = queue.findIndex((candidate) => candidate.toolIdKey === toolId);
    }
    if (index < 0 && toolName) {
      index = queue.findIndex((candidate) => candidate.toolNameKey === toolName);
    }
    if (index < 0) {
      index = 0;
    }

    const [matched] = queue.splice(index, 1);
    if (queue.length === 0) {
      this.pendingToolStartsByAgent.delete(agentRuntimeId);
    } else {
      this.pendingToolStartsByAgent.set(agentRuntimeId, queue);
    }

    return matched ?? null;
  }
}
