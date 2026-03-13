import React, { useMemo } from "react";

import type { SessionHistorySnapshot } from "@shared/domain";

interface SessionArchivePanelProps {
  sessions: SessionHistorySnapshot[];
}

function roleLabel(role: SessionHistorySnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "보조";
    case "team":
      return "공동";
    default:
      return "메인";
  }
}

function closeReasonLabel(reason: SessionHistorySnapshot["closeReason"]): string {
  switch (reason) {
    case "conversation_rollover":
      return "이어진 작업 시작";
    case "stale_cleanup":
      return "자동 정리";
    default:
      return "작업 끝남";
  }
}

function formatDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return `${seconds}초`;
  }
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  if (minutes < 60) {
    return remain > 0 ? `${minutes}분 ${remain}초` : `${minutes}분`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}시간 ${remainMinutes}분` : `${hours}시간`;
}

function formatCompact(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
}

export default function SessionArchivePanel({ sessions }: SessionArchivePanelProps): JSX.Element {
  const ordered = useMemo(() => [...sessions].sort((a, b) => b.endedAtTs - a.endedAtTs).slice(0, 6), [sessions]);

  return (
    <div className="session-history-list">
      {ordered.length === 0 ? (
        <div className="workspace-empty-state compact slim">
          <div className="workspace-empty-title">끝난 작업이 없습니다</div>
        </div>
      ) : (
        ordered.map((session) => (
          <div key={`${session.sessionId}:${session.endedAtTs}`} className="session-history-item">
            <div className="session-history-head">
              <span className="session-history-time">
                {new Date(session.endedAtTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="session-history-name">{session.displayShortName}</span>
              <span className="workspace-chip tone-muted">{roleLabel(session.runtimeRole)}</span>
              <span className="workspace-chip tone-success">{closeReasonLabel(session.closeReason)}</span>
            </div>
            <div className="session-history-meta">
              <span>{formatDuration(session.durationMs)}</span>
              <span>기록 {session.eventCount}</span>
              <span>도구 {session.toolRunCount}</span>
              <span>사용량 {formatCompact(session.statuslineSessionTokensTotal ?? session.totalTokensTotal)}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
