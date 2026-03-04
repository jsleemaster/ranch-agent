import React, { useEffect, useMemo, useState } from "react";

import AgentBoard from "./components/AgentBoard";
import FolderMapPanel from "./components/FolderMapPanel";
import LiveFeedPanel from "./components/LiveFeedPanel";
import SkillFlowPanel from "./components/SkillFlowPanel";
import { useWorldMessages } from "./hooks/useWorldMessages";
import { readAssetCatalog } from "./world/assetCatalog";
import { WorldState } from "./world/WorldState";

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
  const completedCount = snapshot.agents.filter((agent) => agent.state === "completed").length;
  const totalTokens = snapshot.agents.reduce((sum, a) => sum + (a.totalTokensTotal ?? 0), 0);

  const latestEvents = useMemo(() => {
    return [...snapshot.feed].reverse().slice(0, 3);
  }, [snapshot.feed]);

  return (
    <div className="app-shell">
      <header className="hud-bar" title="에이전트 대시보드">
        <div className="hud-meters">
          <span className="hud-pill" title={`active: ${activeCount}`}>
            일함 {activeCount}
          </span>
          <span className="hud-pill" title={`waiting: ${waitingCount}`}>
            쉬는중 {waitingCount}
          </span>
          <span className="hud-pill" title={`completed: ${completedCount}`}>
            마침 {completedCount}
          </span>
          <span className="hud-pill token-pill" title={`총 토큰: ${totalTokens.toLocaleString()}`}>
            🌾 {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
          </span>
        </div>
      </header>

      <main className="panel-grid">
        <div className="left-sidebar-col">
          <section className="panel panel-agents" title="목장 보드">
            <div className="panel-label">🐄 목장 보드</div>
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
            <SkillFlowPanel
              agents={snapshot.agents}
              skillMetrics={snapshot.skills}
              assets={assets}
            />
            
            {/* Phase 12: Ranch Minimap Overlay */}
            <div className="ranch-minimap-wrap">
              <div className="minimap-label">🗺️ 목장 미니맵</div>
              <FolderMapPanel
                zones={snapshot.zones}
                agents={snapshot.agents}
                assets={assets}
                isMinimap={true}
              />
            </div>
          </section>
        </div>
      </main>

      {/* Compact Activity Bar (replaces full panel) */}
      <footer className="activity-bar">
        <div className="activity-bar-label">📜 최근 활동</div>
        <div className="activity-bar-items">
          {latestEvents.length === 0 && (
            <span className="activity-bar-empty">이벤트 대기 중</span>
          )}
          {latestEvents.map((event) => (
            <div
              key={event.id}
              className="activity-chip"
              title={`${event.agentId}\n${event.skill ?? "none"} · ${event.hookGate ?? "none"}\n${event.text ?? ""}`}
            >
              <span className="activity-chip-time">{new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="activity-chip-agent">{event.agentId.length > 10 ? event.agentId.slice(0, 8) + "…" : event.agentId}</span>
              <span className={`activity-chip-status ${event.hookGate === "failed" ? "failed" : ""}`}>
                {event.skill ? event.skill.slice(0, 1).toUpperCase() : "·"}
                {event.hookGate === "open" ? "✓" : event.hookGate === "failed" ? "✗" : "·"}
              </span>
            </div>
          ))}
        </div>
        <button
          className="activity-bar-expand"
          title="전체 로그 열기"
          onClick={() => setFeedExpanded(true)}
        >
          전체 로그 ▸
        </button>
      </footer>

      {feedExpanded ? (
        <div className="feed-overlay" onClick={() => setFeedExpanded(false)}>
          <section className="feed-modal" onClick={(event) => event.stopPropagation()}>
            <header className="feed-modal-header">
              <div className="feed-modal-title">📜 작업 일지</div>
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
