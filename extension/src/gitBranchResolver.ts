import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import type { RawRuntimeEvent } from "../../shared/runtime";

const ROOT_CACHE_MS = 15_000;
const BRANCH_CACHE_MS = 2_000;
const DEFAULT_MAIN_BRANCHES = ["main", "master", "trunk"];

export interface BranchDetectSettings {
  enabled: boolean;
  mainBranchNames: string[];
  excludeAgentIdPattern: string;
}

function safeRegExp(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new RegExp(trimmed);
  } catch {
    return null;
  }
}

function normalizeBranch(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class GitBranchResolver {
  private readonly workspaceRoot: string;
  private mainBranchSet = new Set<string>(DEFAULT_MAIN_BRANCHES);
  private excludeAgentRegex: RegExp | null = null;
  private enabled = true;

  private readonly gitRootCache = new Map<string, { value: string | null; ts: number }>();
  private readonly branchCache = new Map<string, { value: string | null; ts: number }>();

  constructor(workspaceRoot: string, settings: BranchDetectSettings) {
    this.workspaceRoot = workspaceRoot;
    this.updateSettings(settings);
  }

  updateSettings(settings: BranchDetectSettings): void {
    this.enabled = settings.enabled;

    const normalizedMain = settings.mainBranchNames
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);
    this.mainBranchSet = new Set(normalizedMain.length > 0 ? normalizedMain : DEFAULT_MAIN_BRANCHES);

    this.excludeAgentRegex = safeRegExp(settings.excludeAgentIdPattern);
  }

  enrich(event: RawRuntimeEvent): RawRuntimeEvent {
    const parsedBranch = normalizeBranch(event.branchName);
    const resolvedBranch = parsedBranch ?? (this.enabled ? this.resolveBranchByEvent(event) : null);
    if (!this.enabled) {
      return {
        ...event,
        branchName: resolvedBranch,
        isMainBranch: false,
        mainBranchRisk: false
      };
    }

    const isMainBranch = !!resolvedBranch && this.mainBranchSet.has(resolvedBranch.toLowerCase());
    const excludedAgent = this.excludeAgentRegex ? this.excludeAgentRegex.test(event.agentRuntimeId) : false;
    return {
      ...event,
      branchName: resolvedBranch,
      isMainBranch,
      mainBranchRisk: isMainBranch && !excludedAgent
    };
  }

  private resolveBranchByEvent(event: RawRuntimeEvent): string | null {
    for (const startDir of this.buildCandidateDirs(event)) {
      const gitRoot = this.resolveGitRoot(startDir);
      if (!gitRoot) {
        continue;
      }
      const branch = this.resolveBranchByGitRoot(gitRoot);
      if (branch) {
        return branch;
      }
    }
    return null;
  }

  private buildCandidateDirs(event: RawRuntimeEvent): string[] {
    const candidates = new Set<string>();

    const fromFile = this.normalizeToDir(event.filePath);
    if (fromFile) {
      candidates.add(fromFile);
    }

    const fromWorkingDir = this.normalizeToDir(event.workingDir);
    if (fromWorkingDir) {
      candidates.add(fromWorkingDir);
    }

    candidates.add(this.workspaceRoot);
    return [...candidates];
  }

  private normalizeToDir(inputPath: string | undefined): string | null {
    if (!inputPath || inputPath.trim().length === 0) {
      return null;
    }

    const absolutePath = path.isAbsolute(inputPath) ? inputPath : path.resolve(this.workspaceRoot, inputPath);
    try {
      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        return absolutePath;
      }
      return path.dirname(absolutePath);
    } catch {
      const maybeDir = path.extname(absolutePath) ? path.dirname(absolutePath) : absolutePath;
      return maybeDir;
    }
  }

  private resolveGitRoot(startDir: string): string | null {
    const now = Date.now();
    const cached = this.gitRootCache.get(startDir);
    if (cached && now - cached.ts < ROOT_CACHE_MS) {
      return cached.value;
    }

    const value = this.runGit(["-C", startDir, "rev-parse", "--show-toplevel"]);
    this.gitRootCache.set(startDir, { value, ts: now });
    return value;
  }

  private resolveBranchByGitRoot(gitRoot: string): string | null {
    const now = Date.now();
    const cached = this.branchCache.get(gitRoot);
    if (cached && now - cached.ts < BRANCH_CACHE_MS) {
      return cached.value;
    }

    let branch = this.runGit(["-C", gitRoot, "rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch === "HEAD") {
      branch = this.runGit(["-C", gitRoot, "branch", "--show-current"]);
    }
    const value = normalizeBranch(branch);
    this.branchCache.set(gitRoot, { value, ts: now });
    return value;
  }

  private runGit(args: string[]): string | null {
    try {
      const output = execFileSync("git", args, {
        encoding: "utf8",
        timeout: 700,
        stdio: ["ignore", "pipe", "ignore"]
      }).trim();
      return output.length > 0 ? output : null;
    } catch {
      return null;
    }
  }
}
