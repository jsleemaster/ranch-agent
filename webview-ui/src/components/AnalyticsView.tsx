import React, { useMemo } from "react";

import type { AgentSnapshot, RuntimeSignalMetricSnapshot, SessionHistorySnapshot, SkillMetricSnapshot, StatuslineBudgetSnapshot } from "@shared/domain";
import { workspaceRoleLabel, workspaceSignalSummary, workspaceSkillLabel, WORKSPACE_STAGES, type WorkspaceStageId } from "../world/workspaceStages";

interface AnalyticsViewProps {
  agents: AgentSnapshot[];
  sessions: SessionHistorySnapshot[];
  signals: RuntimeSignalMetricSnapshot[];
  skills: SkillMetricSnapshot[];
  budgets: StatuslineBudgetSnapshot[];
  stableStages: Record<string, WorkspaceStageId>;
}

function formatCompact(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
}

function formatMsAsHuman(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0초";
  }
  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    return `${seconds}초`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return remainSeconds > 0 ? `${minutes}분 ${remainSeconds}초` : `${minutes}분`;
}

function formatUsd(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "$0";
  }
  if (value >= 100) {
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(3)}`;
}

export default function AnalyticsView({
  agents,
  sessions,
  signals,
  skills,
  budgets,
  stableStages
}: AnalyticsViewProps): JSX.Element {
  const signalSummary = useMemo(() => workspaceSignalSummary(signals), [signals]);
  const stageStats = useMemo(
    () =>
      WORKSPACE_STAGES.map((stage) => ({
        ...stage,
        count: agents.filter((agent) => (stableStages[agent.agentId] ?? "kickoff") === stage.id).length
      })),
    [agents, stableStages]
  );

  const topWorkers = useMemo(
    () =>
      [...agents]
        .sort(
          (a, b) =>
            (b.totalTokensTotal ?? 0) - (a.totalTokensTotal ?? 0) ||
            b.usageCount - a.usageCount ||
            a.displayShortName.localeCompare(b.displayShortName, "ko")
        )
        .slice(0, 5),
    [agents]
  );

  const topSkills = useMemo(() => [...skills].sort((a, b) => b.usageCount - a.usageCount).slice(0, 6), [skills]);
  const latestBudget = useMemo(() => [...budgets].sort((a, b) => b.updatedAtTs - a.updatedAtTs)[0] ?? null, [budgets]);

  const averageWaitMs =
    agents.reduce((sum, agent) => sum + (agent.waitAvgMs ?? 0), 0) / Math.max(1, agents.filter((agent) => (agent.waitAvgMs ?? 0) > 0).length);
  const averageToolMs =
    agents.reduce((sum, agent) => sum + (agent.toolRunAvgMs ?? 0), 0) /
    Math.max(1, agents.filter((agent) => (agent.toolRunAvgMs ?? 0) > 0).length);
  const totalTokens = agents.reduce((sum, agent) => sum + (agent.totalTokensTotal ?? 0), 0);
  const totalSessionCost = sessions.reduce((sum, session) => sum + (session.statuslineCostUsd ?? 0), 0);

  return (
    <section className="analytics-view">
      <div className="analytics-hero">
        <div>
          <h2 className="analytics-title">분석</h2>
          <p className="analytics-subtitle">작업 속도, 단계 분포, 사용량 흐름을 한 번에 확인합니다.</p>
        </div>
      </div>

      <div className="analytics-metric-grid">
        <article className="analytics-metric-card">
          <span className="analytics-metric-label">전체 작업량</span>
          <strong className="analytics-metric-value">{formatCompact(totalTokens)}</strong>
          <span className="analytics-metric-meta">지금까지 기록된 총 사용량</span>
        </article>
        <article className="analytics-metric-card">
          <span className="analytics-metric-label">평균 대기 시간</span>
          <strong className="analytics-metric-value">{formatMsAsHuman(averageWaitMs)}</strong>
          <span className="analytics-metric-meta">확인 대기와 멈춤 시간을 포함</span>
        </article>
        <article className="analytics-metric-card">
          <span className="analytics-metric-label">평균 실행 시간</span>
          <strong className="analytics-metric-value">{formatMsAsHuman(averageToolMs)}</strong>
          <span className="analytics-metric-meta">도구 실행 1회 기준 평균</span>
        </article>
        <article className="analytics-metric-card">
          <span className="analytics-metric-label">누적 비용</span>
          <strong className="analytics-metric-value">{formatUsd(totalSessionCost || latestBudget?.costUsd)}</strong>
          <span className="analytics-metric-meta">끝난 작업과 현재 대화 기준</span>
        </article>
      </div>

      <div className="analytics-grid analytics-grid-primary">
        <section className="workspace-surface analytics-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">단계 분포</h3>
              <p className="workspace-panel-subtitle">지금 작업이 어느 단계에 몰려 있는지 보여줍니다.</p>
            </div>
          </div>
          <div className="analytics-stage-list">
            {stageStats.map((stage) => (
              <div key={stage.id} className="analytics-stage-row">
                <div className="analytics-stage-main">
                  <span className={`analytics-stage-dot ${stage.accentClass}`} />
                  <span className="analytics-stage-label">{stage.label}</span>
                </div>
                <span className="analytics-stage-count">{stage.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-surface analytics-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">상태 알림 요약</h3>
              <p className="workspace-panel-subtitle">작업 중 자주 발생한 상태 변화를 모아봅니다.</p>
            </div>
          </div>
          <div className="analytics-signal-list">
            {signalSummary.map((signal) => (
              <div key={signal.key} className="analytics-signal-row">
                <span className={`workspace-chip ${signal.tone}`}>{signal.label}</span>
                <strong>{signal.value}건</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="analytics-grid analytics-grid-secondary">
        <section className="workspace-surface analytics-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">자주 쓰는 작업</h3>
              <p className="workspace-panel-subtitle">최근 사용 빈도가 높은 작업 종류입니다.</p>
            </div>
          </div>
          <div className="analytics-skill-list">
            {topSkills.map((skill) => (
              <div key={skill.skill} className="analytics-skill-row">
                <span className="analytics-skill-label">{workspaceSkillLabel(skill.skill)}</span>
                <span className="analytics-skill-bar">
                  <i style={{ width: `${Math.max(10, Math.min(100, skill.usageCount))}%` }} />
                </span>
                <strong>{skill.usageCount}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-surface analytics-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">가장 바쁜 작업자</h3>
              <p className="workspace-panel-subtitle">사용량과 처리량이 높은 작업자를 우선 보여줍니다.</p>
            </div>
          </div>
          <div className="analytics-worker-list">
            {topWorkers.map((agent) => (
              <div key={agent.agentId} className="analytics-worker-row">
                <div>
                  <div className="analytics-worker-name">{agent.displayShortName}</div>
                  <div className="analytics-worker-meta">{workspaceRoleLabel(agent.runtimeRole)}</div>
                </div>
                <div className="analytics-worker-stats">
                  <span>사용량 {formatCompact(agent.totalTokensTotal)}</span>
                  <span>처리 {agent.usageCount}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
