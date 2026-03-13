import * as http from "node:http";

import type { RawRuntimeEvent } from "../../shared/runtime";
import {
  HTTP_HOOK_DEFAULT_BIND,
  HTTP_HOOK_DEFAULT_PATH,
  HTTP_HOOK_DEFAULT_PORT,
  HTTP_HOOK_DRAIN_BATCH,
  HTTP_HOOK_MAX_BODY_BYTES,
  HTTP_HOOK_QUEUE_LIMIT
} from "./constants";
import { parseClaudeHttpHookPayload } from "./hookPayloadParser";

interface HttpHookRawLikeRecord {
  ts: number;
  isoTime: string;
  method: string;
  path: string;
  sourceUrl: string;
  bodyBytes: number;
  hookEventName?: string;
  payload: Record<string, unknown>;
}

export interface ClaudeHttpHookRuntimeConfig {
  enabled: boolean;
  bind: string;
  port: number;
  path: string;
  authToken: string;
}

interface NormalizedHttpHookRuntimeConfig extends ClaudeHttpHookRuntimeConfig {
  path: string;
}

export interface HttpHookListeningInfo {
  bind: string;
  port: number;
  path: string;
}

interface ClaudeHttpHookRuntimeHubHandlers {
  onEvent: (event: RawRuntimeEvent) => void;
  onError?: (error: unknown) => void;
  onLog?: (message: string) => void;
  onRawPayload?: (record: HttpHookRawLikeRecord) => void;
}

function normalizeBind(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return value.length > 0 ? value : HTTP_HOOK_DEFAULT_BIND;
}

function normalizePort(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return HTTP_HOOK_DEFAULT_PORT;
  }
  const floored = Math.floor(raw);
  if (floored < 0 || floored > 65535) {
    return HTTP_HOOK_DEFAULT_PORT;
  }
  return floored;
}

function normalizePath(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) {
    return HTTP_HOOK_DEFAULT_PATH;
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeAuthToken(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function normalizeConfig(raw: ClaudeHttpHookRuntimeConfig): NormalizedHttpHookRuntimeConfig {
  return {
    enabled: raw.enabled,
    bind: normalizeBind(raw.bind),
    port: normalizePort(raw.port),
    path: normalizePath(raw.path),
    authToken: normalizeAuthToken(raw.authToken)
  };
}

function configKey(config: NormalizedHttpHookRuntimeConfig): string {
  return `${config.enabled ? "1" : "0"}|${config.bind}|${config.port}|${config.path}|${config.authToken}`;
}

export function isHttpHookAuthorized(authorizationHeader: string | undefined, expectedToken: string): boolean {
  if (!expectedToken) {
    return true;
  }
  return authorizationHeader === `Bearer ${expectedToken}`;
}

export function isHttpHookPayloadTooLarge(bodyBytes: number): boolean {
  return bodyBytes > HTTP_HOOK_MAX_BODY_BYTES;
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

function inferHookEventName(payload: Record<string, unknown>): string | undefined {
  const value = payload.hook_event_name;
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function inferSourceUrl(req: http.IncomingMessage, listen: HttpHookListeningInfo): string {
  const hostHeader = req.headers.host;
  const host = hostHeader && hostHeader.trim().length > 0 ? hostHeader : `${listen.bind}:${listen.port}`;
  const pathValue = req.url && req.url.length > 0 ? req.url : listen.path;
  return `http://${host}${pathValue}`;
}

export class ClaudeHttpHookRuntimeHub {
  private readonly handlers: ClaudeHttpHookRuntimeHubHandlers;
  private server: http.Server | null = null;
  private currentConfig: NormalizedHttpHookRuntimeConfig | null = null;
  private currentConfigKey: string | null = null;
  private listeningInfo: HttpHookListeningInfo | null = null;

  private readonly queue: RawRuntimeEvent[] = [];
  private draining = false;
  private droppedEvents = 0;

  constructor(handlers: ClaudeHttpHookRuntimeHubHandlers) {
    this.handlers = handlers;
  }

  start(config: ClaudeHttpHookRuntimeConfig): void {
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
      this.handlers.onLog?.(`[http-hook] failed to bind ${normalized.bind}:${normalized.port}${normalized.path}: ${String(error)}`);
    });

    server.listen(normalized.port, normalized.bind, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : normalized.port;
      this.listeningInfo = {
        bind: normalized.bind,
        port,
        path: normalized.path
      };
      this.handlers.onLog?.(`[http-hook] listening on http://${normalized.bind}:${port}${normalized.path}`);
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
    this.droppedEvents = 0;
  }

  getListeningInfo(): HttpHookListeningInfo | null {
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

    if (!isHttpHookAuthorized(req.headers.authorization, config.authToken)) {
      req.resume();
      this.handlers.onLog?.("[http-hook] unauthorized request dropped");
      responseAck(res);
      return;
    }

    const raw = await this.readBody(req);
    if (raw.tooLarge) {
      this.handlers.onLog?.(`[http-hook] payload exceeded ${HTTP_HOOK_MAX_BODY_BYTES} bytes and was dropped`);
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
      this.handlers.onLog?.("[http-hook] invalid JSON payload dropped");
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
      hookEventName: inferHookEventName(payload),
      payload
    });

    const event = parseClaudeHttpHookPayload(payload, { sourceUrl });
    if (event) {
      this.enqueueEvent(event);
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
        if (isHttpHookPayloadTooLarge(bytes)) {
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

  private enqueueEvent(event: RawRuntimeEvent): void {
    if (this.queue.length >= HTTP_HOOK_QUEUE_LIMIT) {
      this.droppedEvents += 1;
      if (this.droppedEvents === 1 || this.droppedEvents % 100 === 0) {
        this.handlers.onLog?.(
          `[http-hook] queue overflow: dropped ${this.droppedEvents} events (limit=${HTTP_HOOK_QUEUE_LIMIT})`
        );
      }
      return;
    }

    this.queue.push(event);
    this.scheduleDrain();
  }

  private scheduleDrain(): void {
    if (this.draining) {
      return;
    }
    this.draining = true;
    setImmediate(() => {
      this.draining = false;
      this.drainQueue();
    });
  }

  private drainQueue(): void {
    let processed = 0;
    while (processed < HTTP_HOOK_DRAIN_BATCH && this.queue.length > 0) {
      const event = this.queue.shift();
      if (!event) {
        continue;
      }
      processed += 1;
      this.handlers.onEvent(event);
    }

    if (this.queue.length > 0) {
      this.scheduleDrain();
    }
  }
}
