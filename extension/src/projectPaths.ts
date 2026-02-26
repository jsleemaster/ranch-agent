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

export function getClaudeProjectDir(workspaceRoot: string): string {
  const dirName = workspaceRoot.replace(/[:\\/]/g, "-");
  return path.join(os.homedir(), ".claude", "projects", dirName);
}

function findJsonlPaths(projectDir: string): string[] {
  if (!fs.existsSync(projectDir)) {
    return [];
  }

  let entries: string[];
  try {
    entries = fs.readdirSync(projectDir);
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.toLowerCase().endsWith(".jsonl"))
    .map((entry) => path.join(projectDir, entry))
    .filter((filePath) => fs.existsSync(filePath))
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
    return {
      source: "settings",
      paths: [absolutePath],
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
