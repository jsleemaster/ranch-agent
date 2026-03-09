export type SkillKind = "read" | "edit" | "write" | "bash" | "search" | "task" | "ask" | "other";
export type HookGateState = "open" | "blocked" | "failed" | "closed";
export type GrowthStage = "seed" | "sprout" | "grow" | "harvest";
export type AgentRuntimeRole = "main" | "team" | "subagent";
export type SessionCloseReason = "conversation_rollover" | "work_finished" | "stale_cleanup";
export type RuntimeSignalKind =
  | "orchestration_signal"
  | "unknown_tool_signal"
  | "tool_name_missing_signal"
  | "assistant_reply_signal";
export type FeedEventKind = "runtime" | "session_rollover";

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
  state: "active" | "waiting" | "completed";
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

export interface SessionHistorySnapshot {
  sessionId: string;
  lineageId: string;
  runtimeRole: AgentRuntimeRole;
  startedAtTs: number;
  endedAtTs: number;
  durationMs: number;
  eventCount: number;
  toolRunCount: number;
  waitTotalMs: number;
  promptTokensTotal: number;
  completionTokensTotal: number;
  totalTokensTotal: number;
  statuslineSessionTokensTotal?: number;
  statuslineContextPeakPercent?: number;
  statuslineCostUsd?: number;
  closeReason: SessionCloseReason;
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
  kind?: FeedEventKind;
  skill: SkillKind | null;
  runtimeSignal?: RuntimeSignalKind | null;
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

export interface StatuslineBudgetSnapshot {
  lineageId: string;
  sessionRuntimeId: string;
  updatedAtTs: number;
  modelId?: string | null;
  modelDisplayName?: string | null;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  contextPercent?: number;
  sessionTokensTotal?: number;
  costUsd?: number;
}

export interface SkillMetricSnapshot {
  skill: SkillKind;
  usageCount: number;
  growthStage: GrowthStage;
}

export interface RuntimeSignalMetricSnapshot {
  signal: RuntimeSignalKind;
  usageCount: number;
}
