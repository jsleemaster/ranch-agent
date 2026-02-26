import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

import { CONFIG_SECTION } from "./constants";

export interface ProjectPaths {
  projectRoot: string;
  workspaceRoot: string;
  teamConfigPath: string;
  placeholderPackDir: string;
  userPackDir: string;
  webviewDistDir: string;
}

export interface RuntimePathResolution {
  source: "settings" | "auto";
  paths: string[];
  scanDir: string;
}

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

function firstExistingFile(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return fallback;
}

function firstExistingDir(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return fallback;
}

export function resolveProjectPaths(context: vscode.ExtensionContext): ProjectPaths {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.resolve(context.extensionUri.fsPath, "..");
  const extensionRoot = context.extensionUri.fsPath;
  const extensionParent = path.resolve(extensionRoot, "..");
  const projectRoot = workspaceRoot;

  const workspaceTeamConfig = path.join(workspaceRoot, "config", ".agent-teams.json");
  const extensionTeamConfig = path.join(extensionRoot, "config", ".agent-teams.json");
  const extensionParentTeamConfig = path.join(extensionParent, "config", ".agent-teams.json");

  const workspacePlaceholderPackDir = path.join(workspaceRoot, "assets", "placeholder-pack");
  const extensionPlaceholderPackDir = path.join(extensionRoot, "assets", "placeholder-pack");
  const extensionParentPlaceholderPackDir = path.join(extensionParent, "assets", "placeholder-pack");

  const workspaceUserPackDir = path.join(workspaceRoot, "assets", "user-pack");
  const extensionUserPackDir = path.join(extensionRoot, "assets", "user-pack");
  const extensionParentUserPackDir = path.join(extensionParent, "assets", "user-pack");

  const workspaceWebviewDistDir = path.join(workspaceRoot, "webview-ui", "dist");
  const extensionWebviewDistDir = path.join(extensionRoot, "webview-ui", "dist");
  const extensionParentWebviewDistDir = path.join(extensionParent, "webview-ui", "dist");

  return {
    projectRoot,
    workspaceRoot,
    teamConfigPath: firstExistingFile(
      [workspaceTeamConfig, extensionTeamConfig, extensionParentTeamConfig],
      workspaceTeamConfig
    ),
    placeholderPackDir: firstExistingDir(
      [workspacePlaceholderPackDir, extensionPlaceholderPackDir, extensionParentPlaceholderPackDir],
      workspacePlaceholderPackDir
    ),
    userPackDir: firstExistingDir([workspaceUserPackDir, extensionUserPackDir, extensionParentUserPackDir], workspaceUserPackDir),
    webviewDistDir: firstExistingDir(
      [workspaceWebviewDistDir, extensionWebviewDistDir, extensionParentWebviewDistDir],
      workspaceWebviewDistDir
    )
  };
}

export function readRuntimeJsonlPath(): string | null {
  const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>("runtimeJsonlPath", "").trim();
  return configured.length > 0 ? configured : null;
}

function normalizeClaudeProjectDirNameLoose(workspaceRoot: string): string {
  return workspaceRoot.replace(/[:\\/]/g, "-");
}

function normalizeClaudeProjectDirNameStrict(workspaceRoot: string): string {
  return workspaceRoot.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function collectWorkspaceRootCandidates(workspaceRoot: string): string[] {
  const next = new Set<string>();
  next.add(path.resolve(workspaceRoot));

  try {
    next.add(fs.realpathSync.native(path.resolve(workspaceRoot)));
  } catch {
    // no-op
  }

  return [...next];
}

function uniqueByOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    next.push(value);
  }
  return next;
}

function getClaudeProjectDirCandidates(workspaceRoot: string): string[] {
  const roots = collectWorkspaceRootCandidates(workspaceRoot);
  const dirNames = uniqueByOrder(
    roots.flatMap((root) => [normalizeClaudeProjectDirNameStrict(root), normalizeClaudeProjectDirNameLoose(root)])
  );
  return dirNames.map((name) => path.join(CLAUDE_PROJECTS_DIR, name));
}

export function getClaudeProjectDir(workspaceRoot: string): string {
  const candidates = getClaudeProjectDirCandidates(workspaceRoot);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return candidates[0] ?? path.join(CLAUDE_PROJECTS_DIR, normalizeClaudeProjectDirNameStrict(workspaceRoot));
}

function findJsonlPaths(projectDir: string): string[] {
  if (!fs.existsSync(projectDir)) {
    return [];
  }

  const queue = [projectDir];
  const jsonlPaths: string[] = [];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }

      if (entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl")) {
        jsonlPaths.push(absolutePath);
      }
    }
  }

  return jsonlPaths
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath);
        return {
          filePath,
          mtimeMs: stat.mtimeMs
        };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { filePath: string; mtimeMs: number } => !!entry)
    .sort((a, b) => (b.mtimeMs !== a.mtimeMs ? b.mtimeMs - a.mtimeMs : a.filePath.localeCompare(b.filePath)))
    .map((entry) => entry.filePath);
}

export function resolveRuntimeJsonlPath(workspaceRoot: string): RuntimePathResolution {
  const configured = readRuntimeJsonlPath();
  if (configured) {
    const absolutePath = path.isAbsolute(configured) ? configured : path.resolve(workspaceRoot, configured);
    let paths = [absolutePath];
    try {
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        paths = findJsonlPaths(absolutePath);
      }
    } catch {
      // manual path may not exist yet; keep raw path for retry behavior.
    }
    return {
      source: "settings",
      paths,
      scanDir: getClaudeProjectDir(workspaceRoot)
    };
  }

  const scanDir = getClaudeProjectDir(workspaceRoot);
  return {
    source: "auto",
    paths: findJsonlPaths(scanDir),
    scanDir
  };
}
