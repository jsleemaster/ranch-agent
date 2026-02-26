export interface TeamConfigFile {
  version: 1;
  defaultTeamId: string;
  teams: TeamConfig[];
}

export interface TeamConfig {
  id: string;
  icon: string;
  color: string;
  members: TeamMemberRule[];
}

export interface TeamMemberRule {
  agentIdPattern?: string;
  folderPrefixes?: string[];
}
