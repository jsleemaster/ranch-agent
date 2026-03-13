import React, { useEffect, useMemo, useState } from "react";

import AgentBoard from "./components/AgentBoard";
import AnalyticsView from "./components/AnalyticsView";
import LiveFeedPanel from "./components/LiveFeedPanel";
import SessionArchivePanel from "./components/SessionArchivePanel";
import SettingsView from "./components/SettingsView";
import SkillFlowPanel from "./components/SkillFlowPanel";
import { useStableWorkspaceStages } from "./hooks/useStableWorkspaceStages";
import { useWorldMessages } from "./hooks/useWorldMessages";
import { readAssetCatalog } from "./world/assetCatalog";
import { WorldState } from "./world/WorldState";

type WorkspaceView = "workspace" | "analytics" | "settings";

const VIEW_COPY: Record<WorkspaceView, { title: string; subtitle: string }> = {
  workspace: {
    title: "AI 작업 현황판",
    subtitle: "여러 AI 작업자가 맡은 일과 현재 진행 상태를 한 화면에서 보여줍니다."
  },
  analytics: {
    title: "AI 작업 현황판",
    subtitle: "작업 속도, 사용량, 상태 변화를 숫자와 분포로 정리합니다."
  },
  settings: {
    title: "AI 작업 현황판",
    subtitle: "현재 연결 상태와 작업자/작업 카탈로그 구성을 확인합니다."
  }
};

function formatCompactNumber(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
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

export default function App(): JSX.Element {
  const world = useMemo(() => new WorldState(), []);
  const assets = useMemo(() => readAssetCatalog(), []);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [view, setView] = useState<WorkspaceView>("workspace");

  useWorldMessages(world);

  const [, forceRender] = useState(0);
  useEffect(() => world.subscribe(() => forceRender((count) => count + 1)), [world]);

  useEffect(() => {
    if (view !== "workspace") {
      setFeedExpanded(false);
    }
  }, [view]);

  useEffect(() => {
    if (!feedExpanded) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFeedExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [feedExpanded]);

  const snapshot = world.getSnapshot();
  const activeCount = snapshot.agents.filter((agent) => agent.state === "active").length;
  const waitingCount = snapshot.agents.filter((agent) => agent.state === "waiting").length;
  const completedCount = snapshot.sessions.length;
  const totalTokens = snapshot.agents.reduce((sum, agent) => sum + (agent.totalTokensTotal ?? 0), 0);
  const latestMainBudget = useMemo(() => {
    const mainIds = new Set(snapshot.agents.filter((agent) => agent.runtimeRole === "main").map((agent) => agent.agentId));
    return [...snapshot.budgets].filter((budget) => mainIds.has(budget.lineageId)).sort((a, b) => b.updatedAtTs - a.updatedAtTs)[0] ?? null;
  }, [snapshot.agents, snapshot.budgets]);
  const totalSignals = snapshot.signals.reduce((sum, metric) => sum + metric.usageCount, 0);
  const contextLabel = formatPercent(latestMainBudget?.contextPercent);
  const sessionLabel = formatCompactNumber(latestMainBudget?.sessionTokensTotal);
  const costLabel = formatUsd(latestMainBudget?.costUsd);
  const modelLabel = latestMainBudget?.modelDisplayName ?? latestMainBudget?.modelId ?? "연결 대기";
  const contextBarWidth = Math.max(0, Math.min(100, latestMainBudget?.contextPercent ?? 0));
  const feedPreview = snapshot.feed.slice(-18);
  const connected = snapshot.agents.length > 0 || snapshot.feed.length > 0;
  const stableStages = useStableWorkspaceStages(snapshot.agents);
  const viewCopy = VIEW_COPY[view];

  return (
    <div className="workspace-app">
      <header className="workspace-topbar">
        <div className="workspace-brand-block">
          <div className="workspace-brand-icon">◆</div>
          <div className="workspace-brand-copy">
            <h1 className="workspace-brand-title">{viewCopy.title}</h1>
            <p className="workspace-brand-subtitle">{viewCopy.subtitle}</p>
          </div>
        </div>

        <div className="workspace-topbar-right">
          <nav className="workspace-nav" aria-label="작업 화면 전환">
            <button
              type="button"
              className={`workspace-nav-item ${view === "workspace" ? "is-active" : ""}`}
              onClick={() => setView("workspace")}
            >
              작업 현황
            </button>
            <button
              type="button"
              className={`workspace-nav-item ${view === "analytics" ? "is-active" : ""}`}
              onClick={() => setView("analytics")}
            >
              분석
            </button>
            <button
              type="button"
              className={`workspace-nav-item ${view === "settings" ? "is-active" : ""}`}
              onClick={() => setView("settings")}
            >
              설정
            </button>
          </nav>
          <div className="workspace-summary-pills">
            <span className="workspace-summary-pill">작업 중 {activeCount}</span>
            <span className="workspace-summary-pill">잠시 멈춤 {waitingCount}</span>
            <span className="workspace-summary-pill">끝남 {completedCount}</span>
            <span className="workspace-summary-pill is-strong">총 사용량 {formatCompactNumber(totalTokens) ?? "0"}</span>
            <span className="workspace-summary-pill">상태 알림 {totalSignals}</span>
            {contextLabel ? <span className="workspace-summary-pill is-info">대화 사용량 {contextLabel}</span> : null}
            {sessionLabel ? <span className="workspace-summary-pill is-info">현재 대화 {sessionLabel}</span> : null}
            {costLabel ? <span className="workspace-summary-pill is-info">사용 비용 {costLabel}</span> : null}
          </div>
        </div>
      </header>

      {view === "workspace" ? (
        <main className="workspace-layout">
          <aside className="workspace-sidebar-surface">
            <AgentBoard
              agents={snapshot.agents}
              agentMds={snapshot.agentMds}
              skillMds={snapshot.skillMds}
              assets={assets}
              stableStages={stableStages}
            />
          </aside>

          <section className="workspace-main-surface">
            <SkillFlowPanel
              agents={snapshot.agents}
              skillMetrics={snapshot.skills}
              signalMetrics={snapshot.signals}
              budgets={snapshot.budgets}
              feed={snapshot.feed}
              stableStages={stableStages}
            />
          </section>

          <aside className="workspace-activity-column">
            <section className="workspace-surface activity-surface">
              <div className="workspace-panel-header">
                <div>
                  <h3 className="workspace-panel-title">최근 활동</h3>
                  <p className="workspace-panel-subtitle">방금 일어난 작업 변화와 확인 사항을 시간순으로 보여줍니다.</p>
                </div>
                <button className="workspace-ghost-button" type="button" onClick={() => setFeedExpanded(true)}>
                  전체 보기
                </button>
              </div>
              <LiveFeedPanel events={feedPreview} />
            </section>

            <section className="workspace-surface history-surface">
              <div className="workspace-panel-header compact">
                <div>
                  <h3 className="workspace-panel-title">끝난 작업</h3>
                  <p className="workspace-panel-subtitle">최근에 마친 작업을 짧게 요약합니다.</p>
                </div>
              </div>
              <SessionArchivePanel sessions={snapshot.sessions} />
            </section>
          </aside>
        </main>
      ) : (
        <main className="workspace-single-view">
          {view === "analytics" ? (
            <AnalyticsView
              agents={snapshot.agents}
              sessions={snapshot.sessions}
              signals={snapshot.signals}
              skills={snapshot.skills}
              budgets={snapshot.budgets}
              stableStages={stableStages}
            />
          ) : (
            <SettingsView
              agents={snapshot.agents}
              sessions={snapshot.sessions}
              budgets={snapshot.budgets}
              agentMds={snapshot.agentMds}
              skillMds={snapshot.skillMds}
              stableStages={stableStages}
            />
          )}
        </main>
      )}

      <footer className="workspace-footer">
        <div className="workspace-resource-group">
          <div className="workspace-resource-label">현재 대화 사용량</div>
          <div className="workspace-resource-values">
            <span className="workspace-resource-strong">{sessionLabel ?? "0"}</span>
            <span className="workspace-resource-separator">/</span>
            <span className="workspace-resource-muted">{formatCompactNumber(latestMainBudget?.contextMaxTokens) ?? "-"}</span>
            {contextLabel ? <span className="workspace-resource-chip">{contextLabel}</span> : null}
          </div>
          <div className="workspace-resource-track">
            <div className="workspace-resource-fill" style={{ width: `${contextBarWidth}%` }} />
          </div>
        </div>

        <div className="workspace-footer-actions">
          <span className="workspace-footer-item">사용 모델 {modelLabel}</span>
          {costLabel ? <span className="workspace-footer-item">사용 비용 {costLabel}</span> : null}
          <span className="workspace-footer-status">
            <i className={`workspace-footer-status-dot ${connected ? "is-live" : "is-idle"}`} />
            {connected ? "연결됨" : "대기 중"}
          </span>
        </div>
      </footer>

      {view === "workspace" && feedExpanded ? (
        <div className="feed-overlay" onClick={() => setFeedExpanded(false)}>
          <section className="feed-modal" onClick={(event) => event.stopPropagation()}>
            <header className="feed-modal-header">
              <div className="feed-modal-title">최근 활동</div>
              <button className="feed-modal-close" type="button" onClick={() => setFeedExpanded(false)}>
                닫기
              </button>
            </header>
            <LiveFeedPanel events={snapshot.feed} variant="overlay" />
          </section>
        </div>
      ) : null}
    </div>
  );
}
