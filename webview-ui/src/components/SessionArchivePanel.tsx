import React, { useMemo } from "react";

import type { SessionHistorySnapshot } from "@shared/domain";

interface SessionArchivePanelProps {
  sessions: SessionHistorySnapshot[];
}

function roleLabel(role: SessionHistorySnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "지선";
    case "team":
      return "합동";
    default:
      return "본선";
  }
}

function closeReasonLabel(reason: SessionHistorySnapshot["closeReason"]): string {
  switch (reason) {
    case "conversation_rollover":
      return "회차 전환";
    case "stale_cleanup":
      return "오래된 편성 정리";
    default:
      return "운행 마감";
  }
}

function shortRuntimeId(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  const dash = value.indexOf("-");
  if (dash > 0 && dash <= 10) {
    return value.slice(0, dash);
  }
  return `${value.slice(0, 8)}…`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

function formatTokens(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toString();
}

function formatPercent(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value)}%`;
}

function formatUsd(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 100) {
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(3)}`;
}

export default function SessionArchivePanel({ sessions }: SessionArchivePanelProps): JSX.Element {
  const rows = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.endedAtTs - a.endedAtTs)
      .slice(0, 40);
  }, [sessions]);

  return (
    <div className="panel-body session-archive">
      {rows.length === 0 ? (
        <div className="session-empty">운행 기록 없음</div>
      ) : (
        rows.map((session) => {
          const sessionTokens = session.statuslineSessionTokensTotal ?? session.totalTokensTotal;
          const contextPeak = formatPercent(session.statuslineContextPeakPercent);
          const costLabel = formatUsd(session.statuslineCostUsd);

          return (
            <div
              key={`${session.sessionId}:${session.endedAtTs}`}
              className={`session-row reason-${session.closeReason}`}
              title={[
                `line: ${session.lineageId}`,
                `session: ${session.sessionId}`,
                `role: ${roleLabel(session.runtimeRole)}`,
                `close: ${closeReasonLabel(session.closeReason)}`,
                `duration: ${formatDuration(session.durationMs)}`,
                `throughput: ${sessionTokens.toLocaleString()}`,
                `events: ${session.eventCount}`,
                `facility-runs: ${session.toolRunCount}`,
                contextPeak ? `ctx peak: ${contextPeak}` : "",
                costLabel ? `cost: ${costLabel}` : ""
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <div className="session-row-main">
                <span className="session-time">
                  {new Date(session.endedAtTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="session-id">{shortRuntimeId(session.lineageId)}</span>
                <span className={`session-pill role-${session.runtimeRole}`}>{roleLabel(session.runtimeRole)}</span>
                <span className={`session-pill reason-${session.closeReason}`}>
                  {closeReasonLabel(session.closeReason)}
                </span>
              </div>
              <div className="session-row-metrics">
                <span className="session-metric">{formatDuration(session.durationMs)}</span>
                <span className="session-metric">처리 {formatTokens(sessionTokens)}</span>
                <span className="session-metric">기록 {session.eventCount}</span>
                <span className="session-metric">설비 {session.toolRunCount}</span>
                {contextPeak ? <span className="session-metric session-metric-accent">점유율 {contextPeak}</span> : null}
                {costLabel ? <span className="session-metric session-metric-accent">운영비 {costLabel}</span> : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
