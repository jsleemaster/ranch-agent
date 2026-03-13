import type {
  AgentMdCatalogItem,
  AgentSnapshot,
  FeedEvent,
  RuntimeSignalMetricSnapshot,
  SessionHistorySnapshot,
  StatuslineBudgetSnapshot,
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
      signals?: RuntimeSignalMetricSnapshot[];
      sessions?: SessionHistorySnapshot[];
      budgets?: StatuslineBudgetSnapshot[];
      agentMds?: AgentMdCatalogItem[];
      skillMds?: SkillMdCatalogItem[];
    }
  | { type: "agent_upsert"; agent: AgentSnapshot }
  | { type: "session_archive_append"; session: SessionHistorySnapshot }
  | { type: "budget_upsert"; budget: StatuslineBudgetSnapshot }
  | { type: "skill_metric_upsert"; metric: SkillMetricSnapshot }
  | { type: "runtime_signal_metric_upsert"; metric: RuntimeSignalMetricSnapshot }
  | { type: "zone_upsert"; zone: ZoneSnapshot }
  | { type: "feed_append"; event: FeedEvent };

export type ExtToWebviewMessage =
  | ExtToWebviewAtomicMessage
  | {
      type: "batch";
      messages: ExtToWebviewAtomicMessage[];
    };

export type WebviewToExtMessage =
  | { type: "webview_ready" };
