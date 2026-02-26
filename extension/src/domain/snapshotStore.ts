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
import type { FolderMapper } from "./folderMapper";
import { deriveAgentState, deriveHookGateState } from "./hookDeriver";
import { normalizeSkill } from "./skillNormalizer";
import type { TeamResolver } from "./teamResolver";

const SKILL_ORDER: SkillKind[] = ["read", "edit", "write", "bash", "search", "task", "ask", "other"];
const GROWTH_EVENT_TYPES = new Set<RawRuntimeEvent["type"]>(["tool_start", "tool_done", "assistant_text"]);

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

interface SnapshotDependencies {
  teamResolver: TeamResolver;
  folderMapper: FolderMapper;
}

interface ZoneInternal {
  zoneId: string;
  folderPrefix: string;
  occupants: Set<string>;
}

export interface SnapshotUpdate {
  agent: AgentSnapshot;
  zones: ZoneSnapshot[];
  skillMetrics: SkillMetricSnapshot[];
  feed: FeedEvent;
}

export class SnapshotStore {
  private readonly teamResolver: TeamResolver;
  private readonly folderMapper: FolderMapper;

  private readonly agents = new Map<string, AgentSnapshot>();
  private readonly zones = new Map<string, ZoneInternal>();
  private readonly skillMetrics = new Map<SkillKind, SkillMetricSnapshot>();
  private readonly feed: FeedEvent[] = [];

  private sequence = 0;

  private filterState: FilterState = {
    selectedAgentId: null,
    selectedSkill: null,
    selectedZoneId: null
  };

  constructor(deps: SnapshotDependencies) {
    this.teamResolver = deps.teamResolver;
    this.folderMapper = deps.folderMapper;

    for (const zoneId of this.folderMapper.getZoneOrder()) {
      this.zones.set(zoneId, {
        zoneId,
        folderPrefix: zoneId,
        occupants: new Set<string>()
      });
    }

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

    const zoneMatch = this.folderMapper.resolveZone(raw.filePath);
    const nextZoneId = zoneMatch.zoneId ?? existing?.currentZoneId ?? null;

    const currentSkill: SkillKind | null = nextSkill ?? existing?.currentSkill ?? null;
    const currentHookGate = nextGate ?? existing?.currentHookGate ?? null;
    const currentState = nextState ?? existing?.state ?? "waiting";
    const branchName = raw.branchName ?? existing?.branchName ?? null;
    const isMainBranch = raw.isMainBranch ?? existing?.isMainBranch ?? false;
    const mainBranchRisk = raw.mainBranchRisk ?? existing?.mainBranchRisk ?? false;
    const prevAgentMdCallsById = existing?.agentMdCallsById ?? {};
    const nextAgentMdCallsById = { ...prevAgentMdCallsById };
    if (raw.invokedAgentMdId) {
      nextAgentMdCallsById[raw.invokedAgentMdId] = (nextAgentMdCallsById[raw.invokedAgentMdId] ?? 0) + 1;
    }
    const agentMdCallsTotal = Object.values(nextAgentMdCallsById).reduce((sum, count) => sum + count, 0);
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
      agentMdCallsTotal,
      agentMdCallsById: nextAgentMdCallsById,
      usageCount,
      growthStage,
      lastEventTs: raw.ts
    };

    const touchedZoneIds = new Set<string>();

    const previousZoneId = existing?.currentZoneId ?? null;
    if (previousZoneId && previousZoneId !== nextZoneId) {
      const prevZone = this.ensureZone(previousZoneId, previousZoneId);
      prevZone.occupants.delete(raw.agentRuntimeId);
      touchedZoneIds.add(prevZone.zoneId);
    }

    if (nextZoneId) {
      const zone = this.ensureZone(nextZoneId, zoneMatch.folderPrefix ?? nextZoneId);
      zone.occupants.add(raw.agentRuntimeId);
      touchedZoneIds.add(zone.zoneId);
    }

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
      growthStage: growthStage,
      text: raw.detail
    };

    this.feed.push(feed);
    if (this.feed.length > FEED_LIMIT) {
      this.feed.shift();
    }

    return {
      agent,
      zones: [...touchedZoneIds].map((zoneId) => this.toZoneSnapshot(this.ensureZone(zoneId, zoneId))),
      skillMetrics: touchedSkillMetrics,
      feed
    };
  }

  getWorldInit(): { agents: AgentSnapshot[]; zones: ZoneSnapshot[]; skills: SkillMetricSnapshot[] } {
    const zoneOrder = this.folderMapper.getZoneOrder();
    const zoneRank = new Map(zoneOrder.map((zoneId, index) => [zoneId, index]));

    const zones = [...this.zones.values()]
      .sort((a, b) => {
        const aRank = zoneRank.get(a.zoneId) ?? Number.MAX_SAFE_INTEGER;
        const bRank = zoneRank.get(b.zoneId) ?? Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) {
          return aRank - bRank;
        }
        return a.zoneId.localeCompare(b.zoneId);
      })
      .map((zone) => this.toZoneSnapshot(zone));

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

    return { agents, zones, skills };
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
      ...next
    };
    return this.getFilterState();
  }

  private ensureZone(zoneId: string, folderPrefix: string): ZoneInternal {
    const existing = this.zones.get(zoneId);
    if (existing) {
      return existing;
    }

    const created: ZoneInternal = {
      zoneId,
      folderPrefix,
      occupants: new Set<string>()
    };
    this.zones.set(zoneId, created);
    return created;
  }

  private toZoneSnapshot(zone: ZoneInternal): ZoneSnapshot {
    return {
      zoneId: zone.zoneId,
      folderPrefix: zone.folderPrefix,
      occupants: [...zone.occupants].sort((a, b) => a.localeCompare(b))
    };
  }
}
