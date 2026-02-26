import * as path from "node:path";
import * as vscode from "vscode";

import type { ExtToWebviewMessage } from "../../shared/protocol";
import { AUTO_RUNTIME_SCAN_MS, MESSAGE_FLUSH_MS, MESSAGE_QUEUE_LIMIT, VIEW_TYPE } from "./constants";
import { FolderMapper } from "./domain/folderMapper";
import { SnapshotStore } from "./domain/snapshotStore";
import { TeamResolver } from "./domain/teamResolver";
import { loadAssetCatalog, toWebviewAssetCatalog } from "./assetPackLoader";
import { parseWebviewMessage } from "./protocolGuards";
import { resolveProjectPaths, resolveRuntimeJsonlPath } from "./projectPaths";
import { ClaudeJsonlRuntimeHub } from "./runtimeHub";
import { buildWebviewHtml } from "./webviewContent";

class SituationRoomViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly context: vscode.ExtensionContext;
  private readonly output: vscode.OutputChannel;
  private readonly paths: ReturnType<typeof resolveProjectPaths>;

  private readonly teamResolver: TeamResolver;
  private readonly folderMapper: FolderMapper;
  private readonly store: SnapshotStore;
  private readonly runtimeHub: ClaudeJsonlRuntimeHub;

  private readonly disposables: vscode.Disposable[] = [];

  private flushTimer: NodeJS.Timeout | undefined;
  private runtimeScanTimer: NodeJS.Timeout | undefined;
  private view: vscode.WebviewView | null = null;
  private webviewReady = false;
  private runtimeLogKey: string | null = null;

  private messageQueue: ExtToWebviewMessage[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.output = vscode.window.createOutputChannel("Ranch-Agent");
    this.paths = resolveProjectPaths(context);

    this.teamResolver = new TeamResolver(this.paths.teamConfigPath);
    this.folderMapper = new FolderMapper(this.paths.workspaceRoot);
    this.store = new SnapshotStore({
      teamResolver: this.teamResolver,
      folderMapper: this.folderMapper
    });

    this.runtimeHub = new ClaudeJsonlRuntimeHub({
      onEvent: (event) => {
        const update = this.store.applyRawEvent(event);
        this.enqueueMessage({ type: "agent_upsert", agent: update.agent });
        for (const metric of update.skillMetrics) {
          this.enqueueMessage({ type: "skill_metric_upsert", metric });
        }
        for (const zone of update.zones) {
          this.enqueueMessage({ type: "zone_upsert", zone });
        }
        this.enqueueMessage({ type: "feed_append", event: update.feed });
      },
      onError: (error) => {
        this.output.appendLine(`[runtime-error] ${String(error)}`);
      }
    });

    this.flushTimer = setInterval(() => {
      this.flushMessageQueue();
    }, MESSAGE_FLUSH_MS);

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("expeditionSituationRoom.runtimeJsonlPath")) {
          this.updateRuntimeSource();
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

    this.updateRuntimeSource();
    this.runtimeScanTimer = setInterval(() => {
      this.updateRuntimeSource();
    }, AUTO_RUNTIME_SCAN_MS);
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
            this.sendFilterState();
            return;
          case "select_agent":
            this.store.setFilterState({ selectedAgentId: message.agentId });
            this.sendFilterState();
            return;
          case "select_skill":
            this.store.setFilterState({ selectedSkill: message.skill });
            this.sendFilterState();
            return;
          case "select_zone":
            this.store.setFilterState({ selectedZoneId: message.zoneId });
            this.sendFilterState();
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
    this.output.dispose();

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.runtimeScanTimer) {
      clearInterval(this.runtimeScanTimer);
      this.runtimeScanTimer = undefined;
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private updateRuntimeSource(): void {
    const resolution = resolveRuntimeJsonlPath(this.paths.workspaceRoot);
    this.runtimeHub.start(resolution.paths);

    if (resolution.paths.length > 0) {
      const key = `${resolution.source}:${resolution.paths.join("|")}`;
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

  private sendWorldInit(): void {
    if (!this.view || !this.webviewReady) {
      return;
    }

    const world = this.store.getWorldInit();
    this.view.webview.postMessage({
      type: "world_init",
      agents: world.agents,
      zones: world.zones,
      skills: world.skills
    } satisfies ExtToWebviewMessage);

    this.messageQueue = this.store.getFeed().map((event) => ({ type: "feed_append", event } satisfies ExtToWebviewMessage));
  }

  private sendFilterState(): void {
    const filter = this.store.getFilterState();
    this.enqueueMessage({
      type: "filter_state",
      selectedAgentId: filter.selectedAgentId,
      selectedSkill: filter.selectedSkill,
      selectedZoneId: filter.selectedZoneId
    });
  }

  private enqueueMessage(message: ExtToWebviewMessage): void {
    this.messageQueue.push(message);
    if (this.messageQueue.length > MESSAGE_QUEUE_LIMIT) {
      this.messageQueue.splice(0, this.messageQueue.length - MESSAGE_QUEUE_LIMIT);
    }
  }

  private flushMessageQueue(): void {
    if (!this.view || !this.webviewReady || this.messageQueue.length === 0) {
      return;
    }

    const batch = this.messageQueue.splice(0, 64);
    for (const message of batch) {
      this.view.webview.postMessage(message);
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new SituationRoomViewProvider(context);

  context.subscriptions.push(provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("expeditionSituationRoom.focus", async () => {
      await vscode.commands.executeCommand(`${VIEW_TYPE}.focus`);
    })
  );
}

export function deactivate(): void {
  // no-op; disposables are cleaned by VS Code.
}
