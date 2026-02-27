import type {
  AgentSnapshot,
  FeedEvent,
  FilterState,
  GrowthStage,
  SkillKind,
  SkillMetricSnapshot,
  ZoneSnapshot
} from "../../../shared/domain";
import type { RawRuntimeEvent } from "../../../shared/runtime";
import { FEED_LIMIT } from "../constants";
import { deriveAgentState, deriveHookGateState } from "./hookDeriver";
import { normalizeSkill } from "./skillNormalizer";
import type { TeamResolver } from "./teamResolver";

const SKILL_ORDER: SkillKind[] = ["read", "edit", "write", "bash", "search", "task", "ask", "other"];
const GROWTH_EVENT_TYPES = new Set<RawRuntimeEvent["type"]>(["tool_start", "tool_done", "assistant_text"]);
const MAX_PENDING_TOOL_STARTS = 256;

type WaitKind = "permission" | "turn";

interface PendingWaitState {
  startTs: number;
  kind: WaitKind;
}

interface PendingToolStartState {
  startTs: number;
  toolId: string | null;
  toolName: string | null;
}

function growthStageForUsage(usageCount: number): GrowthStage {
  if (usageCount >= 35) {
    return "harvest";
  }
  if (usageCount >= 15) {
    return "grow";
  }
  if (usageCount >= 5) {
    return "sprout";
  }
  return "seed";
}

function normalizeTokenCount(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return 0;
  }
  const floored = Math.floor(raw);
  return floored > 0 ? floored : 0;
}

function normalizeToolKey(raw: string | undefined): string | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

interface SnapshotDependencies {
  teamResolver: TeamResolver;
}

export interface SnapshotUpdate {
  agent: AgentSnapshot;
  zones: ZoneSnapshot[];
  skillMetrics: SkillMetricSnapshot[];
  feed: FeedEvent;
}

export class SnapshotStore {
  private readonly teamResolver: TeamResolver;

  private readonly agents = new Map<string, AgentSnapshot>();
  private readonly skillMetrics = new Map<SkillKind, SkillMetricSnapshot>();
  private readonly feed: FeedEvent[] = [];
  // Timing state machine:
  // - pendingWaitByAgent tracks when an agent entered waiting state.
  // - pendingToolStartsByAgent tracks in-flight tool starts to measure tool_done latency.
  private readonly pendingWaitByAgent = new Map<string, PendingWaitState>();
  private readonly pendingToolStartsByAgent = new Map<string, PendingToolStartState[]>();

  private sequence = 0;

  private filterState: FilterState = {
    selectedAgentId: null,
    selectedSkill: null,
    selectedZoneId: null
  };

  constructor(deps: SnapshotDependencies) {
    this.teamResolver = deps.teamResolver;

    for (const skill of SKILL_ORDER) {
      this.skillMetrics.set(skill, {
        skill,
        usageCount: 0,
        growthStage: "seed"
      });
    }
  }

  applyRawEvent(raw: RawRuntimeEvent): SnapshotUpdate {
    const existing = this.agents.get(raw.agentRuntimeId);

    const team = this.teamResolver.resolveTeam(raw.agentRuntimeId, raw.filePath);
    const nextSkill = normalizeSkill(raw.toolName);
    const nextGate = deriveHookGateState(raw);
    const nextState = deriveAgentState(raw);
    const nextZoneId = null;

    const currentSkill: SkillKind | null = nextSkill ?? existing?.currentSkill ?? null;
    const currentHookGate = nextGate ?? existing?.currentHookGate ?? null;
    const currentState = nextState ?? existing?.state ?? "waiting";
    const branchName = raw.branchName ?? existing?.branchName ?? null;
    const isMainBranch = raw.isMainBranch ?? existing?.isMainBranch ?? false;
    const mainBranchRisk = raw.mainBranchRisk ?? existing?.mainBranchRisk ?? false;
    const currentAgentMdId = raw.invokedAgentMdId ?? existing?.currentAgentMdId ?? null;
    const currentSkillMdId = raw.invokedSkillMdId ?? existing?.currentSkillMdId ?? null;

    const prevAgentMdCallsById = existing?.agentMdCallsById ?? {};
    const nextAgentMdCallsById = { ...prevAgentMdCallsById };
    const agentMdIncrement = raw.invokedAgentMdId ? 1 : 0;
    if (raw.invokedAgentMdId) {
      nextAgentMdCallsById[raw.invokedAgentMdId] = (nextAgentMdCallsById[raw.invokedAgentMdId] ?? 0) + 1;
    }
    const agentMdCallsTotal = (existing?.agentMdCallsTotal ?? 0) + agentMdIncrement;

    const prevSkillMdCallsById = existing?.skillMdCallsById ?? {};
    const nextSkillMdCallsById = { ...prevSkillMdCallsById };
    const skillMdIncrement = raw.invokedSkillMdId ? 1 : 0;
    if (raw.invokedSkillMdId) {
      nextSkillMdCallsById[raw.invokedSkillMdId] = (nextSkillMdCallsById[raw.invokedSkillMdId] ?? 0) + 1;
    }
    const skillMdCallsTotal = (existing?.skillMdCallsTotal ?? 0) + skillMdIncrement;

    const eventPromptTokens = normalizeTokenCount(raw.promptTokens);
    const eventCompletionTokens = normalizeTokenCount(raw.completionTokens);
    const eventTotalTokens = normalizeTokenCount(raw.totalTokens ?? eventPromptTokens + eventCompletionTokens);
    const promptTokensTotal = (existing?.promptTokensTotal ?? 0) + eventPromptTokens;
    const completionTokensTotal = (existing?.completionTokensTotal ?? 0) + eventCompletionTokens;
    const totalTokensTotal = (existing?.totalTokensTotal ?? 0) + eventTotalTokens;

    let waitTotalMs = existing?.waitTotalMs ?? 0;
    let waitCount = existing?.waitCount ?? 0;
    let permissionWaitTotalMs = existing?.permissionWaitTotalMs ?? 0;
    let permissionWaitCount = existing?.permissionWaitCount ?? 0;
    let turnWaitTotalMs = existing?.turnWaitTotalMs ?? 0;
    let turnWaitCount = existing?.turnWaitCount ?? 0;
    let lastWaitMs = existing?.lastWaitMs ?? 0;

    let toolRunTotalMs = existing?.toolRunTotalMs ?? 0;
    let toolRunCount = existing?.toolRunCount ?? 0;
    let lastToolRunMs = existing?.lastToolRunMs ?? 0;

    let waitDurationMs: number | undefined;
    let waitKind: WaitKind | undefined;
    let toolRunDurationMs: number | undefined;

    if (raw.type === "permission_wait") {
      this.pendingWaitByAgent.set(raw.agentRuntimeId, { startTs: raw.ts, kind: "permission" });
    }
    if (raw.type === "turn_waiting") {
      this.pendingWaitByAgent.set(raw.agentRuntimeId, { startTs: raw.ts, kind: "turn" });
    }
    if (raw.type === "tool_start" || raw.type === "turn_active") {
      const consumedWait = this.consumePendingWait(raw.agentRuntimeId, raw.ts);
      if (consumedWait) {
        waitDurationMs = consumedWait.durationMs;
        waitKind = consumedWait.kind;
        waitTotalMs += consumedWait.durationMs;
        waitCount += 1;
        lastWaitMs = consumedWait.durationMs;
        if (consumedWait.kind === "permission") {
          permissionWaitTotalMs += consumedWait.durationMs;
          permissionWaitCount += 1;
        } else {
          turnWaitTotalMs += consumedWait.durationMs;
          turnWaitCount += 1;
        }
      }
    }
    if (raw.type === "tool_start") {
      this.recordToolStart(raw.agentRuntimeId, raw.ts, raw.toolId, raw.toolName);
    }
    if (raw.type === "tool_done") {
      const completedToolRunMs = this.consumeToolStart(raw.agentRuntimeId, raw.ts, raw.toolId, raw.toolName);
      if (typeof completedToolRunMs === "number") {
        toolRunDurationMs = completedToolRunMs;
        toolRunTotalMs += completedToolRunMs;
        toolRunCount += 1;
        lastToolRunMs = completedToolRunMs;
      }
    }

    const shouldGrow = GROWTH_EVENT_TYPES.has(raw.type);
    const usageCount = (existing?.usageCount ?? 0) + (shouldGrow ? 1 : 0);
    const growthStage = growthStageForUsage(usageCount);

    const agent: AgentSnapshot = {
      agentId: raw.agentRuntimeId,
      teamId: team.id,
      icon: team.icon,
      color: team.color,
      state: currentState,
      currentSkill,
      currentHookGate,
      currentZoneId: nextZoneId,
      branchName,
      isMainBranch,
      mainBranchRisk,
      currentAgentMdId,
      currentSkillMdId,
      agentMdCallsTotal,
      agentMdCallsById: nextAgentMdCallsById,
      skillMdCallsTotal,
      skillMdCallsById: nextSkillMdCallsById,
      promptTokensTotal,
      completionTokensTotal,
      totalTokensTotal,
      lastPromptTokens: eventPromptTokens,
      lastCompletionTokens: eventCompletionTokens,
      lastTotalTokens: eventTotalTokens,
      waitTotalMs,
      waitCount,
      waitAvgMs: waitCount > 0 ? Math.round(waitTotalMs / waitCount) : 0,
      lastWaitMs,
      permissionWaitTotalMs,
      permissionWaitCount,
      turnWaitTotalMs,
      turnWaitCount,
      toolRunTotalMs,
      toolRunCount,
      toolRunAvgMs: toolRunCount > 0 ? Math.round(toolRunTotalMs / toolRunCount) : 0,
      lastToolRunMs,
      usageCount,
      growthStage,
      lastEventTs: raw.ts
    };

    this.agents.set(raw.agentRuntimeId, agent);

    const touchedSkillMetrics: SkillMetricSnapshot[] = [];
    if (shouldGrow) {
      const metricSkill: SkillKind = currentSkill ?? "other";
      const currentMetric = this.skillMetrics.get(metricSkill) ?? {
        skill: metricSkill,
        usageCount: 0,
        growthStage: "seed"
      };
      const nextSkillUsage = currentMetric.usageCount + 1;
      const nextSkillMetric: SkillMetricSnapshot = {
        skill: metricSkill,
        usageCount: nextSkillUsage,
        growthStage: growthStageForUsage(nextSkillUsage)
      };
      this.skillMetrics.set(metricSkill, nextSkillMetric);
      touchedSkillMetrics.push(nextSkillMetric);
    }

    const feed: FeedEvent = {
      id: `${raw.agentRuntimeId}:${raw.ts}:${this.sequence++}`,
      ts: raw.ts,
      agentId: raw.agentRuntimeId,
      skill: currentSkill,
      hookGate: currentHookGate,
      zoneId: nextZoneId,
      branchName,
      mainBranchRisk,
      invokedAgentMdId: raw.invokedAgentMdId ?? null,
      invokedSkillMdId: raw.invokedSkillMdId ?? null,
      promptTokens: eventPromptTokens,
      completionTokens: eventCompletionTokens,
      totalTokens: eventTotalTokens,
      waitDurationMs,
      waitKind,
      toolRunDurationMs,
      growthStage: growthStage,
      text: raw.detail
    };

    this.feed.push(feed);
    if (this.feed.length > FEED_LIMIT) {
      this.feed.shift();
    }

    return {
      agent,
      zones: [],
      skillMetrics: touchedSkillMetrics,
      feed
    };
  }

  getWorldInit(): { agents: AgentSnapshot[]; zones: ZoneSnapshot[]; skills: SkillMetricSnapshot[] } {
    const agents = [...this.agents.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
    const skills: SkillMetricSnapshot[] = SKILL_ORDER.map((skill): SkillMetricSnapshot => {
      const existing = this.skillMetrics.get(skill);
      if (existing) {
        return existing;
      }
      return {
        skill,
        usageCount: 0,
        growthStage: "seed"
      };
    });

    return { agents, zones: [], skills };
  }

  getFeed(): FeedEvent[] {
    return [...this.feed];
  }

  getFilterState(): FilterState {
    return { ...this.filterState };
  }

  setFilterState(next: Partial<FilterState>): FilterState {
    this.filterState = {
      ...this.filterState,
      ...next,
      selectedZoneId: null
    };
    return this.getFilterState();
  }

  private consumePendingWait(agentRuntimeId: string, endTs: number): { durationMs: number; kind: WaitKind } | null {
    const waiting = this.pendingWaitByAgent.get(agentRuntimeId);
    if (!waiting) {
      return null;
    }
    this.pendingWaitByAgent.delete(agentRuntimeId);
    const durationMs = Math.max(0, endTs - waiting.startTs);
    return {
      durationMs,
      kind: waiting.kind
    };
  }

  private recordToolStart(agentRuntimeId: string, startTs: number, rawToolId: string | undefined, rawToolName: string | undefined): void {
    const toolId = normalizeToolKey(rawToolId);
    const toolName = normalizeToolKey(rawToolName);
    const queue = this.pendingToolStartsByAgent.get(agentRuntimeId) ?? [];
    queue.push({
      startTs,
      toolId,
      toolName
    });
    if (queue.length > MAX_PENDING_TOOL_STARTS) {
      queue.splice(0, queue.length - MAX_PENDING_TOOL_STARTS);
    }
    this.pendingToolStartsByAgent.set(agentRuntimeId, queue);
  }

  private consumeToolStart(
    agentRuntimeId: string,
    endTs: number,
    rawToolId: string | undefined,
    rawToolName: string | undefined
  ): number | null {
    const queue = this.pendingToolStartsByAgent.get(agentRuntimeId);
    if (!queue || queue.length === 0) {
      return null;
    }

    const toolId = normalizeToolKey(rawToolId);
    const toolName = normalizeToolKey(rawToolName);

    let index = -1;
    if (toolId) {
      index = queue.findIndex((item) => item.toolId === toolId);
    }
    if (index < 0 && toolName) {
      index = queue.findIndex((item) => item.toolName === toolName);
    }
    if (index < 0) {
      index = 0;
    }

    const [matched] = queue.splice(index, 1);
    if (queue.length === 0) {
      this.pendingToolStartsByAgent.delete(agentRuntimeId);
    } else {
      this.pendingToolStartsByAgent.set(agentRuntimeId, queue);
    }

    if (!matched) {
      return null;
    }
    return Math.max(0, endTs - matched.startTs);
  }
}
