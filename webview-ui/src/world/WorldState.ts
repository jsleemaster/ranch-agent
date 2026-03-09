import type {
  AgentMdCatalogItem,
  AgentRuntimeRole,
  AgentSnapshot,
  FeedEvent,
  GrowthStage,
  RuntimeSignalMetricSnapshot,
  SessionHistorySnapshot,
  SkillKind,
  SkillMdCatalogItem,
  SkillMetricSnapshot,
  StatuslineBudgetSnapshot,
  ZoneSnapshot
} from "@shared/domain";
import type { ExtToWebviewAtomicMessage, ExtToWebviewMessage } from "@shared/protocol";

const FEED_LIMIT = 200;
const SESSION_LIMIT = 40;
const GROWTH_STAGES = new Set<GrowthStage>(["seed", "sprout", "grow", "harvest"]);
const SESSION_CLOSE_REASONS = new Set(["conversation_rollover", "work_finished", "stale_cleanup"]);
const GROWTH_LEVEL_SPAN = 35;

function asAgentState(value: unknown): AgentSnapshot["state"] {
  if (value === "active" || value === "waiting" || value === "completed") {
    return value;
  }
  return "waiting";
}

function asGrowthStage(value: unknown): GrowthStage {
  if (typeof value === "string" && GROWTH_STAGES.has(value as GrowthStage)) {
    return value as GrowthStage;
  }
  return "seed";
}

function asSkillKind(value: unknown): SkillKind | null {
  if (
    value === "read" ||
    value === "edit" ||
    value === "write" ||
    value === "bash" ||
    value === "search" ||
    value === "task" ||
    value === "ask" ||
    value === "other"
  ) {
    return value;
  }
  return null;
}

function asRuntimeRole(value: unknown): AgentRuntimeRole {
  if (value === "main" || value === "team" || value === "subagent") {
    return value;
  }
  return "main";
}

function normalizeSkillUsageByKind(value: unknown): Record<SkillKind, number> {
  const next: Record<SkillKind, number> = {
    read: 0,
    edit: 0,
    write: 0,
    bash: 0,
    search: 0,
    task: 0,
    ask: 0,
    other: 0
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return next;
  }

  for (const [key, rawCount] of Object.entries(value as Record<string, unknown>)) {
    const skill = asSkillKind(key);
    if (!skill) {
      continue;
    }
    if (typeof rawCount !== "number" || !Number.isFinite(rawCount)) {
      continue;
    }
    const floored = Math.floor(rawCount);
    next[skill] = floored > 0 ? floored : 0;
  }

  return next;
}

function normalizeAgent(agent: AgentSnapshot): AgentSnapshot {
  const candidate = agent as AgentSnapshot & {
    usageCount?: unknown;
    growthLevel?: unknown;
    growthLevelUsage?: unknown;
    growthStage?: unknown;
    runtimeRole?: unknown;
    branchName?: unknown;
    isMainBranch?: unknown;
    mainBranchRisk?: unknown;
    agentMdCallsTotal?: unknown;
    agentMdCallsById?: unknown;
    skillMdCallsTotal?: unknown;
    skillMdCallsById?: unknown;
    currentAgentMdId?: unknown;
    currentSkillMdId?: unknown;
    skillUsageByKind?: unknown;
  };
  const usageCount = typeof candidate.usageCount === "number" && Number.isFinite(candidate.usageCount) ? candidate.usageCount : 0;
  const growthLevelFromUsage = Math.floor(Math.max(0, usageCount) / GROWTH_LEVEL_SPAN) + 1;
  const growthLevel =
    typeof candidate.growthLevel === "number" && Number.isFinite(candidate.growthLevel) && candidate.growthLevel > 0
      ? Math.floor(candidate.growthLevel)
      : growthLevelFromUsage;
  const growthLevelUsageFromUsage = Math.max(0, usageCount) % GROWTH_LEVEL_SPAN;
  const growthLevelUsage =
    typeof candidate.growthLevelUsage === "number" &&
    Number.isFinite(candidate.growthLevelUsage) &&
    candidate.growthLevelUsage >= 0
      ? Math.floor(candidate.growthLevelUsage) % GROWTH_LEVEL_SPAN
      : growthLevelUsageFromUsage;
  const runtimeRole = asRuntimeRole(candidate.runtimeRole);
  const branchName = typeof candidate.branchName === "string" && candidate.branchName.trim().length > 0 ? candidate.branchName : null;
  const isMainBranch = candidate.isMainBranch === true;
  const mainBranchRisk = candidate.mainBranchRisk === true;
  const agentMdCallsTotal =
    typeof candidate.agentMdCallsTotal === "number" && Number.isFinite(candidate.agentMdCallsTotal)
      ? candidate.agentMdCallsTotal
      : 0;
  const agentMdCallsById =
    candidate.agentMdCallsById && typeof candidate.agentMdCallsById === "object" && !Array.isArray(candidate.agentMdCallsById)
      ? (candidate.agentMdCallsById as Record<string, number>)
      : {};
  const skillMdCallsTotal =
    typeof candidate.skillMdCallsTotal === "number" && Number.isFinite(candidate.skillMdCallsTotal)
      ? candidate.skillMdCallsTotal
      : 0;
  const skillMdCallsById =
    candidate.skillMdCallsById && typeof candidate.skillMdCallsById === "object" && !Array.isArray(candidate.skillMdCallsById)
      ? (candidate.skillMdCallsById as Record<string, number>)
      : {};
  const currentAgentMdId = typeof candidate.currentAgentMdId === "string" ? candidate.currentAgentMdId : null;
  const currentSkillMdId = typeof candidate.currentSkillMdId === "string" ? candidate.currentSkillMdId : null;
  const skillUsageByKind = normalizeSkillUsageByKind(candidate.skillUsageByKind);
  return {
    ...agent,
    state: asAgentState((candidate as { state?: unknown }).state),
    runtimeRole,
    branchName,
    isMainBranch,
    mainBranchRisk,
    currentAgentMdId,
    currentSkillMdId,
    skillUsageByKind,
    agentMdCallsTotal,
    agentMdCallsById,
    skillMdCallsTotal,
    skillMdCallsById,
    usageCount,
    growthLevel,
    growthLevelUsage,
    growthStage: asGrowthStage(candidate.growthStage)
  };
}

function normalizeSkillMetric(metric: SkillMetricSnapshot): SkillMetricSnapshot | null {
  const skill = asSkillKind(metric.skill);
  if (!skill) {
    return null;
  }
  const usageCount = typeof metric.usageCount === "number" && Number.isFinite(metric.usageCount) ? metric.usageCount : 0;
  return {
    skill,
    usageCount,
    growthStage: asGrowthStage(metric.growthStage)
  };
}

function normalizeSession(session: SessionHistorySnapshot): SessionHistorySnapshot | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const closeReason =
    typeof session.closeReason === "string" && SESSION_CLOSE_REASONS.has(session.closeReason)
      ? session.closeReason
      : "work_finished";
  const startedAtTs =
    typeof session.startedAtTs === "number" && Number.isFinite(session.startedAtTs) ? session.startedAtTs : 0;
  const endedAtTs =
    typeof session.endedAtTs === "number" && Number.isFinite(session.endedAtTs) ? session.endedAtTs : startedAtTs;

  return {
    sessionId: typeof session.sessionId === "string" && session.sessionId.trim().length > 0 ? session.sessionId : "unknown",
    lineageId:
      typeof session.lineageId === "string" && session.lineageId.trim().length > 0 ? session.lineageId : "unknown",
    runtimeRole: asRuntimeRole(session.runtimeRole),
    startedAtTs,
    endedAtTs,
    durationMs: typeof session.durationMs === "number" && Number.isFinite(session.durationMs) ? session.durationMs : 0,
    eventCount: typeof session.eventCount === "number" && Number.isFinite(session.eventCount) ? session.eventCount : 0,
    toolRunCount:
      typeof session.toolRunCount === "number" && Number.isFinite(session.toolRunCount) ? session.toolRunCount : 0,
    waitTotalMs:
      typeof session.waitTotalMs === "number" && Number.isFinite(session.waitTotalMs) ? session.waitTotalMs : 0,
    promptTokensTotal:
      typeof session.promptTokensTotal === "number" && Number.isFinite(session.promptTokensTotal)
        ? session.promptTokensTotal
        : 0,
    completionTokensTotal:
      typeof session.completionTokensTotal === "number" && Number.isFinite(session.completionTokensTotal)
        ? session.completionTokensTotal
        : 0,
    totalTokensTotal:
      typeof session.totalTokensTotal === "number" && Number.isFinite(session.totalTokensTotal)
        ? session.totalTokensTotal
        : 0,
    statuslineSessionTokensTotal:
      typeof session.statuslineSessionTokensTotal === "number" && Number.isFinite(session.statuslineSessionTokensTotal)
        ? session.statuslineSessionTokensTotal
        : undefined,
    statuslineContextPeakPercent:
      typeof session.statuslineContextPeakPercent === "number" && Number.isFinite(session.statuslineContextPeakPercent)
        ? session.statuslineContextPeakPercent
        : undefined,
    statuslineCostUsd:
      typeof session.statuslineCostUsd === "number" && Number.isFinite(session.statuslineCostUsd)
        ? session.statuslineCostUsd
        : undefined,
    closeReason
  };
}

function normalizeBudget(budget: StatuslineBudgetSnapshot): StatuslineBudgetSnapshot | null {
  if (!budget || typeof budget !== "object") {
    return null;
  }

  return {
    lineageId: typeof budget.lineageId === "string" && budget.lineageId.trim().length > 0 ? budget.lineageId : "unknown",
    sessionRuntimeId:
      typeof budget.sessionRuntimeId === "string" && budget.sessionRuntimeId.trim().length > 0
        ? budget.sessionRuntimeId
        : "unknown",
    updatedAtTs:
      typeof budget.updatedAtTs === "number" && Number.isFinite(budget.updatedAtTs) ? budget.updatedAtTs : 0,
    modelId: typeof budget.modelId === "string" ? budget.modelId : null,
    modelDisplayName: typeof budget.modelDisplayName === "string" ? budget.modelDisplayName : null,
    contextUsedTokens:
      typeof budget.contextUsedTokens === "number" && Number.isFinite(budget.contextUsedTokens)
        ? budget.contextUsedTokens
        : undefined,
    contextMaxTokens:
      typeof budget.contextMaxTokens === "number" && Number.isFinite(budget.contextMaxTokens)
        ? budget.contextMaxTokens
        : undefined,
    contextPercent:
      typeof budget.contextPercent === "number" && Number.isFinite(budget.contextPercent)
        ? budget.contextPercent
        : undefined,
    sessionTokensTotal:
      typeof budget.sessionTokensTotal === "number" && Number.isFinite(budget.sessionTokensTotal)
        ? budget.sessionTokensTotal
        : undefined,
    costUsd:
      typeof budget.costUsd === "number" && Number.isFinite(budget.costUsd) ? budget.costUsd : undefined
  };
}

export interface WorldSnapshot {
  agents: AgentSnapshot[];
  zones: ZoneSnapshot[];
  skills: SkillMetricSnapshot[];
  signals: RuntimeSignalMetricSnapshot[];
  sessions: SessionHistorySnapshot[];
  budgets: StatuslineBudgetSnapshot[];
  agentMds: AgentMdCatalogItem[];
  skillMds: SkillMdCatalogItem[];
  feed: FeedEvent[];
}

type Listener = () => void;

export class WorldState {
  private readonly agents = new Map<string, AgentSnapshot>();
  private readonly zones = new Map<string, ZoneSnapshot>();
  private readonly skills = new Map<SkillKind, SkillMetricSnapshot>();
  private readonly signals = new Map<RuntimeSignalMetricSnapshot["signal"], RuntimeSignalMetricSnapshot>();
  private readonly sessions: SessionHistorySnapshot[] = [];
  private readonly budgets = new Map<string, StatuslineBudgetSnapshot>();
  private agentMds: AgentMdCatalogItem[] = [];
  private skillMds: SkillMdCatalogItem[] = [];
  private readonly feed: FeedEvent[] = [];

  private readonly listeners = new Set<Listener>();

  applyMessage(message: ExtToWebviewMessage): void {
    if (message.type === "batch") {
      if (message.messages.length === 0) {
        return;
      }
      for (const item of message.messages) {
        this.applyAtomicMessage(item, false);
      }
      this.emit();
      return;
    }
    this.applyAtomicMessage(message, true);
  }

  private applyAtomicMessage(message: ExtToWebviewAtomicMessage, shouldEmit: boolean): void {
    switch (message.type) {
      case "world_init":
        this.agents.clear();
        this.zones.clear();
        this.skills.clear();
        this.signals.clear();
        this.sessions.splice(0, this.sessions.length);
        this.budgets.clear();
        this.agentMds = [...(message.agentMds ?? [])].sort((a, b) => a.label.localeCompare(b.label));
        this.skillMds = [...(message.skillMds ?? [])].sort((a, b) => a.label.localeCompare(b.label));
        for (const agent of message.agents) {
          const next = normalizeAgent(agent);
          this.agents.set(next.agentId, next);
        }
        for (const zone of message.zones) {
          this.zones.set(zone.zoneId, zone);
        }
        for (const metric of message.skills ?? []) {
          const nextMetric = normalizeSkillMetric(metric);
          if (!nextMetric) {
            continue;
          }
          this.skills.set(nextMetric.skill, nextMetric);
        }
        for (const metric of message.signals ?? []) {
          if (!metric || typeof metric.signal !== "string") {
            continue;
          }
          const usageCount =
            typeof metric.usageCount === "number" && Number.isFinite(metric.usageCount) ? metric.usageCount : 0;
          this.signals.set(metric.signal, {
            signal: metric.signal,
            usageCount
          });
        }
        for (const session of message.sessions ?? []) {
          const nextSession = normalizeSession(session);
          if (!nextSession) {
            continue;
          }
          this.sessions.push(nextSession);
        }
        for (const budget of message.budgets ?? []) {
          const nextBudget = normalizeBudget(budget);
          if (!nextBudget) {
            continue;
          }
          this.budgets.set(nextBudget.lineageId, nextBudget);
        }
        this.sessions.sort((a, b) => b.endedAtTs - a.endedAtTs);
        if (this.sessions.length > SESSION_LIMIT) {
          this.sessions.splice(SESSION_LIMIT);
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "agent_upsert":
        {
          const next = normalizeAgent(message.agent);
          this.agents.set(next.agentId, next);
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "skill_metric_upsert":
        {
          const nextMetric = normalizeSkillMetric(message.metric);
          if (nextMetric) {
            this.skills.set(nextMetric.skill, nextMetric);
          }
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "runtime_signal_metric_upsert":
        {
          const usageCount =
            typeof message.metric.usageCount === "number" && Number.isFinite(message.metric.usageCount)
              ? message.metric.usageCount
              : 0;
          this.signals.set(message.metric.signal, {
            signal: message.metric.signal,
            usageCount
          });
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "zone_upsert":
        this.zones.set(message.zone.zoneId, message.zone);
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "session_archive_append":
        {
          const nextSession = normalizeSession(message.session);
          if (nextSession) {
            this.budgets.delete(nextSession.lineageId);
            this.sessions.unshift(nextSession);
            this.sessions.sort((a, b) => b.endedAtTs - a.endedAtTs);
            if (this.sessions.length > SESSION_LIMIT) {
              this.sessions.splice(SESSION_LIMIT);
            }
          }
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "budget_upsert":
        {
          const nextBudget = normalizeBudget(message.budget);
          if (nextBudget) {
            this.budgets.set(nextBudget.lineageId, nextBudget);
          }
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      case "feed_append":
        {
          const eventWithStage: FeedEvent = {
            ...message.event,
            kind:
              message.event.kind === "session_rollover"
                ? message.event.kind
                : "runtime",
            invokedAgentMdId:
              typeof message.event.invokedAgentMdId === "string" && message.event.invokedAgentMdId.trim().length > 0
                ? message.event.invokedAgentMdId
                : null,
            invokedSkillMdId:
              typeof message.event.invokedSkillMdId === "string" && message.event.invokedSkillMdId.trim().length > 0
                ? message.event.invokedSkillMdId
                : null,
            growthStage: asGrowthStage(message.event.growthStage)
          };
          this.feed.push(eventWithStage);
        }
        if (this.feed.length > FEED_LIMIT) {
          this.feed.shift();
        }
        if (shouldEmit) {
          this.emit();
        }
        return;
      default:
        return;
    }
  }

  getSnapshot(): WorldSnapshot {
    return {
      agents: [...this.agents.values()].sort((a, b) => b.lastEventTs - a.lastEventTs),
      zones: [...this.zones.values()],
      skills: [...this.skills.values()].sort((a, b) => b.usageCount - a.usageCount || a.skill.localeCompare(b.skill)),
      signals: [...this.signals.values()].sort((a, b) => b.usageCount - a.usageCount || a.signal.localeCompare(b.signal)),
      sessions: [...this.sessions],
      budgets: [...this.budgets.values()].sort((a, b) => b.updatedAtTs - a.updatedAtTs),
      agentMds: [...this.agentMds],
      skillMds: [...this.skillMds],
      feed: [...this.feed]
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
