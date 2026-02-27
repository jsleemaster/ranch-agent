import React, { useEffect, useMemo, useState } from "react";

import type { AgentSnapshot } from "@shared/domain";
import type { WebviewToExtMessage } from "@shared/protocol";
import AgentBoard from "./components/AgentBoard";
import FolderMapPanel from "./components/FolderMapPanel";
import LiveFeedPanel from "./components/LiveFeedPanel";
import SkillFlowPanel from "./components/SkillFlowPanel";
import { useWorldMessages } from "./hooks/useWorldMessages";
import { vscode } from "./vscodeApi";
import { readAssetCatalog } from "./world/assetCatalog";
import { WorldState } from "./world/WorldState";

function matchesAgent(agent: AgentSnapshot | undefined, filter: ReturnType<WorldState["getSnapshot"]>["filter"]): boolean {
  if (!agent) {
    return false;
  }

  if (filter.selectedAgentId && agent.agentId !== filter.selectedAgentId) {
    return false;
  }

  if (filter.selectedSkill && agent.currentSkill !== filter.selectedSkill) {
    return false;
  }

  if (filter.selectedZoneId && agent.currentZoneId !== filter.selectedZoneId) {
    return false;
  }

  return true;
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

  const matchedAgents = useMemo(
    () => snapshot.agents.filter((agent) => matchesAgent(agent, snapshot.filter)),
    [snapshot.agents, snapshot.filter]
  );
  const send = (message: WebviewToExtMessage) => {
    vscode.postMessage(message);
  };

  const activeCount = matchedAgents.filter((agent) => agent.state === "active").length;
  const waitingCount = matchedAgents.length - activeCount;
  const hasFilter = !!(snapshot.filter.selectedAgentId || snapshot.filter.selectedSkill || snapshot.filter.selectedZoneId);
  const totalTokens = snapshot.agents.reduce((sum, a) => sum + (a.totalTokensTotal ?? 0), 0);

  const latestEvents = useMemo(() => {
    return [...snapshot.feed].reverse().slice(0, 3);
  }, [snapshot.feed]);

  return (
    <div className="app-shell">
      <header className="hud-bar" title="에이전트 대시보드">
        <div className="hud-meters">
          <span className="hud-pill" title={`active: ${activeCount}`}>
            활동 {activeCount}
          </span>
          <span className="hud-pill" title={`waiting: ${waitingCount}`}>
            대기 {waitingCount}
          </span>
          <span className={`hud-pill ${hasFilter ? "on" : ""}`.trim()} title="filter state">
            필터 {hasFilter ? "ON" : "OFF"}
          </span>
          <span className="hud-pill token-pill" title={`총 토큰: ${totalTokens.toLocaleString()}`}>
            🌾 {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens}
          </span>
        </div>
      </header>

      <main className="panel-grid">
        <div className="left-sidebar-col">
          <section className="panel panel-agents" title="에이전트 보드">
            <div className="panel-label">🤖 에이전트 보드</div>
            <AgentBoard
              agents={snapshot.agents}
              agentMds={snapshot.agentMds}
              skillMds={snapshot.skillMds}
              filter={snapshot.filter}
              assets={assets}
              onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
            />
          </section>
        </div>

        <div className="right-content-col">
          <section className="panel panel-flow">
            <SkillFlowPanel
              agents={snapshot.agents}
              skillMetrics={snapshot.skills}
              filter={snapshot.filter}
              assets={assets}
              onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
              onSelectSkill={(skill) => send({ type: "select_skill", skill })}
            />
            
            {/* Phase 12: Ranch Minimap Overlay */}
            <div className="ranch-minimap-wrap">
              <div className="minimap-label">🗺️ 목장 미니맵</div>
              <FolderMapPanel
                zones={snapshot.zones}
                agents={snapshot.agents}
                filter={snapshot.filter}
                assets={assets}
                onSelectZone={(zoneId) => send({ type: "select_zone", zoneId })}
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
            <button
              key={event.id}
              className="activity-chip"
              title={`${event.agentId}\n${event.skill ?? "none"} · ${event.hookGate ?? "none"}\n${event.text ?? ""}`}
              onClick={() => send({ type: "select_agent", agentId: event.agentId })}
            >
              <span className="activity-chip-time">{new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="activity-chip-agent">{event.agentId.length > 10 ? event.agentId.slice(0, 8) + "…" : event.agentId}</span>
              <span className={`activity-chip-status ${event.hookGate === "failed" ? "failed" : ""}`}>
                {event.skill ? event.skill.slice(0, 1).toUpperCase() : "·"}
                {event.hookGate === "open" ? "✓" : event.hookGate === "failed" ? "✗" : "·"}
              </span>
            </button>
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
              filter={snapshot.filter}
              assets={assets}
              onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
              variant="overlay"
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
