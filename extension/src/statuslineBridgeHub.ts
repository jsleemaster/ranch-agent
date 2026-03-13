import * as http from "node:http";

import type { StatuslineRawSnapshot } from "../../shared/runtime";
import {
  STATUSLINE_DEFAULT_BIND,
  STATUSLINE_DEFAULT_PATH,
  STATUSLINE_DEFAULT_PORT,
  STATUSLINE_DRAIN_BATCH,
  STATUSLINE_MAX_BODY_BYTES,
  STATUSLINE_QUEUE_LIMIT
} from "./constants";
import { parseClaudeStatuslinePayload } from "./statuslinePayloadParser";

interface StatuslineRawLikeRecord {
  ts: number;
  isoTime: string;
  method: string;
  path: string;
  sourceUrl: string;
  bodyBytes: number;
  payload: Record<string, unknown>;
}

export interface ClaudeStatuslineBridgeConfig {
  enabled: boolean;
  bind: string;
  port: number;
  path: string;
  authToken: string;
}

interface NormalizedStatuslineBridgeConfig extends ClaudeStatuslineBridgeConfig {
  path: string;
}

export interface StatuslineListeningInfo {
  bind: string;
  port: number;
  path: string;
}

interface ClaudeStatuslineBridgeHandlers {
  onSnapshot: (snapshot: StatuslineRawSnapshot) => void;
  onError?: (error: unknown) => void;
  onLog?: (message: string) => void;
  onRawPayload?: (record: StatuslineRawLikeRecord) => void;
}

function normalizeBind(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return value.length > 0 ? value : STATUSLINE_DEFAULT_BIND;
}

function normalizePort(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return STATUSLINE_DEFAULT_PORT;
  }
  const floored = Math.floor(raw);
  if (floored < 0 || floored > 65535) {
    return STATUSLINE_DEFAULT_PORT;
  }
  return floored;
}

function normalizePath(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return STATUSLINE_DEFAULT_PATH;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeAuthToken(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function normalizeConfig(raw: ClaudeStatuslineBridgeConfig): NormalizedStatuslineBridgeConfig {
  return {
    enabled: raw.enabled,
    bind: normalizeBind(raw.bind),
    port: normalizePort(raw.port),
    path: normalizePath(raw.path),
    authToken: normalizeAuthToken(raw.authToken)
  };
}

function configKey(config: NormalizedStatuslineBridgeConfig): string {
  return `${config.enabled ? "1" : "0"}|${config.bind}|${config.port}|${config.path}|${config.authToken}`;
}

export function isStatuslineAuthorized(authorizationHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) {
    return true;
  }
  return authorizationHeader === `Bearer ${expectedToken}`;
}

export function isStatuslinePayloadTooLarge(bodyBytes: number): boolean {
  return bodyBytes > STATUSLINE_MAX_BODY_BYTES;
}

function responseAck(res: http.ServerResponse): void {
  if (res.writableEnded) {
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end('{"status":"ok"}');
}

function responseNotFound(res: http.ServerResponse): void {
  if (res.writableEnded) {
    return;
  }
  res.statusCode = 404;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end("not found");
}

function parseRequestPath(urlRaw: string | undefined): string {
  if (!urlRaw) {
    return "/";
  }
  try {
    return new URL(urlRaw, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function inferSourceUrl(req: http.IncomingMessage, listen: StatuslineListeningInfo): string {
  const hostHeader = req.headers.host;
  const host = hostHeader && hostHeader.trim().length > 0 ? hostHeader : `${listen.bind}:${listen.port}`;
  const pathValue = req.url && req.url.length > 0 ? req.url : listen.path;
  return `http://${host}${pathValue}`;
}

export class ClaudeStatuslineBridgeHub {
  private readonly handlers: ClaudeStatuslineBridgeHandlers;
  private server: http.Server | null = null;
  private currentConfig: NormalizedStatuslineBridgeConfig | null = null;
  private currentConfigKey: string | null = null;
  private listeningInfo: StatuslineListeningInfo | null = null;
  private readonly queue: StatuslineRawSnapshot[] = [];
  private draining = false;
  private droppedSnapshots = 0;

  constructor(handlers: ClaudeStatuslineBridgeHandlers) {
    this.handlers = handlers;
  }

  start(config: ClaudeStatuslineBridgeConfig): void {
    const normalized = normalizeConfig(config);
    if (!normalized.enabled) {
      this.stop();
      return;
    }

    const key = configKey(normalized);
    if (this.server && this.currentConfigKey === key) {
      return;
    }

    this.stop();
    this.currentConfig = normalized;
    this.currentConfigKey = key;

    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    server.on("error", (error) => {
      this.handlers.onError?.(error);
      this.handlers.onLog?.(
        `[statusline] failed to bind ${normalized.bind}:${normalized.port}${normalized.path}: ${String(error)}`
      );
    });

    server.listen(normalized.port, normalized.bind, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : normalized.port;
      this.listeningInfo = {
        bind: normalized.bind,
        port,
        path: normalized.path
      };
      this.handlers.onLog?.(`[statusline] listening on http://${normalized.bind}:${port}${normalized.path}`);
    });

    this.server = server;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.currentConfig = null;
    this.currentConfigKey = null;
    this.listeningInfo = null;
    this.queue.length = 0;
    this.draining = false;
    this.droppedSnapshots = 0;
  }

  getListeningInfo(): StatuslineListeningInfo | null {
    if (!this.listeningInfo) {
      return null;
    }
    return { ...this.listeningInfo };
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const config = this.currentConfig;
    const listen = this.listeningInfo;
    if (!config || !listen) {
      responseAck(res);
      return;
    }

    const method = (req.method ?? "GET").toUpperCase();
    const requestPath = parseRequestPath(req.url);
    if (method !== "POST" || requestPath !== config.path) {
      responseNotFound(res);
      return;
    }

    if (!isStatuslineAuthorized(req.headers.authorization, config.authToken)) {
      req.resume();
      this.handlers.onLog?.("[statusline] unauthorized request dropped");
      responseAck(res);
      return;
    }

    const raw = await this.readBody(req);
    if (raw.tooLarge) {
      this.handlers.onLog?.(`[statusline] payload exceeded ${STATUSLINE_MAX_BODY_BYTES} bytes and was dropped`);
      responseAck(res);
      return;
    }
    if (!raw.text) {
      responseAck(res);
      return;
    }

    let payloadUnknown: unknown;
    try {
      payloadUnknown = JSON.parse(raw.text);
    } catch {
      this.handlers.onLog?.("[statusline] invalid JSON payload dropped");
      responseAck(res);
      return;
    }

    const payload = payloadUnknown && typeof payloadUnknown === "object" && !Array.isArray(payloadUnknown)
      ? (payloadUnknown as Record<string, unknown>)
      : null;
    if (!payload) {
      responseAck(res);
      return;
    }

    const sourceUrl = inferSourceUrl(req, listen);
    this.handlers.onRawPayload?.({
      ts: Date.now(),
      isoTime: new Date().toISOString(),
      method,
      path: requestPath,
      sourceUrl,
      bodyBytes: raw.bytes,
      payload
    });

    const snapshot = parseClaudeStatuslinePayload(payload);
    if (snapshot) {
      this.enqueueSnapshot(snapshot);
    }

    responseAck(res);
  }

  private async readBody(req: http.IncomingMessage): Promise<{ text: string; bytes: number; tooLarge: boolean }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      let tooLarge = false;

      req.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (isStatuslinePayloadTooLarge(bytes)) {
          tooLarge = true;
          return;
        }
        chunks.push(buffer);
      });

      req.on("end", () => {
        const text = tooLarge ? "" : Buffer.concat(chunks).toString("utf8").trim();
        resolve({ text, bytes, tooLarge });
      });

      req.on("error", () => {
        resolve({ text: "", bytes, tooLarge: true });
      });
    });
  }

  private enqueueSnapshot(snapshot: StatuslineRawSnapshot): void {
    if (this.queue.length >= STATUSLINE_QUEUE_LIMIT) {
      this.droppedSnapshots += 1;
      if (this.droppedSnapshots === 1 || this.droppedSnapshots % 50 === 0) {
        this.handlers.onLog?.(
          `[statusline] queue overflow: dropped ${this.droppedSnapshots} snapshots (limit=${STATUSLINE_QUEUE_LIMIT})`
        );
      }
      return;
    }

    this.queue.push(snapshot);
    if (!this.draining) {
      this.drainQueue();
    }
  }

  private drainQueue(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;

    setImmediate(() => {
      try {
        let count = 0;
        while (this.queue.length > 0 && count < STATUSLINE_DRAIN_BATCH) {
          const next = this.queue.shift();
          if (next) {
            this.handlers.onSnapshot(next);
          }
          count += 1;
        }
      } finally {
        this.draining = false;
        if (this.queue.length > 0) {
          this.drainQueue();
        }
      }
    });
  }
}
