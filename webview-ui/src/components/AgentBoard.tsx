import React, { useMemo } from "react";
import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentMdCatalogItem, AgentSnapshot, SkillMdCatalogItem } from "@shared/domain";
import {
  latestAgentNarrative,
  workspaceAvatarTone,
  workspaceInitials,
  workspaceRoleLabel,
  type WorkspaceStageId,
  WORKSPACE_STAGES,
  workspaceStateLabel
} from "../world/workspaceStages";

interface AgentBoardProps {
  agents: AgentSnapshot[];
  agentMds: AgentMdCatalogItem[];
  skillMds: SkillMdCatalogItem[];
  assets: WebviewAssetCatalog;
  stableStages: Record<string, WorkspaceStageId>;
}

function formatCompact(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
}

export default function AgentBoard({ agents, stableStages }: AgentBoardProps): JSX.Element {
  const ordered = useMemo(() => {
    const roleRank = (value: AgentSnapshot["runtimeRole"]): number => {
      switch (value) {
        case "main":
          return 0;
        case "team":
          return 1;
        default:
          return 2;
      }
    };

    return [...agents].sort((a, b) => {
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
        roleRank(a.runtimeRole) - roleRank(b.runtimeRole) ||
        a.displayShortName.localeCompare(b.displayShortName, "ko") ||
        a.rawShortId.localeCompare(b.rawShortId, "en")
      );
    });
  }, [agents]);

  return (
    <div className="workspace-roster">
      <div className="workspace-panel-header">
        <div>
          <h3 className="workspace-panel-title">작업자 목록</h3>
          <p className="workspace-panel-subtitle">지금 누가 어떤 단계에 있는지 보여줍니다.</p>
        </div>
        <span className="workspace-count-pill">{ordered.length}</span>
      </div>

      <div className="workspace-roster-list">
        {ordered.length === 0 ? (
          <div className="workspace-empty-state compact">
            <div className="workspace-empty-title">표시할 작업자가 없습니다</div>
            <div className="workspace-empty-copy">작업이 시작되면 목록이 자동으로 채워집니다.</div>
          </div>
        ) : (
          ordered.map((agent) => {
            const stage = WORKSPACE_STAGES.find((item) => item.id === (stableStages[agent.agentId] ?? "kickoff"));
            const tokenLabel = formatCompact(agent.totalTokensTotal);

            return (
              <button
                key={agent.agentId}
                className={`roster-item is-${agent.state}`}
                title={`이름: ${agent.displayName}\nID: ${agent.rawShortId}\n역할: ${workspaceRoleLabel(agent.runtimeRole)}\n상태: ${workspaceStateLabel(agent)}`}
                type="button"
              >
                <div className={`roster-avatar ${workspaceAvatarTone(agent)}`}>
                  <span>{workspaceInitials(agent.displayName)}</span>
                  <i className={`roster-presence is-${agent.state}`} />
                </div>

                <div className="roster-copy">
                  <div className="roster-headline">
                    <span className="roster-name">{agent.displayShortName}</span>
                    <span className={`roster-role role-${agent.runtimeRole}`}>{workspaceRoleLabel(agent.runtimeRole)}</span>
                  </div>
                  <div className="roster-meta">{latestAgentNarrative(agent, [])}</div>
                  <div className="roster-footer">
                    <span className={`roster-stage ${stage?.accentClass ?? "stage-kickoff"}`}>{stage?.label ?? "준비"}</span>
                    <span className={`roster-state is-${agent.state}`}>{workspaceStateLabel(agent)}</span>
                    {tokenLabel ? <span className="roster-token">{tokenLabel}</span> : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
