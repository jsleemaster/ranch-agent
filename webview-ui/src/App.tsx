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

  useWorldMessages(world);

  const [, forceRender] = useState(0);
  useEffect(() => {
    return world.subscribe(() => forceRender((count) => count + 1));
  }, [world]);

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
  const topSkill = snapshot.skills[0];
  const hasFilter = !!(snapshot.filter.selectedAgentId || snapshot.filter.selectedSkill || snapshot.filter.selectedZoneId);

  return (
    <div className="app-shell">
      <header className="hud-bar" title="에이전트 목장">
        <div className="hud-glyph">🐮</div>
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
          <span className="hud-pill" title={topSkill ? `top skill: ${topSkill.skill} (${topSkill.usageCount})` : "top skill: none"}>
            상위 {topSkill?.usageCount ?? 0}
          </span>
          <span className={`hud-pill ${hasFilter ? "on" : ""}`.trim()} title="filter state">
            필터 {hasFilter ? "ON" : "OFF"}
          </span>
        </div>
      </header>

      <main className="panel-grid">
        <section className="panel enter-a panel-agents" data-icon="🐴" title="일꾼 우리">
          <AgentBoard
            agents={snapshot.agents}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
          />
        </section>

        <section className="panel enter-b panel-flow" data-icon="🧭" title="작업 동선">
          <SkillFlowPanel
            agents={snapshot.agents}
            skillMetrics={snapshot.skills}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
            onSelectSkill={(skill) => send({ type: "select_skill", skill })}
          />
        </section>

        <section className="panel enter-c panel-map" data-icon="🌾" title="목장 구역">
          <FolderMapPanel
            zones={snapshot.zones}
            agents={snapshot.agents}
            filter={snapshot.filter}
            assets={assets}
            onSelectZone={(zoneId) => send({ type: "select_zone", zoneId })}
          />
        </section>

        <section className="panel enter-d panel-feed" data-icon="📜" title="작업 일지">
          <LiveFeedPanel
            events={snapshot.feed}
            filter={snapshot.filter}
            assets={assets}
            onSelectAgent={(agentId) => send({ type: "select_agent", agentId })}
          />
        </section>
      </main>
    </div>
  );
}
