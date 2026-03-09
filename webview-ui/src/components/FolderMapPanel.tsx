import React, { useMemo } from "react";
import type { CSSProperties } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, ZoneSnapshot } from "@shared/domain";
import {
  agentAvatarEmoji,
  iconUrl,
  teamEmoji,
  teamIconKey
} from "../world/iconKeys";
import IconToken from "./IconToken";

interface FolderMapPanelProps {
  zones: ZoneSnapshot[];
  agents: AgentSnapshot[];
  assets: WebviewAssetCatalog;
  isMinimap?: boolean;
}

type RailStopId = "idle" | "explore" | "maintain" | "execute" | "report";

interface RailStop {
  id: RailStopId;
  label: string;
  glyph: string;
}

const RAIL_STOPS: RailStop[] = [
  { id: "idle", label: "대기", glyph: "◌" },
  { id: "explore", label: "탐색", glyph: "⌕" },
  { id: "maintain", label: "정비", glyph: "⚙" },
  { id: "execute", label: "실행", glyph: "▶" },
  { id: "report", label: "보고", glyph: "▣" }
];

function railStopForAgent(agent: AgentSnapshot): RailStopId {
  if (agent.state === "completed") {
    return "report";
  }
  if (agent.currentHookGate === "blocked") {
    return "idle";
  }
  switch (agent.currentSkill) {
    case "read":
    case "search":
      return "explore";
    case "edit":
    case "write":
      return "maintain";
    case "bash":
    case "task":
      return "execute";
    case "ask":
    case "other":
      return "report";
    default:
      return agent.state === "active" ? "execute" : "idle";
  }
}

function skillStageLabel(agent: AgentSnapshot): string {
  switch (railStopForAgent(agent)) {
    case "idle":
      return "대기";
    case "explore":
      return "탐색";
    case "maintain":
      return "정비";
    case "execute":
      return "실행";
    case "report":
      return "보고";
    default:
      return "대기";
  }
}

function roleLabel(role: AgentSnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "지선";
    case "team":
      return "합동";
    default:
      return "본선";
  }
}

export default function FolderMapPanel({
  zones: _zones,
  agents,
  assets,
  isMinimap = false
}: FolderMapPanelProps): JSX.Element {
  const grouped = useMemo(() => {
    const next = new Map<RailStopId, AgentSnapshot[]>();
    for (const stop of RAIL_STOPS) {
      next.set(stop.id, []);
    }

    const orderedAgents = [...agents].sort((a, b) => b.lastEventTs - a.lastEventTs);
    for (const agent of orderedAgents) {
      const stop = railStopForAgent(agent);
      next.get(stop)?.push(agent);
    }

    return next;
  }, [agents]);

  const totalAgents = agents.length;

  return (
    <div className={`rail-minimap ${isMinimap ? "minimap-mode" : ""}`}>
      <div className="rail-minimap-track" />
      {RAIL_STOPS.map((stop, index) => {
        const stopAgents = grouped.get(stop.id) ?? [];
        const style = { "--stop-index": index } as CSSProperties;

        return (
          <div key={stop.id} className={`rail-stop stop-${stop.id}`} style={style}>
            <div className="rail-stop-label">{stop.label}</div>
            <div className="rail-stop-node">{stop.glyph}</div>
            <div className="rail-stop-agents">
              {stopAgents.slice(0, 4).map((agent) => {
                const teamIcon = iconUrl(assets, teamIconKey(agent));
                return (
                  <div
                    key={`${stop.id}:${agent.agentId}`}
                    className={`rail-stop-agent ${agent.state}`}
                    title={`${agent.agentId}\n${skillStageLabel(agent)}\n${roleLabel(agent.runtimeRole)}`}
                  >
                    <IconToken
                      src={teamIcon}
                      fallback={agentAvatarEmoji(agent) || teamEmoji(agent)}
                      title={agent.agentId}
                      className="rail-stop-agent-icon"
                      autoTrim={true}
                      minAutoScale={2.2}
                      maxAutoScale={5.5}
                    />
                  </div>
                );
              })}
              {stopAgents.length > 4 ? (
                <div className="rail-stop-more" title={`${stop.label} 편성 ${stopAgents.length}개`}>
                  +{stopAgents.length - 4}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      {totalAgents === 0 ? <div className="rail-minimap-empty">편성 대기 중</div> : null}
    </div>
  );
}
