import React, { useMemo, useState } from "react";
import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentMdCatalogItem, AgentSnapshot, FilterState, SkillMdCatalogItem } from "@shared/domain";
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
import { gateStatusLabel, growthLabel, skillLabel } from "./SkillFlowPanel";

interface AgentBoardProps {
  agents: AgentSnapshot[];
  agentMds: AgentMdCatalogItem[];
  skillMds: SkillMdCatalogItem[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectAgent: (agentId: string | null) => void;
}

type AgentBoardTab = "active" | "agents" | "skills";

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

export default function AgentBoard({
  agents,
  agentMds,
  skillMds,
  filter,
  assets,
  onSelectAgent
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
    const ranking = [...(filter.selectedAgentId ? [] : [])]; // To avoid unused var if needed
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

  const hasFilter = !!(filter.selectedAgentId || filter.selectedSkill || filter.selectedZoneId);

  return (
    <div className="panel-body agent-board">
      <div className="agent-board-tabs">
        <button 
          className={`tab-btn ${activeTab === "active" ? "on" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          🐮 일꾼 ({agents.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === "agents" ? "on" : ""}`}
          onClick={() => setActiveTab("agents")}
        >
          🤖 에이전트 ({agentMds.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === "skills" ? "on" : ""}`}
          onClick={() => setActiveTab("skills")}
        >
          🛠️ 스킬 ({skillMds.length})
        </button>
      </div>

      <div className="agent-board-content">
        {activeTab === "active" && (
          <div className="agent-cards-grid">
            {agents.length === 0 && <div className="empty-hint">등록된 에이전트가 없습니다</div>}
            {agents.map((agent) => {
              const selected = filter.selectedAgentId === agent.agentId;
              const matchesFilter = !filter.selectedAgentId || filter.selectedAgentId === agent.agentId;
              if (!matchesFilter) return null;

              const teamIcon = iconUrl(assets, teamIconKey(agent));
              const skillIcon = iconUrl(assets, skillIconKey(agent.currentSkill));
              const gateIcon = iconUrl(assets, gateIconKey(agent.currentHookGate));
              const zoneIcon = iconUrl(assets, zoneIconKey(agent.currentZoneId));
              const agentMdEntries = Object.entries(agent.agentMdCallsById).sort((a, b) => b[1] - a[1]);
              
              return (
                <div 
                  key={agent.agentId} 
                  className={`agent-card ${agent.state} ${selected ? "selected" : ""} growth-${agent.growthStage} ${agent.mainBranchRisk ? "branch-risk" : ""}`}
                  onClick={() => onSelectAgent(selected ? null : agent.agentId)}
                  title={`Agent: ${agent.agentId}\nTarget: ${agent.branchName}\nMDs: ${agent.agentMdCallsTotal}`}
                >
                  <div className="agent-md-badge" title="총 작업 횟수 (MD Call Count)">
                    {agent.agentMdCallsTotal}
                  </div>
                  
                  {agent.state === "active" && <div className="state-ring state-active" />}
                  <div className="growth-badge" title={`성장 단계: ${growthLabel(agent.growthStage)}`}>{growthEmoji(agent.growthStage)}</div>
                  
                  <IconToken 
                    src={teamIcon} 
                    fallback={teamEmoji(agent)} 
                    title={`에이전트 ID: ${agent.agentId}\n목표 브랜치: ${agent.branchName}`} 
                    className="agent-main-icon" 
                  />
                  
                  <div className="agent-meta-icons">
                    <IconToken 
                      src={skillIcon} 
                      fallback={skillEmoji(agent.currentSkill)} 
                      title={`현재 스킬: ${skillLabel(agent.currentSkill)}`} 
                      className="icon-token mini-icon" 
                    />
                    <IconToken 
                      src={gateIcon} 
                      fallback={gateEmoji(agent.currentHookGate)} 
                      title={`승인 상태: ${gateStatusLabel(agent.currentHookGate)}`} 
                      className="icon-token mini-icon" 
                    />
                    <IconToken 
                      src={zoneIcon} 
                      fallback={zoneEmoji(agent.currentZoneId)} 
                      title={`현재 구역: ${zoneLabel(agent.currentZoneId)}`} 
                      className="icon-token mini-icon" 
                    />
                  </div>

                  {(agent.totalTokensTotal ?? 0) > 0 && (
                    <div className="agent-token-badge" title={`사료 소비: ${(agent.totalTokensTotal ?? 0).toLocaleString()} 토큰`}>
                      🌾 {(agent.totalTokensTotal ?? 0) >= 1000
                        ? `${((agent.totalTokensTotal ?? 0) / 1000).toFixed(1)}K`
                        : agent.totalTokensTotal}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "agents" && (
          <div className="agent-md-sections">
            {topAgentMds.length > 0 && (
              <div className="usage-ranking">
                <div className="ranking-title">🏆 인기 에이전트 (MD)</div>
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
              <div className="md-section-label">Agent MD Catalog</div>
              <div className="md-chip-row">
                {agentMds.length === 0 && <div className="empty-catalog-hint">No agent MDs found</div>}
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
                <div className="ranking-title">🔥 자주 사용된 기술 (Skill)</div>
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
              <div className="md-section-label">Skill MD Catalog</div>
              <div className="md-chip-row">
                {skillMds.length === 0 && <div className="empty-catalog-hint">No skill MDs found</div>}
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
