import React, { useMemo, useState } from "react";

import type {
  AgentMdCatalogItem,
  AgentSnapshot,
  SessionHistorySnapshot,
  SkillMdCatalogItem,
  StatuslineBudgetSnapshot
} from "@shared/domain";
import { workspaceRoleLabel, workspaceSkillLabel, WORKSPACE_STAGES, type WorkspaceStageId } from "../world/workspaceStages";

interface SettingsViewProps {
  agents: AgentSnapshot[];
  sessions: SessionHistorySnapshot[];
  budgets: StatuslineBudgetSnapshot[];
  agentMds: AgentMdCatalogItem[];
  skillMds: SkillMdCatalogItem[];
  stableStages: Record<string, WorkspaceStageId>;
}

type DisplayMode = "simple" | "advanced";

function formatCompact(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${Math.round(value)}%`;
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

function currentStageLabel(agent: AgentSnapshot, stableStages: Record<string, WorkspaceStageId>): string {
  const stage = WORKSPACE_STAGES.find((item) => item.id === (stableStages[agent.agentId] ?? "kickoff"));
  return stage?.label ?? "준비";
}

export default function SettingsView({
  agents,
  sessions,
  budgets,
  agentMds,
  skillMds,
  stableStages
}: SettingsViewProps): JSX.Element {
  const [displayMode, setDisplayMode] = useState<DisplayMode>("simple");
  const latestBudget = useMemo(() => [...budgets].sort((a, b) => b.updatedAtTs - a.updatedAtTs)[0] ?? null, [budgets]);
  const recentAgentMds = useMemo(() => [...agentMds].slice(0, 6), [agentMds]);
  const recentSkillMds = useMemo(() => [...skillMds].slice(0, 6), [skillMds]);
  const activeAgents = useMemo(
    () =>
      [...agents]
        .sort((a, b) => {
          const stateRank = (value: AgentSnapshot["state"]): number => {
            switch (value) {
              case "active":
                return 0;
              case "waiting":
                return 1;
              default:
                return 2;
            }
          };
          return (
            stateRank(a.state) - stateRank(b.state) ||
            a.displayShortName.localeCompare(b.displayShortName, "ko") ||
            a.rawShortId.localeCompare(b.rawShortId, "en")
          );
        })
        .slice(0, 8),
    [agents]
  );

  return (
    <section className="settings-view">
      <div className="analytics-hero">
        <div>
          <h2 className="analytics-title">설정</h2>
          <p className="analytics-subtitle">현재 연결 상태와 작업 카탈로그 구성을 읽기 전용으로 보여줍니다.</p>
        </div>
        <span className="workspace-chip tone-muted">읽기 전용</span>
      </div>

      <div className="settings-grid settings-grid-primary">
        <section className="workspace-surface settings-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">보기 방식</h3>
              <p className="workspace-panel-subtitle">일반 사용자용 표현과 자세한 표현을 미리 확인할 수 있습니다.</p>
            </div>
          </div>
          <div className="settings-option-grid">
            <button
              type="button"
              className={`settings-option-card ${displayMode === "simple" ? "is-active" : ""}`}
              onClick={() => setDisplayMode("simple")}
            >
              <span className="settings-option-title">간단히 보기</span>
              <span className="settings-option-copy">일반 사용자가 읽기 쉬운 용어와 설명을 우선으로 보여줍니다.</span>
            </button>
            <button
              type="button"
              className={`settings-option-card ${displayMode === "advanced" ? "is-active" : ""}`}
              onClick={() => setDisplayMode("advanced")}
            >
              <span className="settings-option-title">자세히 보기</span>
              <span className="settings-option-copy">세부 사용량, 대기 시간, 상태 알림 정보를 더 많이 보여줍니다.</span>
            </button>
          </div>
        </section>

        <section className="workspace-surface settings-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">현재 연결</h3>
              <p className="workspace-panel-subtitle">지금 연결된 모델과 대화 사용량 상태입니다.</p>
            </div>
          </div>
          <div className="settings-stat-grid">
            <div className="settings-stat-card">
              <span className="settings-stat-label">사용 모델</span>
              <strong className="settings-stat-value">
                {latestBudget?.modelDisplayName ?? latestBudget?.modelId ?? "연결 대기"}
              </strong>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-label">대화 사용량</span>
              <strong className="settings-stat-value">{formatPercent(latestBudget?.contextPercent)}</strong>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-label">현재 대화</span>
              <strong className="settings-stat-value">{formatCompact(latestBudget?.sessionTokensTotal)}</strong>
            </div>
            <div className="settings-stat-card">
              <span className="settings-stat-label">사용 비용</span>
              <strong className="settings-stat-value">{formatUsd(latestBudget?.costUsd)}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="settings-grid settings-grid-secondary">
        <section className="workspace-surface settings-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">작업자 설명서 목록</h3>
              <p className="workspace-panel-subtitle">지금 연결된 AGENT.md 설명서입니다.</p>
            </div>
            <span className="workspace-count-pill">{agentMds.length}</span>
          </div>
          <div className="settings-catalog-list">
            {recentAgentMds.map((item) => (
              <div key={item.id} className="settings-catalog-row">
                <div>
                  <div className="settings-catalog-name">{item.label}</div>
                  <div className="settings-catalog-meta">{item.fileName}</div>
                </div>
                <span className="workspace-chip tone-primary">작업자</span>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-surface settings-surface">
          <div className="workspace-panel-header compact">
            <div>
              <h3 className="workspace-panel-title">작업 종류 목록</h3>
              <p className="workspace-panel-subtitle">지금 연결된 SKILL.md 설명서입니다.</p>
            </div>
            <span className="workspace-count-pill">{skillMds.length}</span>
          </div>
          <div className="settings-catalog-list">
            {recentSkillMds.map((item) => (
              <div key={item.id} className="settings-catalog-row">
                <div>
                  <div className="settings-catalog-name">{item.label}</div>
                  <div className="settings-catalog-meta">{item.fileName}</div>
                </div>
                <span className="workspace-chip tone-success">작업</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="workspace-surface settings-surface">
        <div className="workspace-panel-header compact">
          <div>
            <h3 className="workspace-panel-title">현재 작업자 구성</h3>
            <p className="workspace-panel-subtitle">지금 연결된 작업자와 각자의 상태를 요약합니다.</p>
          </div>
          <span className="workspace-count-pill">{agents.length}</span>
        </div>
        <div className="settings-table">
          <div className="settings-table-head">
            <span>이름</span>
            <span>역할</span>
            <span>단계</span>
            <span>현재 작업</span>
            <span>상태</span>
          </div>
          <div className="settings-table-body">
            {activeAgents.map((agent) => (
              <div key={agent.agentId} className="settings-table-row">
                <span className="settings-table-name">{agent.displayShortName}</span>
                <span>{workspaceRoleLabel(agent.runtimeRole)}</span>
                <span>{currentStageLabel(agent, stableStages)}</span>
                <span>{workspaceSkillLabel(agent.currentSkill)}</span>
                <span className={`workspace-chip ${agent.state === "active" ? "tone-success" : agent.state === "waiting" ? "tone-warning" : "tone-muted"}`}>
                  {agent.state === "active" ? "작업 중" : agent.state === "waiting" ? "잠시 멈춤" : "끝남"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-surface settings-surface">
        <div className="workspace-panel-header compact">
          <div>
            <h3 className="workspace-panel-title">최근 끝난 작업</h3>
            <p className="workspace-panel-subtitle">설정 화면에서도 최근 마친 작업을 짧게 확인할 수 있습니다.</p>
          </div>
          <span className="workspace-count-pill">{sessions.length}</span>
        </div>
        <div className="settings-session-strip">
          {sessions.slice(0, 4).map((session) => (
            <div key={`${session.sessionId}-${session.endedAtTs}`} className="settings-session-card">
              <strong>{session.displayShortName}</strong>
              <span>{workspaceRoleLabel(session.runtimeRole)}</span>
              <span>사용량 {formatCompact(session.totalTokensTotal)}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
