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
  const harvestCount = matchedAgents.filter((agent) => agent.growthStage === "harvest").length;
  const mainRiskCount = matchedAgents.filter((agent) => agent.mainBranchRisk).length;
  const topSkill = snapshot.skills[0];
  const hasFilter = !!(snapshot.filter.selectedAgentId || snapshot.filter.selectedSkill || snapshot.filter.selectedZoneId);
  const agentMdCatalogTitle =
    snapshot.agentMds.length > 0
      ? snapshot.agentMds.map((item) => item.label).join(", ")
      : "workspace .claude/agents/*.md not found";

  return (
    <div className="app-shell">
      <header className="hud-bar" title="🐮 에이전트 목장">
        <div className="hud-meters">
          <span className="hud-pill" title={`visible agents: ${matchedAgents.length}/${snapshot.agents.length}`}>
            일꾼 {matchedAgents.length}
          </span>
          <span className="hud-pill" title={`active: ${activeCount}`}>
            활동 {activeCount}
          </span>
          <span className="hud-pill" title={`waiting: ${waitingCount}`}>
            대기 {waitingCount}
          </span>
          <span className="hud-pill" title={`harvest stage: ${harvestCount}`}>
            수확 {harvestCount}
          </span>
          <span className={`hud-pill ${mainRiskCount > 0 ? "warn" : ""}`.trim()} title={`agents on protected branches: ${mainRiskCount}`}>
            메인위험 {mainRiskCount}
          </span>
          <span className="hud-pill" title={agentMdCatalogTitle}>
            등록에이전트 {snapshot.agentMds.length}
          </span>
          <span className="hud-pill" title={topSkill ? `top skill: ${topSkill.skill} (${topSkill.usageCount})` : "top skill: none"}>
            상위 {topSkill?.usageCount ?? 0}
          </span>
          <span className={`hud-pill ${hasFilter ? "on" : ""}`.trim()} title="filter state">
            필터 {hasFilter ? "ON" : "OFF"}
          </span>
        </div>
      </header>

      <main className="panel-grid">
        <section className="panel enter-a panel-agents" title="일꾼 우리">
          <div className="panel-label">🐮 일꾼 우리</div>
          <AgentBoard
            agents={snapshot.agents}
            agentMds={snapshot.agentMds}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
          />
        </section>

        <section className="panel enter-b panel-flow" title="작업 동선">
          <div className="panel-label">🔗 작업 동선</div>
          <SkillFlowPanel
            agents={snapshot.agents}
            skillMetrics={snapshot.skills}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
            onSelectSkill={(skill) => send({ type: "select_skill", skill })}
          />
        </section>

        <section className="panel enter-c panel-map" title="목장 구역">
          <div className="panel-label">🗺️ 목장 구역</div>
          <FolderMapPanel
            zones={snapshot.zones}
            agents={snapshot.agents}
            filter={snapshot.filter}
            assets={assets}
            onSelectZone={(zoneId) => send({ type: "select_zone", zoneId })}
          />
        </section>

        <section className="panel enter-d panel-feed" title="작업 일지">
          <div className="panel-label">📜 작업 일지</div>
          <button
            className="panel-expand-btn"
            title="작업 일지 더보기"
            onClick={() => setFeedExpanded(true)}
          >
            더보기
          </button>
          <LiveFeedPanel
            events={snapshot.feed}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
          />
        </section>
      </main>

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
