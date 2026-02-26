import type { AgentMdCatalogItem, AgentSnapshot, FeedEvent, FilterState, SkillKind, SkillMetricSnapshot, ZoneSnapshot } from "./domain";

export type ExtToWebviewMessage =
  | { type: "world_init"; zones: ZoneSnapshot[]; agents: AgentSnapshot[]; skills?: SkillMetricSnapshot[]; agentMds?: AgentMdCatalogItem[] }
  | { type: "agent_upsert"; agent: AgentSnapshot }
  | { type: "skill_metric_upsert"; metric: SkillMetricSnapshot }
  | { type: "zone_upsert"; zone: ZoneSnapshot }
  | { type: "feed_append"; event: FeedEvent }
  | {
      type: "filter_state";
      selectedAgentId: FilterState["selectedAgentId"];
      selectedSkill: FilterState["selectedSkill"];
      selectedZoneId: FilterState["selectedZoneId"];
    };

export type WebviewToExtMessage =
  | { type: "webview_ready" }
  | { type: "select_agent"; agentId: string | null }
  | { type: "select_skill"; skill: SkillKind | null }
  | { type: "select_zone"; zoneId: string | null };
