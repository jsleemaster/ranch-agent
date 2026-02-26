import * as fs from "node:fs";

import type { TeamConfig, TeamConfigFile, TeamMemberRule } from "../../../shared/config";

const FALLBACK_TEAM_CONFIG: TeamConfigFile = {
  version: 1,
  defaultTeamId: "solo",
  teams: [
    {
      id: "solo",
      icon: "team_default",
      color: "#4AA3A2",
      members: []
    }
  ]
};

function normalizePath(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function safeRegExp(pattern: string | undefined): RegExp | null {
  if (!pattern) {
    return null;
  }
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function validateConfig(parsed: unknown): TeamConfigFile | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const candidate = parsed as TeamConfigFile;
  if (candidate.version !== 1 || !candidate.defaultTeamId || !Array.isArray(candidate.teams)) {
    return null;
  }

  const teams = candidate.teams.filter(
    (team) =>
      team &&
      typeof team.id === "string" &&
      team.id.length > 0 &&
      typeof team.icon === "string" &&
      team.icon.length > 0 &&
      typeof team.color === "string" &&
      team.color.length > 0 &&
      Array.isArray(team.members)
  );

  if (teams.length === 0) {
    return null;
  }

  return {
    version: 1,
    defaultTeamId: candidate.defaultTeamId,
    teams
  };
}

function matchesRule(rule: TeamMemberRule, agentId: string, filePath: string | undefined): boolean {
  const regex = safeRegExp(rule.agentIdPattern);
  const normalizedPath = normalizePath(filePath);

  const matchesAgent = regex ? regex.test(agentId) : !rule.agentIdPattern;

  let matchesFolder = true;
  if (rule.folderPrefixes && rule.folderPrefixes.length > 0) {
    matchesFolder = rule.folderPrefixes.some((prefix) => {
      const normalizedPrefix = normalizePath(prefix);
      return normalizedPath.startsWith(normalizedPrefix);
    });
  }

  return matchesAgent && matchesFolder;
}

export class TeamResolver {
  private readonly configPath: string;
  private config: TeamConfigFile = FALLBACK_TEAM_CONFIG;

  constructor(configPath: string) {
    this.configPath = configPath;
    this.reload();
  }

  reload(): void {
    if (!fs.existsSync(this.configPath)) {
      this.config = FALLBACK_TEAM_CONFIG;
      return;
    }

    try {
      const raw = fs.readFileSync(this.configPath, "utf8");
      const parsed = validateConfig(JSON.parse(raw));
      this.config = parsed ?? FALLBACK_TEAM_CONFIG;
    } catch {
      this.config = FALLBACK_TEAM_CONFIG;
    }
  }

  resolveTeam(agentId: string, filePath: string | undefined): TeamConfig {
    for (const team of this.config.teams) {
      for (const memberRule of team.members) {
        if (matchesRule(memberRule, agentId, filePath)) {
          return team;
        }
      }
    }

    return this.getDefaultTeam();
  }

  getDefaultTeam(): TeamConfig {
    return this.config.teams.find((team) => team.id === this.config.defaultTeamId) ?? this.config.teams[0];
  }
}
