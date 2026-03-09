import React, { useEffect, useMemo, useState } from "react";

import AgentBoard from "./components/AgentBoard";
import FolderMapPanel from "./components/FolderMapPanel";
import LiveFeedPanel from "./components/LiveFeedPanel";
import SessionArchivePanel from "./components/SessionArchivePanel";
import SkillFlowPanel from "./components/SkillFlowPanel";
import { useWorldMessages } from "./hooks/useWorldMessages";
import { readAssetCatalog } from "./world/assetCatalog";
import { WorldState } from "./world/WorldState";

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

  useWorldMessages(world);

  const [, forceRender] = useState(0);
  useEffect(() => {
    return world.subscribe(() => forceRender((count) => count + 1));
  }, [world]);

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
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [feedExpanded]);

  const snapshot = world.getSnapshot();
  const activeCount = snapshot.agents.filter((agent) => agent.state === "active").length;
  const waitingCount = snapshot.agents.filter((agent) => agent.state === "waiting").length;
  const completedCount = snapshot.sessions.length;
  const totalTokens = snapshot.agents.reduce((sum, a) => sum + (a.totalTokensTotal ?? 0), 0);
  const latestMainBudget = useMemo(() => {
    const mainLineageIds = new Set(
      snapshot.agents.filter((agent) => agent.runtimeRole === "main").map((agent) => agent.agentId)
    );
    return [...snapshot.budgets]
      .filter((budget) => mainLineageIds.has(budget.lineageId))
      .sort((a, b) => b.updatedAtTs - a.updatedAtTs)[0] ?? null;
  }, [snapshot.agents, snapshot.budgets]);
  const signalTotals = useMemo(() => {
    const find = (signal: string): number => snapshot.signals.find((metric) => metric.signal === signal)?.usageCount ?? 0;
    return {
      orchestration: find("orchestration_signal"),
      unknown: find("unknown_tool_signal"),
      missing: find("tool_name_missing_signal"),
      assistant: find("assistant_reply_signal")
    };
  }, [snapshot.signals]);
  const totalSignals = signalTotals.orchestration + signalTotals.unknown + signalTotals.missing + signalTotals.assistant;
  const signalTooltip = `운행 조정 ${signalTotals.orchestration}\n외부 설비 ${signalTotals.unknown}\n신호 누락 ${signalTotals.missing}\n운행 안내 ${signalTotals.assistant}`;
  const contextLabel = formatPercent(latestMainBudget?.contextPercent);
  const sessionLabel = formatCompactNumber(latestMainBudget?.sessionTokensTotal);
  const costLabel = formatUsd(latestMainBudget?.costUsd);

  const latestEvents = useMemo(() => {
    return [...snapshot.feed].reverse().slice(0, 5);
  }, [snapshot.feed]);

  return (
    <div className="app-shell">
      <header className="hud-bar" title="프리미엄 철도 관제 대시보드">
        <div className="hud-meters">
          <span className="hud-pill" title={`active: ${activeCount}`}>
            운행 {activeCount}
          </span>
          <span className="hud-pill" title={`waiting: ${waitingCount}`}>
            대기 {waitingCount}
          </span>
          <span className="hud-pill" title={`completed: ${completedCount}`}>
            종점 {completedCount}
          </span>
          <span className="hud-pill token-pill" title={`총 토큰: ${totalTokens.toLocaleString()}`}>
            처리량 {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
          </span>
          <span className="hud-pill signal-pill" title={signalTooltip}>
            관제 신호 {totalSignals}
          </span>
          {contextLabel ? (
            <span
              className="hud-pill hud-pill-budget"
              title={`현재 본선 회차 점유율: ${contextLabel}`}
            >
              노선 점유율 {contextLabel}
            </span>
          ) : null}
          {sessionLabel ? (
            <span
              className="hud-pill hud-pill-budget"
              title={`현재 본선 회차 처리량: ${latestMainBudget?.sessionTokensTotal?.toLocaleString() ?? 0}`}
            >
              회차 처리량 {sessionLabel}
            </span>
          ) : null}
          {costLabel ? (
            <span
              className="hud-pill hud-pill-budget"
              title={`현재 본선 회차 운영비: ${latestMainBudget?.costUsd?.toFixed(3) ?? "0.000"} USD`}
            >
              운영비 {costLabel}
            </span>
          ) : null}
        </div>
      </header>

      <main className="panel-grid">
        <div className="left-sidebar-col">
          <section className="panel panel-agents" title="관제 보드">
            <div className="panel-label">🚆 관제 보드</div>
            <AgentBoard
              agents={snapshot.agents}
              agentMds={snapshot.agentMds}
              skillMds={snapshot.skillMds}
              assets={assets}
            />
          </section>
        </div>

        <div className="right-content-col">
          <section className="panel panel-flow">
            <div className="panel-label">🛤️ 노선 관제</div>
            <SkillFlowPanel
              agents={snapshot.agents}
              skillMetrics={snapshot.skills}
              signalMetrics={snapshot.signals}
              budgets={snapshot.budgets}
              assets={assets}
            />

          </section>

          <div className="right-bottom-row">
            <section className="panel panel-sessions">
              <div className="panel-label">🧾 운행 기록</div>
              <SessionArchivePanel sessions={snapshot.sessions} />
            </section>

            <section className="panel panel-minimap">
              <div className="panel-label">🚉 노선 미니맵</div>
              <div className="panel-body minimap-panel-body">
                <FolderMapPanel
                  zones={snapshot.zones}
                  agents={snapshot.agents}
                  assets={assets}
                  isMinimap={true}
                />
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Compact Activity Bar (replaces full panel) */}
      <footer className="activity-bar">
        <div className="activity-bar-label">📡 관제 로그</div>
        <div className="activity-bar-items">
          {latestEvents.length === 0 && (
            <span className="activity-bar-empty">로그 대기 중</span>
          )}
          {latestEvents.map((event) => (
            <div
              key={event.id}
              className="activity-chip"
              title={
                event.kind === "session_rollover"
                  ? `${event.agentId}\n회차 전환\n${event.text ?? ""}`
                  : `${event.agentId}\n${event.skill ?? "none"} · ${event.hookGate ?? "none"}\n${event.text ?? ""}`
              }
            >
              <span className="activity-chip-time">{new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="activity-chip-agent">{event.agentId.length > 10 ? event.agentId.slice(0, 8) + "…" : event.agentId}</span>
              <span className={`activity-chip-status ${event.hookGate === "failed" ? "failed" : ""}`}>
                {event.kind === "session_rollover"
                  ? "회차"
                  : event.skill
                    ? event.skill.slice(0, 1).toUpperCase()
                    : "·"}
                {event.kind
                  ? ""
                  : event.hookGate === "open"
                    ? "✓"
                    : event.hookGate === "failed"
                      ? "✗"
                      : "·"}
              </span>
            </div>
          ))}
        </div>
        <button
          className="activity-bar-expand"
          title="관제 로그 전체 보기"
          onClick={() => setFeedExpanded(true)}
        >
          전체 로그 ▸
        </button>
      </footer>

      {feedExpanded ? (
        <div className="feed-overlay" onClick={() => setFeedExpanded(false)}>
          <section className="feed-modal" onClick={(event) => event.stopPropagation()}>
            <header className="feed-modal-header">
              <div className="feed-modal-title">📡 관제 로그</div>
              <button className="feed-modal-close" onClick={() => setFeedExpanded(false)}>
                닫기
              </button>
            </header>
            <LiveFeedPanel
              events={snapshot.feed}
              assets={assets}
              variant="overlay"
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
