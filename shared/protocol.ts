import type {
  AgentMdCatalogItem,
  AgentSnapshot,
  FeedEvent,
  FilterState,
  SkillKind,
  SkillMdCatalogItem,
  SkillMetricSnapshot,
  ZoneSnapshot
} from "./domain";

export type ExtToWebviewAtomicMessage =
  | {
      type: "world_init";
      zones: ZoneSnapshot[];
      agents: AgentSnapshot[];
      skills?: SkillMetricSnapshot[];
      agentMds?: AgentMdCatalogItem[];
      skillMds?: SkillMdCatalogItem[];
    }
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

export type ExtToWebviewMessage =
  | ExtToWebviewAtomicMessage
  | {
      type: "batch";
      messages: ExtToWebviewAtomicMessage[];
    };

export type WebviewToExtMessage =
  | { type: "webview_ready" }
  | { type: "select_agent"; agentId: string | null }
  | { type: "select_skill"; skill: SkillKind | null }
  | { type: "select_zone"; zoneId: string | null };
