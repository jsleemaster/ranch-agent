export type SkillKind = "read" | "edit" | "write" | "bash" | "search" | "task" | "ask" | "other";
export type HookGateState = "open" | "blocked" | "failed" | "closed";
export type GrowthStage = "seed" | "sprout" | "grow" | "harvest";

export interface AgentSnapshot {
  agentId: string;
  teamId: string;
  icon: string;
  color: string;
  state: "active" | "waiting";
  currentSkill: SkillKind | null;
  currentHookGate: HookGateState | null;
  currentZoneId: string | null;
  usageCount: number;
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
