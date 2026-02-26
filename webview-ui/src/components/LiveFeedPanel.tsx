import React from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { FeedEvent, FilterState } from "@shared/domain";
import {
  gateEmoji,
  gateIconKey,
  growthEmoji,
  iconUrl,
  skillEmoji,
  skillIconKey,
  zoneEmoji,
  zoneIconKey,
  zoneLabel
} from "../world/iconKeys";
import IconToken from "./IconToken";

interface LiveFeedPanelProps {
  events: FeedEvent[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectAgent: (agentId: string | null) => void;
  variant?: "panel" | "overlay";
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString();
}

function shortAgentId(agentId: string): string {
  const normalized = agentId.trim();
  if (normalized.length <= 12) {
    return normalized;
  }
  const dash = normalized.indexOf("-");
  if (dash > 0) {
    return normalized.slice(0, Math.min(10, dash));
  }
  return normalized.slice(0, 10);
}

function gateCode(value: FeedEvent["hookGate"]): string {
  switch (value) {
    case "open":
      return "O";
    case "blocked":
      return "B";
    case "failed":
      return "F";
    case "closed":
      return "C";
    default:
      return "-";
  }
}

function skillCode(value: FeedEvent["skill"]): string {
  if (!value) {
    return "-";
  }
  return value.slice(0, 1).toUpperCase();
}

function compactDetail(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 26) {
    return normalized;
  }
  return `${normalized.slice(0, 25)}...`;
}

function matchesFeed(event: FeedEvent, filter: FilterState): boolean {
  if (filter.selectedAgentId && event.agentId !== filter.selectedAgentId) {
    return false;
  }
  if (filter.selectedSkill && event.skill !== filter.selectedSkill) {
    return false;
  }
  if (filter.selectedZoneId && event.zoneId !== filter.selectedZoneId) {
    return false;
  }
  return true;
}

export default function LiveFeedPanel({
  events,
  filter,
  assets,
  onSelectAgent,
  variant = "panel"
}: LiveFeedPanelProps): JSX.Element {
  const ordered = [...events].reverse();
  const hasFilter = !!(filter.selectedAgentId || filter.selectedSkill || filter.selectedZoneId);
  const containerClass = variant === "overlay" ? "live-feed live-feed-overlay" : "panel-body live-feed";

  return (
    <div className={containerClass}>
      {ordered.map((event) => {
        const selected = filter.selectedAgentId === event.agentId;
        const matched = matchesFeed(event, filter);
        const skillIcon = iconUrl(assets, skillIconKey(event.skill));
        const gateIcon = iconUrl(assets, gateIconKey(event.hookGate));
        const zoneIcon = iconUrl(assets, zoneIconKey(event.zoneId));
        const code = `${skillCode(event.skill)}${gateCode(event.hookGate)}`;
        const detail = compactDetail(event.text);
        const stage = event.growthStage ?? "seed";

        const tooltip = [
          `time: ${new Date(event.ts).toISOString()}`,
          `agent: ${event.agentId}`,
          `branch: ${event.branchName ?? "unknown"}`,
          `main-risk: ${event.mainBranchRisk ? "yes" : "no"}`,
          `agent-md: ${event.invokedAgentMdId ?? "none"}`,
          `skill: ${event.skill ?? "none"}`,
          `gate: ${event.hookGate ?? "none"}`,
          `zone: ${zoneLabel(event.zoneId)}`,
          `growth: ${stage}`,
          event.text ? `detail: ${event.text}` : ""
        ]
          .filter(Boolean)
          .join("\n");

        return (
          <button
            key={event.id}
            className={`feed-row ${selected ? "selected" : ""} ${hasFilter && !matched ? "muted" : ""}`.trim()}
            title={tooltip}
            onClick={() => onSelectAgent(selected ? null : event.agentId)}
          >
            <span className="feed-time">{formatTime(event.ts)}</span>
            <span className="feed-agent">{shortAgentId(event.agentId)}</span>
            <span className="feed-code">{code}</span>
            <IconToken src={skillIcon} fallback={skillEmoji(event.skill)} title={`skill: ${event.skill ?? "none"}`} className="mini-icon" />
            <IconToken src={gateIcon} fallback={gateEmoji(event.hookGate)} title={`gate: ${event.hookGate ?? "none"}`} className="mini-icon" />
            <IconToken src={zoneIcon} fallback={zoneEmoji(event.zoneId)} title={`zone: ${zoneLabel(event.zoneId)}`} className="mini-icon" />
            <span className={`feed-growth growth-${stage}`}>{growthEmoji(stage)}</span>
            <span className="feed-detail">{detail || "세부 없음"}</span>
          </button>
        );
      })}
      {ordered.length === 0 ? <div className="empty-hint" title="작업 일지는 첫 이벤트가 오면 채워집니다">작업 일지 대기 중</div> : null}
    </div>
  );
}
