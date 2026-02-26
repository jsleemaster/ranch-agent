import React from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, FilterState } from "@shared/domain";
import {
  gateEmoji,
  gateIconKey,
  growthEmoji,
  iconUrl,
  skillEmoji,
  skillIconKey,
  teamEmoji,
  teamIconKey,
  zoneEmoji,
  zoneIconKey,
  zoneLabel
} from "../world/iconKeys";
import IconToken from "./IconToken";

interface AgentBoardProps {
  agents: AgentSnapshot[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectAgent: (agentId: string | null) => void;
}

function stateClass(state: AgentSnapshot["state"]): string {
  return state === "active" ? "state-active" : "state-waiting";
}

function matchesAgent(agent: AgentSnapshot, filter: FilterState): boolean {
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

export default function AgentBoard({ agents, filter, assets, onSelectAgent }: AgentBoardProps): JSX.Element {
  const hasFilter = !!(filter.selectedAgentId || filter.selectedSkill || filter.selectedZoneId);

  return (
    <div className="panel-body agent-board">
      {agents.map((agent) => {
        const selected = filter.selectedAgentId === agent.agentId;
        const matched = matchesAgent(agent, filter);
        const nextValue = selected ? null : agent.agentId;

        const teamIcon = iconUrl(assets, teamIconKey(agent));
        const skillIcon = iconUrl(assets, skillIconKey(agent.currentSkill));
        const gateIcon = iconUrl(assets, gateIconKey(agent.currentHookGate));
        const zoneIcon = iconUrl(assets, zoneIconKey(agent.currentZoneId));

        const tooltip = [
          `agent: ${agent.agentId}`,
          `team: ${agent.teamId}`,
          `skill: ${agent.currentSkill ?? "none"}`,
          `gate: ${agent.currentHookGate ?? "none"}`,
          `zone: ${zoneLabel(agent.currentZoneId)}`,
          `state: ${agent.state}`,
          `usage: ${agent.usageCount}`,
          `growth: ${agent.growthStage}`
        ].join("\n");

        return (
          <button
            key={agent.agentId}
            className={`agent-card growth-${agent.growthStage} ${selected ? "selected" : ""} ${hasFilter && !matched ? "muted" : ""}`.trim()}
            onClick={() => onSelectAgent(nextValue)}
            title={tooltip}
          >
            <span className={`growth-badge growth-${agent.growthStage}`} title={`growth: ${agent.growthStage}`}>
              {growthEmoji(agent.growthStage)}
            </span>
            <span className={`state-ring ${stateClass(agent.state)}`} aria-hidden="true" />
            <IconToken src={teamIcon} fallback={teamEmoji(agent)} title={tooltip} className="agent-main-icon" />
            <span className="agent-meta-icons" aria-hidden="true">
              <IconToken src={skillIcon} fallback={skillEmoji(agent.currentSkill)} title={`skill: ${agent.currentSkill ?? "none"}`} className="mini-icon" />
              <IconToken src={gateIcon} fallback={gateEmoji(agent.currentHookGate)} title={`gate: ${agent.currentHookGate ?? "none"}`} className="mini-icon" />
              <IconToken src={zoneIcon} fallback={zoneEmoji(agent.currentZoneId)} title={`zone: ${zoneLabel(agent.currentZoneId)}`} className="mini-icon" />
            </span>
          </button>
        );
      })}
      {agents.length === 0 ? <div className="empty-hint" title="No runtime events yet">...</div> : null}
    </div>
  );
}
