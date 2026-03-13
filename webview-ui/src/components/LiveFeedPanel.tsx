import React from "react";

import type { FeedEvent } from "@shared/domain";
import { workspaceHookGateLabel, workspaceInitials, workspaceSkillLabel } from "../world/workspaceStages";

interface LiveFeedPanelProps {
  events: FeedEvent[];
  variant?: "panel" | "overlay";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}

function describeEvent(event: FeedEvent): string {
  if (event.kind === "session_rollover") {
    return event.text?.trim() || "이전 작업이 이어서 다시 시작되었습니다.";
  }
  if (event.text && event.text.trim().length > 0) {
    return event.text.replace(/\s+/g, " ").trim();
  }
  if (event.hookGate === "failed") {
    return "작업 중 다시 확인해야 할 문제가 생겼습니다.";
  }
  if (event.hookGate === "blocked") {
    return "다음 진행 전에 확인이 필요합니다.";
  }
  if (event.skill) {
    return `${workspaceSkillLabel(event.skill)} 작업을 진행하고 있습니다.`;
  }
  return "작업 상태가 새로 기록되었습니다.";
}

function looksLikeCodeNoise(text: string): boolean {
  if (text.length < 120) {
    return false;
  }
  return /(?:import\s|export\s|=>|const\s|let\s|var\s|function\s|class\s|return\s|[{}`;$]|Number\(|\[\w)/.test(text);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function panelSummary(event: FeedEvent): string {
  const detailed = describeEvent(event);
  if (looksLikeCodeNoise(detailed)) {
    if (event.hookGate === "failed") {
      return "작업 중 다시 확인해야 할 문제가 생겼습니다.";
    }
    if (event.hookGate === "blocked") {
      return "다음 진행 전에 확인이 필요합니다.";
    }
    if (event.skill) {
      return `${workspaceSkillLabel(event.skill)} 작업 내용이 갱신되었습니다.`;
    }
    return "작업 내용이 갱신되었습니다.";
  }
  return truncateText(detailed, 140);
}

function accentClass(event: FeedEvent): string {
  if (event.kind === "session_rollover") {
    return "timeline-system";
  }
  if (event.hookGate === "failed") {
    return "timeline-alert";
  }
  if (event.hookGate === "blocked") {
    return "timeline-warning";
  }
  if (event.hookGate === "open") {
    return "timeline-success";
  }
  return "timeline-neutral";
}

export default function LiveFeedPanel({ events, variant = "panel" }: LiveFeedPanelProps): JSX.Element {
  const ordered = [...events].sort((a, b) => b.ts - a.ts);

  return (
    <div className={variant === "overlay" ? "activity-feed activity-feed-overlay" : "activity-feed activity-feed-panel"}>
      {ordered.length === 0 ? (
        <div className="workspace-empty-state compact">
          <div className="workspace-empty-title">아직 최근 활동이 없습니다</div>
          <div className="workspace-empty-copy">새 작업이 들어오면 최근 활동이 시간순으로 보입니다.</div>
        </div>
      ) : (
        ordered.map((event, index) => (
          <div key={event.id} className={`timeline-item ${accentClass(event)}`}>
            <div className="timeline-rail" aria-hidden={true}>
              <div className="timeline-node">{workspaceInitials(event.displayShortName || event.displayName)}</div>
              {index < ordered.length - 1 ? <div className="timeline-line" /> : null}
            </div>
            <div className="timeline-content">
              <div className="timeline-head">
                <span className="timeline-name">{event.displayShortName}</span>
                <span className="timeline-time">{relativeTime(event.ts)}</span>
              </div>
              <p className="timeline-copy">{variant === "overlay" ? describeEvent(event) : panelSummary(event)}</p>
              <div className="timeline-meta">
                {event.kind === "session_rollover" ? <span className="workspace-chip tone-info">작업 이어짐</span> : null}
                {event.skill ? <span className="workspace-chip tone-primary">{workspaceSkillLabel(event.skill)}</span> : null}
                {workspaceHookGateLabel(event.hookGate) ? (
                  <span className="workspace-chip tone-muted">{workspaceHookGateLabel(event.hookGate)}</span>
                ) : null}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
