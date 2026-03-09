import * as fs from "node:fs/promises";
import * as path from "node:path";

const FLUSH_INTERVAL_MS = 800;
const IMMEDIATE_FLUSH_COUNT = 32;
const MAX_BUFFERED_LINES = 1024;

interface OutputLike {
  appendLine(message: string): void;
}

export interface HttpHookRawLoggerConfig {
  enabled: boolean;
  filePath: string;
}

export interface HttpHookRawRecord {
  ts: number;
  isoTime: string;
  method: string;
  path: string;
  sourceUrl: string;
  bodyBytes: number;
  hookEventName?: string;
  payload: Record<string, unknown>;
}

export class HttpHookRawLogger {
  private config: HttpHookRawLoggerConfig;
  private readonly output: OutputLike;
  private readonly lines: string[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private flushing = false;
  private droppedLines = 0;

  constructor(output: OutputLike, config: HttpHookRawLoggerConfig) {
    this.output = output;
    this.config = config;
  }

  updateConfig(next: HttpHookRawLoggerConfig): void {
    this.config = next;
  }

  capture(record: HttpHookRawRecord): void {
    if (!this.config.enabled) {
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
        this.output.appendLine(`[debug] http-hook raw logger dropped ${this.droppedLines} buffered lines due to backpressure`);
        this.droppedLines = 0;
      }
    } catch (error) {
      this.output.appendLine(`[debug] failed to write http-hook raw log: ${String(error)}`);
    } finally {
      this.flushing = false;
      if (this.lines.length > 0) {
        this.ensureFlushTimer();
      }
    }
  }
}

