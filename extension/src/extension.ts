import * as path from "node:path";
import * as vscode from "vscode";

import type { ExtToWebviewAtomicMessage, ExtToWebviewMessage } from "../../shared/protocol";
import type { RawRuntimeEvent, StatuslineRawSnapshot } from "../../shared/runtime";
import {
  AUTO_RUNTIME_SCAN_MS,
  CONFIG_SECTION,
  HTTP_HOOK_DEFAULT_BIND,
  HTTP_HOOK_DEFAULT_PATH,
  HTTP_HOOK_DEFAULT_PORT,
  MESSAGE_FLUSH_MS,
  MESSAGE_QUEUE_LIMIT,
  STATUSLINE_DEFAULT_BIND,
  STATUSLINE_DEFAULT_PATH,
  STATUSLINE_DEFAULT_PORT,
  VIEW_TYPE,
  WORLD_REFRESH_MS
} from "./constants";
import { SnapshotStore } from "./domain/snapshotStore";
import { TeamResolver } from "./domain/teamResolver";
import { AgentMdResolver } from "./agentMdResolver";
import { SkillMdResolver } from "./skillMdResolver";
import { loadAssetCatalog, toWebviewAssetCatalog } from "./assetPackLoader";
import {
  DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS,
  DEFAULT_UNMAPPED_SKILL_MAX_DETAIL_CHARS,
  type RelativeLogPathBase,
  type UnmappedSkillReason,
  resolveUnmappedSkillLogPath,
  type UnmappedSkillLoggerConfig,
  UnmappedSkillLogger
} from "./debug/unmappedSkillLogger";
import { HttpHookRawLogger, type HttpHookRawLoggerConfig } from "./debug/httpHookRawLogger";
import { StatuslineRawLogger, type StatuslineRawLoggerConfig } from "./debug/statuslineRawLogger";
import { type BranchDetectSettings, GitBranchResolver } from "./gitBranchResolver";
import { parseWebviewMessage } from "./protocolGuards";
import { resolveProjectPaths, resolveRuntimeJsonlPath } from "./projectPaths";
import { ClaudeJsonlRuntimeHub } from "./runtimeHub";
import { ClaudeHttpHookRuntimeHub, type ClaudeHttpHookRuntimeConfig } from "./httpHookRuntimeHub";
import { RuntimeMux, type RuntimeMergeMode } from "./runtimeMux";
import { ClaudeStatuslineBridgeHub, type ClaudeStatuslineBridgeConfig } from "./statuslineBridgeHub";
import { buildWebviewHtml } from "./webviewContent";

type HttpHookRelativeLogPathBase = "workspace" | "global";
type StatuslineRelativeLogPathBase = "workspace" | "global";

interface HttpHookSettings {
  runtime: ClaudeHttpHookRuntimeConfig;
  mergeMode: RuntimeMergeMode;
  rawLog: HttpHookRawLoggerConfig;
}

interface StatuslineSettings {
  runtime: ClaudeStatuslineBridgeConfig;
  rawLog: StatuslineRawLoggerConfig;
}

class SituationRoomViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly output: vscode.OutputChannel;
  private readonly paths: ReturnType<typeof resolveProjectPaths>;

  private readonly teamResolver: TeamResolver;
  private readonly store: SnapshotStore;
  private readonly agentMdResolver: AgentMdResolver;
  private readonly skillMdResolver: SkillMdResolver;
  private readonly unmappedSkillLogger: UnmappedSkillLogger;
  private readonly httpHookRawLogger: HttpHookRawLogger;
  private readonly statuslineRawLogger: StatuslineRawLogger;
  private readonly branchResolver: GitBranchResolver;
  private readonly runtimeMux: RuntimeMux;
  private readonly runtimeHub: ClaudeJsonlRuntimeHub;
  private readonly httpHookHub: ClaudeHttpHookRuntimeHub;
  private readonly statuslineHub: ClaudeStatuslineBridgeHub;

  private readonly disposables: vscode.Disposable[] = [];

  private flushTimer: NodeJS.Timeout | undefined;
  private runtimeScanTimer: NodeJS.Timeout | undefined;
  private worldRefreshTimer: NodeJS.Timeout | undefined;
  private view: vscode.WebviewView | null = null;
  private webviewReady = false;
  private runtimeLogKey: string | null = null;

  private messageQueue: ExtToWebviewAtomicMessage[] = [];
  private unmappedSkillLoggerConfigKey: string | null = null;
  private httpHookConfigKey: string | null = null;
  private statuslineConfigKey: string | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.output = vscode.window.createOutputChannel("Ranch-Agent");
    this.paths = resolveProjectPaths(context);

    this.teamResolver = new TeamResolver(this.paths.teamConfigPath);
    this.store = new SnapshotStore({
      teamResolver: this.teamResolver
    });
    this.agentMdResolver = new AgentMdResolver(this.paths.workspaceRoot);
    this.skillMdResolver = new SkillMdResolver(this.paths.workspaceRoot);
    const initialUnmappedSkillLoggerConfig = this.readUnmappedSkillLoggerConfig();
    this.unmappedSkillLogger = new UnmappedSkillLogger(this.output, initialUnmappedSkillLoggerConfig);
    this.logUnmappedSkillLoggerConfig(initialUnmappedSkillLoggerConfig);
    this.httpHookRawLogger = new HttpHookRawLogger(this.output, {
      enabled: false,
      filePath: resolveUnmappedSkillLogPath(this.paths.workspaceRoot, ".local-debug/http-hook-events.ndjson", {
        globalRoot: this.context.globalStorageUri.fsPath,
        relativeBase: "global"
      })
    });
    this.statuslineRawLogger = new StatuslineRawLogger(this.output, {
      enabled: false,
      filePath: resolveUnmappedSkillLogPath(this.paths.workspaceRoot, ".local-debug/statusline-events.ndjson", {
        globalRoot: this.context.globalStorageUri.fsPath,
        relativeBase: "global"
      })
    });
    this.branchResolver = new GitBranchResolver(this.paths.workspaceRoot, this.readBranchDetectSettings());

    this.runtimeMux = new RuntimeMux({
      onEvent: (event) => this.handleRuntimeEvent(event),
      onError: (error) => {
        this.output.appendLine(`[runtime-mux-error] ${String(error)}`);
      }
    });

    this.runtimeHub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => this.runtimeMux.push(event),
      onError: (error) => {
        this.output.appendLine(`[runtime-error] ${String(error)}`);
      }
    });

    this.httpHookHub = new ClaudeHttpHookRuntimeHub({
      onEvent: (event) => this.runtimeMux.push(event),
      onError: (error) => this.output.appendLine(`[http-hook-error] ${String(error)}`),
      onLog: (message) => this.output.appendLine(message),
      onRawPayload: (record) => this.httpHookRawLogger.capture(record)
    });

    this.statuslineHub = new ClaudeStatuslineBridgeHub({
      onSnapshot: (snapshot) => {
        this.handleStatuslineSnapshot(snapshot);
      },
      onError: (error) => this.output.appendLine(`[statusline-error] ${String(error)}`),
      onLog: (message) => this.output.appendLine(message),
      onRawPayload: (record) => this.statuslineRawLogger.capture(record)
    });

    this.flushTimer = setInterval(() => {
      this.flushMessageQueue();
    }, MESSAGE_FLUSH_MS);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(`${CONFIG_SECTION}.runtimeJsonlPath`)) {
          this.updateRuntimeSource();
        }
        if (event.affectsConfiguration(`${CONFIG_SECTION}.mainBranchDetect`)) {
          this.branchResolver.updateSettings(this.readBranchDetectSettings());
        }
        if (
          event.affectsConfiguration(`${CONFIG_SECTION}.debug.unmappedSkillLog.enabled`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.debug.unmappedSkillLog.filePath`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.debug.unmappedSkillLog.relativeBase`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.debug.unmappedSkillLog.maxDetailChars`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.debug.unmappedSkillLog.captureReasons`)
        ) {
          this.applyUnmappedSkillLoggerConfig();
        }
        if (
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.enabled`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.bind`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.port`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.path`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.authToken`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.rawLog.enabled`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.rawLog.filePath`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.rawLog.relativeBase`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.httpHook.mergeMode`)
        ) {
          this.applyHttpHookSettings();
        }
        if (
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.enabled`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.bind`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.port`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.path`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.authToken`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.rawLog.enabled`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.rawLog.filePath`) ||
          event.affectsConfiguration(`${CONFIG_SECTION}.statusline.rawLog.relativeBase`)
        ) {
          this.applyStatuslineSettings();
        }
      })
    );

    const relativeTeamConfig = path
      .relative(this.paths.workspaceRoot, this.paths.teamConfigPath)
      .replace(/\\/g, "/");

    if (!relativeTeamConfig.startsWith("..")) {
      const teamConfigWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(this.paths.workspaceRoot, relativeTeamConfig)
      );

      const reload = () => {
        this.teamResolver.reload();
        this.sendWorldInit();
      };

      teamConfigWatcher.onDidChange(reload, this, this.disposables);
      teamConfigWatcher.onDidCreate(reload, this, this.disposables);
      teamConfigWatcher.onDidDelete(reload, this, this.disposables);

      this.disposables.push(teamConfigWatcher);
    }

    const agentMdWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.paths.workspaceRoot, ".claude/agents/**/*.md")
    );
    const reloadAgentMdCatalog = () => {
      this.agentMdResolver.reload();
      this.sendWorldInit();
    };
    agentMdWatcher.onDidChange(reloadAgentMdCatalog, this, this.disposables);
    agentMdWatcher.onDidCreate(reloadAgentMdCatalog, this, this.disposables);
    agentMdWatcher.onDidDelete(reloadAgentMdCatalog, this, this.disposables);
    this.disposables.push(agentMdWatcher);

    const skillMdWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(this.paths.workspaceRoot, ".claude/skills/**/*.md")
    );
    const reloadSkillMdCatalog = () => {
      this.skillMdResolver.reload();
      this.sendWorldInit();
    };
    skillMdWatcher.onDidChange(reloadSkillMdCatalog, this, this.disposables);
    skillMdWatcher.onDidCreate(reloadSkillMdCatalog, this, this.disposables);
    skillMdWatcher.onDidDelete(reloadSkillMdCatalog, this, this.disposables);
    this.disposables.push(skillMdWatcher);

    this.updateRuntimeSource();
    this.applyHttpHookSettings();
    this.applyStatuslineSettings();
    this.runtimeScanTimer = setInterval(() => {
      this.updateRuntimeSource();
    }, AUTO_RUNTIME_SCAN_MS);

    this.worldRefreshTimer = setInterval(() => {
      if (!this.view || !this.webviewReady) {
        return;
      }
      this.sendWorldInit(false);
    }, WORLD_REFRESH_MS);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.webviewReady = false;

    const localResourceRoots = [
      vscode.Uri.file(this.paths.webviewDistDir),
      vscode.Uri.file(this.paths.placeholderPackDir),
      vscode.Uri.file(this.paths.userPackDir),
      vscode.Uri.joinPath(this.context.extensionUri, "media")
    ];

    view.webview.options = {
      enableScripts: true,
      localResourceRoots
    };

    const assetCatalog = toWebviewAssetCatalog(
      view.webview,
      loadAssetCatalog(this.paths.placeholderPackDir, this.paths.userPackDir)
    );

    view.webview.html = buildWebviewHtml({
      webview: view.webview,
      webviewDistDir: this.paths.webviewDistDir,
      assetCatalog
    });

    view.webview.onDidReceiveMessage(
      (rawMessage) => {
        const message = parseWebviewMessage(rawMessage);
        if (!message) {
          return;
        }

        switch (message.type) {
          case "webview_ready":
            this.webviewReady = true;
            this.sendWorldInit();
            return;
          default:
            return;
        }
      },
      null,
      this.disposables
    );

    view.onDidDispose(
      () => {
        this.view = null;
        this.webviewReady = false;
      },
      null,
      this.disposables
    );
  }

  dispose(): void {
    this.runtimeHub.stop();
    this.httpHookHub.stop();
    this.statuslineHub.stop();
    this.runtimeMux.dispose();
    this.unmappedSkillLogger.dispose();
    this.httpHookRawLogger.dispose();
    this.statuslineRawLogger.dispose();
    this.output.dispose();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.runtimeScanTimer) {
      clearInterval(this.runtimeScanTimer);
      this.runtimeScanTimer = undefined;
    }
    if (this.worldRefreshTimer) {
      clearInterval(this.worldRefreshTimer);
      this.worldRefreshTimer = undefined;
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private handleRuntimeEvent(event: RawRuntimeEvent): void {
    const branchEnriched = this.branchResolver.enrich(event);
    const agentEnriched = this.agentMdResolver.enrich(branchEnriched);
    const enrichedEvent = this.skillMdResolver.enrich(agentEnriched);
    this.unmappedSkillLogger.capture(enrichedEvent);
    const update = this.store.applyRawEvent(enrichedEvent);
    this.enqueueMessage({ type: "agent_upsert", agent: update.agent });
    for (const session of update.sessionArchives) {
      this.enqueueMessage({ type: "session_archive_append", session });
    }
    for (const metric of update.skillMetrics) {
      this.enqueueMessage({ type: "skill_metric_upsert", metric });
    }
    for (const metric of update.signalMetrics) {
      this.enqueueMessage({ type: "runtime_signal_metric_upsert", metric });
    }
    this.enqueueMessage({ type: "feed_append", event: update.feed });
  }

  private handleStatuslineSnapshot(snapshot: StatuslineRawSnapshot): void {
    const update = this.store.applyStatuslineSnapshot(snapshot);

    for (const session of update.sessionArchives) {
      this.enqueueMessage({ type: "session_archive_append", session });
    }
    if (update.budget) {
      this.enqueueMessage({ type: "budget_upsert", budget: update.budget });
    }
    for (const feed of update.feed) {
      this.enqueueMessage({ type: "feed_append", event: feed });
    }
  }

  private updateRuntimeSource(): void {
    const resolution = resolveRuntimeJsonlPath(this.paths.workspaceRoot);
    this.runtimeHub.start(resolution.paths);

    if (resolution.paths.length > 0) {
      const stablePaths = [...resolution.paths].sort((a, b) => a.localeCompare(b));
      const key = `${resolution.source}:${stablePaths.join("|")}`;
      if (this.runtimeLogKey !== key) {
        const mode = resolution.source === "settings" ? "manual" : "auto";
        const label =
          resolution.paths.length === 1
            ? resolution.paths[0]
            : `${resolution.paths.length} files (latest: ${resolution.paths[0]})`;
        this.output.appendLine(`[runtime] watching (${mode}): ${label}`);
        this.runtimeLogKey = key;
      }
      return;
    }

    const waitingKey = `waiting:${resolution.scanDir}`;
    if (this.runtimeLogKey !== waitingKey) {
      this.output.appendLine(
        `[runtime] no JSONL found yet in ${resolution.scanDir} (or set expeditionSituationRoom.runtimeJsonlPath)`
      );
      this.runtimeLogKey = waitingKey;
    }
  }

  private readBranchDetectSettings(): BranchDetectSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const enabled = config.get<boolean>("mainBranchDetect.enabled", true);
    const mainBranchNames = config.get<string[]>("mainBranchDetect.mainBranchNames", ["main", "master", "trunk"]);
    const excludeAgentIdPattern = config.get<string>("mainBranchDetect.excludeAgentIdPattern", "");
    return {
      enabled,
      mainBranchNames: Array.isArray(mainBranchNames) ? mainBranchNames : ["main", "master", "trunk"],
      excludeAgentIdPattern
    };
  }

  private readUnmappedSkillLoggerConfig(): UnmappedSkillLoggerConfig {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const enabled = config.get<boolean>("debug.unmappedSkillLog.enabled", false);
    const configuredPath = config.get<string>("debug.unmappedSkillLog.filePath", "");
    const relativeBase = config.get<RelativeLogPathBase>("debug.unmappedSkillLog.relativeBase", "global");
    const maxDetailChars = config.get<number>(
      "debug.unmappedSkillLog.maxDetailChars",
      DEFAULT_UNMAPPED_SKILL_MAX_DETAIL_CHARS
    );
    const rawCaptureReasons = config.get<string[]>(
      "debug.unmappedSkillLog.captureReasons",
      DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS
    );
    const captureReasons = this.normalizeUnmappedCaptureReasons(rawCaptureReasons);
    const filePath = resolveUnmappedSkillLogPath(this.paths.workspaceRoot, configuredPath, {
      globalRoot: this.context.globalStorageUri.fsPath,
      relativeBase
    });
    return {
      enabled,
      filePath,
      maxDetailChars,
      captureReasons
    };
  }

  private applyUnmappedSkillLoggerConfig(): void {
    const next = this.readUnmappedSkillLoggerConfig();
    this.unmappedSkillLogger.updateConfig(next);
    this.logUnmappedSkillLoggerConfig(next);
  }

  private logUnmappedSkillLoggerConfig(config: UnmappedSkillLoggerConfig): void {
    const reasons = config.captureReasons.join(",");
    const key = `${config.enabled ? "1" : "0"}|${config.filePath}|${config.maxDetailChars}|${reasons}`;
    if (this.unmappedSkillLoggerConfigKey === key) {
      return;
    }
    this.unmappedSkillLoggerConfigKey = key;
    const state = config.enabled ? "enabled" : "disabled";
    this.output.appendLine(
      `[debug] unmapped-skill logger ${state}: ${config.filePath} (maxDetailChars=${config.maxDetailChars}, reasons=${reasons})`
    );
  }

  private readHttpHookSettings(): HttpHookSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    const enabled = config.get<boolean>("httpHook.enabled", false);
    const bind = config.get<string>("httpHook.bind", HTTP_HOOK_DEFAULT_BIND);
    const port = config.get<number>("httpHook.port", HTTP_HOOK_DEFAULT_PORT);
    const pathValue = config.get<string>("httpHook.path", HTTP_HOOK_DEFAULT_PATH);
    const authToken = config.get<string>("httpHook.authToken", "");
    const mergeModeRaw = config.get<string>("httpHook.mergeMode", "jsonl_primary");
    const mergeMode: RuntimeMergeMode = mergeModeRaw === "jsonl_primary" ? "jsonl_primary" : "jsonl_primary";

    const rawLogEnabled = config.get<boolean>("httpHook.rawLog.enabled", false);
    const rawLogPath = config.get<string>("httpHook.rawLog.filePath", ".local-debug/http-hook-events.ndjson");
    const rawLogRelativeBase = config.get<HttpHookRelativeLogPathBase>("httpHook.rawLog.relativeBase", "global");

    return {
      runtime: {
        enabled,
        bind,
        port,
        path: pathValue,
        authToken
      },
      mergeMode,
      rawLog: {
        enabled: rawLogEnabled,
        filePath: resolveUnmappedSkillLogPath(this.paths.workspaceRoot, rawLogPath, {
          globalRoot: this.context.globalStorageUri.fsPath,
          relativeBase: rawLogRelativeBase
        })
      }
    };
  }

  private applyHttpHookSettings(): void {
    const settings = this.readHttpHookSettings();
    this.runtimeMux.updateMergeMode(settings.mergeMode);
    this.httpHookHub.start(settings.runtime);
    this.httpHookRawLogger.updateConfig(settings.rawLog);
    this.logHttpHookSettings(settings);
  }

  private logHttpHookSettings(settings: HttpHookSettings): void {
    const key = [
      settings.runtime.enabled ? "1" : "0",
      settings.runtime.bind,
      settings.runtime.port,
      settings.runtime.path,
      settings.mergeMode,
      settings.rawLog.enabled ? "1" : "0",
      settings.rawLog.filePath
    ].join("|");
    if (this.httpHookConfigKey === key) {
      return;
    }
    this.httpHookConfigKey = key;

    const enabledText = settings.runtime.enabled ? "enabled" : "disabled";
    const rawText = settings.rawLog.enabled ? `enabled (${settings.rawLog.filePath})` : "disabled";
    this.output.appendLine(
      `[http-hook] ${enabledText}: ${settings.runtime.bind}:${settings.runtime.port}${settings.runtime.path} (mergeMode=${settings.mergeMode}, rawLog=${rawText})`
    );
  }

  private readStatuslineSettings(): StatuslineSettings {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    const enabled = config.get<boolean>("statusline.enabled", false);
    const bind = config.get<string>("statusline.bind", STATUSLINE_DEFAULT_BIND);
    const port = config.get<number>("statusline.port", STATUSLINE_DEFAULT_PORT);
    const pathValue = config.get<string>("statusline.path", STATUSLINE_DEFAULT_PATH);
    const authToken = config.get<string>("statusline.authToken", "");

    const rawLogEnabled = config.get<boolean>("statusline.rawLog.enabled", false);
    const rawLogPath = config.get<string>("statusline.rawLog.filePath", ".local-debug/statusline-events.ndjson");
    const rawLogRelativeBase = config.get<StatuslineRelativeLogPathBase>("statusline.rawLog.relativeBase", "global");

    return {
      runtime: {
        enabled,
        bind,
        port,
        path: pathValue,
        authToken
      },
      rawLog: {
        enabled: rawLogEnabled,
        filePath: resolveUnmappedSkillLogPath(this.paths.workspaceRoot, rawLogPath, {
          globalRoot: this.context.globalStorageUri.fsPath,
          relativeBase: rawLogRelativeBase
        })
      }
    };
  }

  private applyStatuslineSettings(): void {
    const settings = this.readStatuslineSettings();
    this.statuslineHub.start(settings.runtime);
    this.statuslineRawLogger.updateConfig(settings.rawLog);
    this.logStatuslineSettings(settings);
  }

  private logStatuslineSettings(settings: StatuslineSettings): void {
    const key = [
      settings.runtime.enabled ? "1" : "0",
      settings.runtime.bind,
      settings.runtime.port,
      settings.runtime.path,
      settings.rawLog.enabled ? "1" : "0",
      settings.rawLog.filePath
    ].join("|");
    if (this.statuslineConfigKey === key) {
      return;
    }
    this.statuslineConfigKey = key;

    const enabledText = settings.runtime.enabled ? "enabled" : "disabled";
    const rawText = settings.rawLog.enabled ? `enabled (${settings.rawLog.filePath})` : "disabled";
    this.output.appendLine(
      `[statusline] ${enabledText}: ${settings.runtime.bind}:${settings.runtime.port}${settings.runtime.path} (rawLog=${rawText})`
    );
  }

  private normalizeUnmappedCaptureReasons(rawReasons: string[] | undefined): UnmappedSkillReason[] {
    const allowed = new Set<UnmappedSkillReason>(DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS);
    const source = Array.isArray(rawReasons) ? rawReasons : DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS;

    const normalized: UnmappedSkillReason[] = [];
    for (const value of source) {
      const candidate = (value ?? "").trim() as UnmappedSkillReason;
      if (!allowed.has(candidate)) {
        continue;
      }
      if (!normalized.includes(candidate)) {
        normalized.push(candidate);
      }
    }

    if (normalized.length === 0) {
      return [...DEFAULT_UNMAPPED_SKILL_CAPTURE_REASONS];
    }
    return normalized;
  }

  async copyStatuslineSetup(): Promise<void> {
    const settings = this.readStatuslineSettings();
    const listeningInfo = this.statuslineHub.getListeningInfo();
    const scriptPath = path.join(this.context.extensionUri.fsPath, "media", "statusline-fanout.js");
    const args = [
      this.escapeShellArg(scriptPath),
      "--url",
      this.escapeShellArg(
        `http://${listeningInfo?.bind ?? settings.runtime.bind}:${listeningInfo?.port ?? settings.runtime.port}${
          listeningInfo?.path ?? settings.runtime.path
        }`
      )
    ];
    if (settings.runtime.authToken.trim().length > 0) {
      args.push("--token", this.escapeShellArg(settings.runtime.authToken.trim()));
    }
    args.push("--claude-hud");

    const command = `node ${args.join(" ")}`;
    const snippet = JSON.stringify(
      {
        statusLine: {
          type: "command",
          command,
          padding: 0
        }
      },
      null,
      2
    );

    await vscode.env.clipboard.writeText(snippet);
    void vscode.window.showInformationMessage(
      "Claude statusLine 설정 스니펫을 클립보드에 복사했습니다. 관제실과 claude-hud를 함께 쓰려면 이 스니펫으로 교체하세요."
    );
  }

  private escapeShellArg(value: string): string {
    if (process.platform === "win32") {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private sendWorldInit(shouldReplayFeed = true): void {
    if (!this.view || !this.webviewReady) {
      return;
    }

    const world = this.store.getWorldInit();
    this.view.webview.postMessage({
      type: "world_init",
      agents: world.agents,
      zones: world.zones,
      skills: world.skills,
      signals: world.signals,
      sessions: world.sessions,
      budgets: world.budgets,
      agentMds: this.agentMdResolver.getCatalog(),
      skillMds: this.skillMdResolver.getCatalog()
    } satisfies ExtToWebviewMessage);

    if (shouldReplayFeed) {
      this.messageQueue = this.store.getFeed().map((event) => ({ type: "feed_append", event } satisfies ExtToWebviewMessage));
    }
  }

  private replaceQueuedMessage(
    predicate: (queued: ExtToWebviewAtomicMessage) => boolean,
    next: ExtToWebviewAtomicMessage
  ): boolean {
    for (let index = this.messageQueue.length - 1; index >= 0; index -= 1) {
      if (!predicate(this.messageQueue[index])) {
        continue;
      }
      this.messageQueue[index] = next;
      return true;
    }
    return false;
  }

  private enqueueMessage(message: ExtToWebviewAtomicMessage): void {
    let replaced = false;
    if (message.type === "agent_upsert") {
      replaced = this.replaceQueuedMessage(
        (queued) => queued.type === "agent_upsert" && queued.agent.agentId === message.agent.agentId,
        message
      );
    } else if (message.type === "skill_metric_upsert") {
      replaced = this.replaceQueuedMessage(
        (queued) => queued.type === "skill_metric_upsert" && queued.metric.skill === message.metric.skill,
        message
      );
    } else if (message.type === "runtime_signal_metric_upsert") {
      replaced = this.replaceQueuedMessage(
        (queued) => queued.type === "runtime_signal_metric_upsert" && queued.metric.signal === message.metric.signal,
        message
      );
    } else if (message.type === "budget_upsert") {
      replaced = this.replaceQueuedMessage(
        (queued) => queued.type === "budget_upsert" && queued.budget.lineageId === message.budget.lineageId,
        message
      );
    }

    if (!replaced) {
      this.messageQueue.push(message);
    }

    if (this.messageQueue.length > MESSAGE_QUEUE_LIMIT) {
      this.messageQueue.splice(0, this.messageQueue.length - MESSAGE_QUEUE_LIMIT);
    }
  }

  private flushMessageQueue(): void {
    if (!this.view || !this.webviewReady || this.messageQueue.length === 0) {
      return;
    }

    const batch = this.messageQueue.splice(0, 64);
    if (batch.length === 1) {
      this.view.webview.postMessage(batch[0] satisfies ExtToWebviewMessage);
      return;
    }
    this.view.webview.postMessage({
      type: "batch",
      messages: batch
    } satisfies ExtToWebviewMessage);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SituationRoomViewProvider(context);

  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: false }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("expeditionSituationRoom.focus", async () => {
      await vscode.commands.executeCommand(`${VIEW_TYPE}.focus`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("expeditionSituationRoom.copyStatuslineSetup", async () => {
      await provider.copyStatuslineSetup();
    })
  );
}

export function deactivate(): void {
  // no-op; disposables are cleaned by VS Code.
}
