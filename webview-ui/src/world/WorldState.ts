import type {
  AgentMdCatalogItem,
  AgentSnapshot,
  FeedEvent,
  FilterState,
  GrowthStage,
  SkillKind,
  SkillMetricSnapshot,
  ZoneSnapshot
} from "@shared/domain";
import type { ExtToWebviewMessage } from "@shared/protocol";

const FEED_LIMIT = 200;
const GROWTH_STAGES = new Set<GrowthStage>(["seed", "sprout", "grow", "harvest"]);

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

function normalizeAgent(agent: AgentSnapshot): AgentSnapshot {
  const candidate = agent as AgentSnapshot & {
    usageCount?: unknown;
    growthStage?: unknown;
    branchName?: unknown;
    isMainBranch?: unknown;
    mainBranchRisk?: unknown;
    agentMdCallsTotal?: unknown;
    agentMdCallsById?: unknown;
  };
  const usageCount = typeof candidate.usageCount === "number" && Number.isFinite(candidate.usageCount) ? candidate.usageCount : 0;
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
  return {
    ...agent,
    branchName,
    isMainBranch,
    mainBranchRisk,
    agentMdCallsTotal,
    agentMdCallsById,
    usageCount,
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

export interface WorldSnapshot {
  agents: AgentSnapshot[];
  zones: ZoneSnapshot[];
  skills: SkillMetricSnapshot[];
  agentMds: AgentMdCatalogItem[];
  feed: FeedEvent[];
  filter: FilterState;
}

type Listener = () => void;

export class WorldState {
  private readonly agents = new Map<string, AgentSnapshot>();
  private readonly zones = new Map<string, ZoneSnapshot>();
  private readonly skills = new Map<SkillKind, SkillMetricSnapshot>();
  private agentMds: AgentMdCatalogItem[] = [];
  private readonly feed: FeedEvent[] = [];

  private filter: FilterState = {
    selectedAgentId: null,
    selectedSkill: null,
    selectedZoneId: null
  };

  private readonly listeners = new Set<Listener>();

  applyMessage(message: ExtToWebviewMessage): void {
    switch (message.type) {
      case "world_init":
        this.agents.clear();
        this.zones.clear();
        this.skills.clear();
        this.agentMds = [...(message.agentMds ?? [])].sort((a, b) => a.label.localeCompare(b.label));
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
        this.emit();
        return;
      case "agent_upsert":
        {
          const next = normalizeAgent(message.agent);
          this.agents.set(next.agentId, next);
        }
        this.emit();
        return;
      case "skill_metric_upsert":
        {
          const nextMetric = normalizeSkillMetric(message.metric);
          if (nextMetric) {
            this.skills.set(nextMetric.skill, nextMetric);
          }
        }
        this.emit();
        return;
      case "zone_upsert":
        this.zones.set(message.zone.zoneId, message.zone);
        this.emit();
        return;
      case "feed_append":
        {
          const eventWithStage: FeedEvent = {
            ...message.event,
            invokedAgentMdId:
              typeof message.event.invokedAgentMdId === "string" && message.event.invokedAgentMdId.trim().length > 0
                ? message.event.invokedAgentMdId
                : null,
            growthStage: asGrowthStage(message.event.growthStage)
          };
          this.feed.push(eventWithStage);
        }
        if (this.feed.length > FEED_LIMIT) {
          this.feed.shift();
        }
        this.emit();
        return;
      case "filter_state":
        this.filter = {
          selectedAgentId: message.selectedAgentId,
          selectedSkill: message.selectedSkill,
          selectedZoneId: message.selectedZoneId
        };
        this.emit();
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
      agentMds: [...this.agentMds],
      feed: [...this.feed],
      filter: { ...this.filter }
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
