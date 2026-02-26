import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { RawRuntimeEvent } from "../../shared/runtime";
import { IDLE_WAIT_MS, INTERNAL_EVENT_LIMIT, WATCHER_POLL_MS, WATCHER_RETRY_MS } from "./constants";
import { parseClaudeJsonlLine } from "./runtimeParser";

interface RuntimeHubHandlers {
  onEvent: (event: RawRuntimeEvent) => void;
  onError?: (error: unknown) => void;
}

interface WatchedSource {
  filePath: string;
  offset: number;
  remainder: string;
  nextRetryAt: number;
  didReportError: boolean;
}

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
  for (const filePath of filePaths) {
    const trimmed = filePath.trim();
    if (!trimmed) {
      continue;
    }
    unique.add(path.resolve(trimmed));
  }
  return [...unique].sort((a, b) => a.localeCompare(b));
}

export class ClaudeJsonlRuntimeHub {
  private readonly handlers: RuntimeHubHandlers;
  private running = false;

  private pollInFlight = false;

  private pollTimer: NodeJS.Timeout | undefined;
  private idleTimer: NodeJS.Timeout | undefined;

  private readonly eventBuffer: RawRuntimeEvent[] = [];
  private readonly lastActivityByAgent = new Map<string, number>();
  private readonly idleAgents = new Set<string>();
  private readonly sources = new Map<string, WatchedSource>();

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
    this.idleAgents.clear();
    this.sources.clear();

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
      for (const source of sources) {
        await this.pollSource(source);
      }
    } finally {
      this.pollInFlight = false;
    }
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

    const fallbackAgentId = path.basename(source.filePath).replace(/\.jsonl$/i, "") || "agent";

    for (const line of lines) {
      const event = parseClaudeJsonlLine(line, { fallbackAgentRuntimeId: fallbackAgentId });
      if (!event) {
        continue;
      }

      this.registerActivity(event.agentRuntimeId, event.ts, event.type);

      if (event.type === "turn_waiting") {
        this.idleAgents.add(event.agentRuntimeId);
      }
      if (event.type === "turn_active") {
        this.idleAgents.delete(event.agentRuntimeId);
      }

      this.pushEvent(event);
    }
  }

  private registerActivity(agentRuntimeId: string, ts: number, eventType: RawRuntimeEvent["type"]): void {
    const wasIdle = this.idleAgents.has(agentRuntimeId);
    this.lastActivityByAgent.set(agentRuntimeId, ts);

    if (wasIdle && eventType !== "turn_active") {
      this.idleAgents.delete(agentRuntimeId);
      this.pushEvent({
        runtime: "claude-jsonl",
        agentRuntimeId,
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
      if (now - lastTs >= IDLE_WAIT_MS && !this.idleAgents.has(agentRuntimeId)) {
        this.idleAgents.add(agentRuntimeId);
        this.pushEvent({
          runtime: "claude-jsonl",
          agentRuntimeId,
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
}
