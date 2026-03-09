import React from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { FeedEvent } from "@shared/domain";
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
  assets: WebviewAssetCatalog;
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

function feedKindLabel(event: FeedEvent): string {
  switch (event.kind) {
    case "session_rollover":
      return "회차 전환";
    default:
      return `${skillCode(event.skill)}${gateCode(event.hookGate)}`;
  }
}

export default function LiveFeedPanel({
  events,
  assets,
  variant = "panel"
}: LiveFeedPanelProps): JSX.Element {
  const ordered = [...events].reverse();
  const containerClass = variant === "overlay" ? "live-feed live-feed-overlay" : "panel-body live-feed";

  return (
    <div className={containerClass}>
      {ordered.map((event) => {
        const isStatusEvent = event.kind === "session_rollover";
        const skillIcon = iconUrl(assets, skillIconKey(event.skill));
        const gateIcon = iconUrl(assets, gateIconKey(event.hookGate));
        const zoneIcon = iconUrl(assets, zoneIconKey(event.zoneId));
        const code = feedKindLabel(event);
        const detail = compactDetail(event.text);
        const stage = event.growthStage ?? "seed";

        const tooltip = [
          `time: ${new Date(event.ts).toISOString()}`,
          `편성: ${event.agentId}`,
          `브랜치: ${event.branchName ?? "unknown"}`,
          `본선 위험: ${event.mainBranchRisk ? "yes" : "no"}`,
          `배치 지침: ${event.invokedAgentMdId ?? "none"}`,
          `단계: ${event.skill ?? "none"}`,
          `관문: ${event.hookGate ?? "none"}`,
          `구간: ${zoneLabel(event.zoneId)}`,
          `등급: ${stage}`,
          event.text ? `상세: ${event.text}` : ""
        ]
          .filter(Boolean)
          .join("\n");

        return (
          <div
            key={event.id}
            className={`feed-row ${isStatusEvent ? `feed-row-${event.kind}` : ""}`}
            title={tooltip}
          >
            <span className="feed-time">{formatTime(event.ts)}</span>
            <span className="feed-agent">{shortAgentId(event.agentId)}</span>
            <span className={`feed-code ${isStatusEvent ? "feed-code-status" : ""}`}>{code}</span>
            {isStatusEvent ? (
              <span className={`feed-status-marker ${event.kind}`}>⇄</span>
            ) : (
              <>
                <IconToken
                  src={skillIcon}
                  fallback={skillEmoji(event.skill)}
                  title={`skill: ${event.skill ?? "none"}`}
                  className="mini-icon"
                />
                <IconToken
                  src={gateIcon}
                  fallback={gateEmoji(event.hookGate)}
                  title={`gate: ${event.hookGate ?? "none"}`}
                  className="mini-icon"
                />
                <IconToken
                  src={zoneIcon}
                  fallback={zoneEmoji(event.zoneId)}
                  title={`zone: ${zoneLabel(event.zoneId)}`}
                  className="mini-icon"
                />
                <span className={`feed-growth growth-${stage}`}>{growthEmoji(stage)}</span>
              </>
            )}
            <span className="feed-detail">{detail || "상세 없음"}</span>
          </div>
        );
      })}
      {ordered.length === 0 ? <div className="empty-hint" title="관제 로그는 첫 이벤트가 오면 채워집니다">관제 로그 대기 중</div> : null}
    </div>
  );
}
