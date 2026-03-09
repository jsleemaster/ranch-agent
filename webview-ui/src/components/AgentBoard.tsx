import React, { useMemo, useState } from "react";
import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentMdCatalogItem, AgentSnapshot, SkillMdCatalogItem } from "@shared/domain";
import {
  agentAvatarEmoji,
  iconUrl,
  teamEmoji,
  teamIconKey
} from "../world/iconKeys";
import { levelTier } from "../world/levelTier";
import IconToken from "./IconToken";

interface AgentBoardProps {
  agents: AgentSnapshot[];
  agentMds: AgentMdCatalogItem[];
  skillMds: SkillMdCatalogItem[];
  assets: WebviewAssetCatalog;
}

type AgentBoardTab = "active" | "agents" | "skills";

function runtimeRoleLabel(role: AgentSnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "지선";
    case "team":
      return "합동";
    default:
      return "본선";
  }
}

function runtimeRoleEmoji(role: AgentSnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "🚈";
    case "team":
      return "🔀";
    default:
      return "🚆";
  }
}

function agentStateLabel(state: AgentSnapshot["state"]): string {
  switch (state) {
    case "active":
      return "운행 중";
    case "completed":
      return "종점 도착";
    default:
      return "신호 대기";
  }
}

export default function AgentBoard({
  agents,
  agentMds,
  skillMds,
  assets
}: AgentBoardProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<AgentBoardTab>("active");

  // Phase 8: Strategic Rankings
  const topAgentMds = useMemo(() => {
    const usageMap: Record<string, number> = {};
    agents.forEach(a => {
      Object.entries(a.agentMdCallsById).forEach(([id, count]) => {
        usageMap[id] = (usageMap[id] || 0) + count;
      });
    });
    return agentMds
      .map(md => ({ ...md, usage: usageMap[md.id] || 0 }))
      .sort((a, b) => b.usage - a.usage)
      .filter(md => md.usage > 0)
      .slice(0, 3);
  }, [agents, agentMds]);

  const topSkills = useMemo(() => {
    // Sort skills by total usage across all metrics
    const sorted = [...skillMds]
      .map(md => {
        const usage = agents.reduce((acc, a) => acc + (a.skillMdCallsById[md.id] || 0), 0);
        return { ...md, usage };
      })
      .sort((a, b) => b.usage - a.usage)
      .filter(s => s.usage > 0)
      .slice(0, 3);
    return sorted;
  }, [agents, skillMds]);

  return (
    <div className="panel-body agent-board">
      <div className="agent-board-tabs">
        <button 
          className={`tab-btn ${activeTab === "active" ? "on" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          <span className="tab-btn-icon">🚆</span>
          <span className="tab-btn-label" title={`편성 ${agents.length}`}>편성</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === "agents" ? "on" : ""}`}
          onClick={() => setActiveTab("agents")}
        >
          <span className="tab-btn-icon">🗂️</span>
          <span className="tab-btn-label" title={`배치표 ${agentMds.length}`}>배치표</span>
        </button>
        <button 
          className={`tab-btn ${activeTab === "skills" ? "on" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          <span className="tab-btn-icon">🛠️</span>
          <span className="tab-btn-label" title={`설비 ${skillMds.length}`}>설비</span>
        </button>
      </div>

      <div className="agent-board-content">
        {activeTab === "active" && (
          <div className="agent-cards-grid">
            {agents.length === 0 && <div className="empty-hint">실시간 편성 대기 중</div>}
            {agents.map((agent) => {
              const teamIcon = iconUrl(assets, teamIconKey(agent));
              const tier = levelTier(agent.growthLevel);
              return (
                <div 
                  key={agent.agentId} 
                  className={`agent-card ${agent.state} growth-${agent.growthStage} level-tier-${tier} ${agent.mainBranchRisk ? "branch-risk" : ""}`}
                  title={`편성: ${agent.agentId}\n상태: ${agentStateLabel(agent.state)}\n역할: ${runtimeRoleLabel(agent.runtimeRole)}\n대상 브랜치: ${agent.branchName}\n에이전트 지침 호출: ${agent.agentMdCallsTotal}`}
                >
                  <div className="agent-card-top">
                    <div className={`agent-level-badge level-tier-${tier}`} title={`레벨: ${agent.growthLevel}`}>
                      <span className="agent-level-text">LV {agent.growthLevel}</span>
                    </div>

                    <div className="agent-card-top-right">
                      <div className={`agent-role-badge role-${agent.runtimeRole}`} title={`역할: ${runtimeRoleLabel(agent.runtimeRole)}`}>
                        <span>{runtimeRoleEmoji(agent.runtimeRole)}</span>
                        <span>{runtimeRoleLabel(agent.runtimeRole)}</span>
                      </div>
                      {agent.state === "active" && <div className="state-ring state-active" />}
                    </div>
                  </div>
                  
                  <IconToken 
                    src={teamIcon} 
                    fallback={agentAvatarEmoji(agent) || teamEmoji(agent)}
                    title={`편성 ID: ${agent.agentId}\n대상 브랜치: ${agent.branchName}`} 
                    className="agent-main-icon"
                    autoTrim={true}
                    minAutoScale={2.8}
                    maxAutoScale={6.5}
                  />

                  <div className="agent-card-bottom">
                    {(agent.totalTokensTotal ?? 0) > 0 && (
                      <div className="agent-token-badge" title={`누적 처리량: ${(agent.totalTokensTotal ?? 0).toLocaleString()} 토큰`}>
                        처리량 {(agent.totalTokensTotal ?? 0) >= 1000
                          ? `${((agent.totalTokensTotal ?? 0) / 1000).toFixed(1)}K`
                          : agent.totalTokensTotal}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "agents" && (
          <div className="agent-md-sections">
            {topAgentMds.length > 0 && (
              <div className="usage-ranking">
                <div className="ranking-title">🏆 자주 호출된 배치 지침</div>
                <div className="ranking-list">
                  {topAgentMds.map((md, i) => (
                    <div key={md.id} className={`ranking-item top-${i+1}`}>
                      <span className="ranking-rank">{i + 1}</span>
                      <span className="ranking-name">{md.label}</span>
                      <span className="ranking-value">{md.usage}회</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="md-catalog-section">
              <div className="md-section-label">배치 지침 목록</div>
              <div className="md-chip-row">
                {agentMds.length === 0 && <div className="empty-catalog-hint">감지된 배치 지침이 없습니다</div>}
                {agentMds.map(md => (
                  <div key={md.id} className="agent-md-chip" title={md.fileName}>
                    {md.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "skills" && (
          <div className="agent-md-sections">
            {topSkills.length > 0 && (
              <div className="usage-ranking">
                <div className="ranking-title">🔥 자주 가동된 설비 지침</div>
                <div className="ranking-list">
                  {topSkills.map((s, i) => (
                    <div key={s.id} className={`ranking-item top-${i+1}`}>
                      <span className="ranking-rank">{i + 1}</span>
                      <span className="ranking-name">{s.label}</span>
                      <span className="ranking-value">{s.usage}회</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="md-catalog-section">
              <div className="md-section-label">설비 지침 목록</div>
              <div className="md-chip-row">
                {skillMds.length === 0 && <div className="empty-catalog-hint">감지된 설비 지침이 없습니다</div>}
                {skillMds.map(md => (
                  <div key={md.id} className="agent-md-chip skill-md" title={md.fileName}>
                    {md.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
