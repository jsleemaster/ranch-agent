export type SkillKind = "read" | "edit" | "write" | "bash" | "search" | "task" | "ask" | "other";
export type HookGateState = "open" | "blocked" | "failed" | "closed";
export type GrowthStage = "seed" | "sprout" | "grow" | "harvest";
export type AgentRuntimeRole = "main" | "team" | "subagent";

export interface AgentMdCatalogItem {
  id: string;
  label: string;
  fileName: string;
}

export interface SkillMdCatalogItem {
  id: string;
  label: string;
  fileName: string;
}

export interface AgentSnapshot {
  agentId: string;
  teamId: string;
  icon: string;
  color: string;
  state: "active" | "waiting";
  runtimeRole: AgentRuntimeRole;
  currentSkill: SkillKind | null;
  currentHookGate: HookGateState | null;
  currentZoneId: string | null;
  branchName: string | null;
  isMainBranch: boolean;
  mainBranchRisk: boolean;
  currentAgentMdId: string | null;
  currentSkillMdId: string | null;
  skillUsageByKind: Record<SkillKind, number>;
  agentMdCallsTotal: number;
  agentMdCallsById: Record<string, number>;
  skillMdCallsTotal: number;
  skillMdCallsById: Record<string, number>;
  promptTokensTotal?: number;
  completionTokensTotal?: number;
  totalTokensTotal?: number;
  lastPromptTokens?: number;
  lastCompletionTokens?: number;
  lastTotalTokens?: number;
  waitTotalMs?: number;
  waitCount?: number;
  waitAvgMs?: number;
  lastWaitMs?: number;
  permissionWaitTotalMs?: number;
  permissionWaitCount?: number;
  turnWaitTotalMs?: number;
  turnWaitCount?: number;
  toolRunTotalMs?: number;
  toolRunCount?: number;
  toolRunAvgMs?: number;
  lastToolRunMs?: number;
  usageCount: number;
  growthLevel: number;
  growthLevelUsage: number;
  growthStage: GrowthStage;
  lastEventTs: number;
}

export interface ZoneSnapshot {
  zoneId: string;
  folderPrefix: string;
  occupants: string[];
}

export interface FeedEvent {
  id: string;
  ts: number;
  agentId: string;
  skill: SkillKind | null;
  hookGate: HookGateState | null;
  zoneId: string | null;
  branchName?: string | null;
  mainBranchRisk?: boolean;
  invokedAgentMdId?: string | null;
  invokedSkillMdId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  waitDurationMs?: number;
  waitKind?: "permission" | "turn";
  toolRunDurationMs?: number;
  growthStage?: GrowthStage;
  text?: string;
}

export interface SkillMetricSnapshot {
  skill: SkillKind;
  usageCount: number;
  growthStage: GrowthStage;
}

export interface FilterState {
  selectedAgentId: string | null;
  selectedSkill: SkillKind | null;
  selectedZoneId: string | null;
}
