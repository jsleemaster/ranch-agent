import React, { useMemo } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, FilterState, SkillKind, SkillMetricSnapshot } from "@shared/domain";
import {
  agentAvatarEmoji,
  gateEmoji,
  iconUrl,
  skillEmoji,
  skillIconKey,
  teamIconKey,
  teamEmoji
} from "../world/iconKeys";
import IconToken from "./IconToken";

interface SkillFlowPanelProps {
  agents: AgentSnapshot[];
  skillMetrics: SkillMetricSnapshot[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectAgent: (agentId: string | null) => void;
  onSelectSkill: (skill: SkillKind | null) => void;
}

const MAX_VISIBLE = 12;

function gateStatusClass(gate: AgentSnapshot["currentHookGate"]): string {
  switch (gate) {
    case "open": return "gate-open";
    case "blocked": return "gate-blocked";
    case "failed": return "gate-failed";
    case "closed": return "gate-closed";
    default: return "gate-idle";
  }
}

export function gateStatusLabel(gate: AgentSnapshot["currentHookGate"]): string {
  switch (gate) {
    case "open": return "통과";
    case "blocked": return "대기";
    case "failed": return "실패";
    case "closed": return "완료";
    default: return "대기";
  }
}

export function growthLabel(stage: AgentSnapshot["growthStage"]): string {
  switch (stage) {
    case "seed": return "씨앗";
    case "sprout": return "새싹";
    case "grow": return "성장";
    case "harvest": return "수확";
    default: return "씨앗";
  }
}

export function skillLabel(skill: string | null): string {
  if (!skill) return "—";
  const labels: Record<string, string> = {
    read: "읽기",
    edit: "수정",
    write: "작성",
    bash: "실행",
    search: "검색",
    task: "작업",
    ask: "질문",
    other: "기타"
  };
  return labels[skill] ?? skill;
}

function runtimeRoleLabel(role: AgentSnapshot["runtimeRole"]): string {
  switch (role) {
    case "subagent":
      return "서브";
    case "team":
      return "팀";
    default:
      return "메인";
  }
}

function shortId(id: string): string {
  if (id.length <= 12) return id;
  const dash = id.indexOf("-");
  if (dash > 0 && dash <= 10) return id.slice(0, dash);
  return id.slice(0, 10) + "…";
}

function xpPercent(growthLevelUsage: number): number {
  if (growthLevelUsage <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((growthLevelUsage / 34) * 100));
}

export default function SkillFlowPanel({
  agents,
  skillMetrics: _skillMetrics,
  filter,
  assets,
  onSelectAgent,
  onSelectSkill
}: SkillFlowPanelProps): JSX.Element {
  const rows = useMemo(() => {
    return agents
      .filter(a => a.state === "active" || a.usageCount > 0)
      .sort((a, b) => b.lastEventTs - a.lastEventTs)
      .slice(0, MAX_VISIBLE);
  }, [agents]);

  return (
    <div className="panel-body pipeline-board">
      {rows.length === 0 && (
        <div className="pipeline-empty">
          <div className="pipeline-empty-icon">⚡</div>
          <div className="pipeline-empty-text">에이전트 활동 대기 중</div>
          <div className="pipeline-empty-sub">에이전트가 작업을 시작하면 실시간으로 표시됩니다</div>
        </div>
      )}

      {rows.map((agent) => {
        const selected = filter.selectedAgentId === agent.agentId;
        const skill = agent.currentSkill;
        const gate = agent.currentHookGate;
        const agentSkillCount = skill ? (agent.skillUsageByKind[skill] ?? 0) : 0;
        const teamIcon = iconUrl(assets, teamIconKey(agent));
        const skillIcon = iconUrl(assets, skillIconKey(skill));
        const xp = xpPercent(agent.growthLevelUsage);

        return (
          <div
            key={agent.agentId}
            className={`pipeline-row ${agent.state} ${selected ? "selected" : ""} growth-${agent.growthStage}`}
            onClick={() => onSelectAgent(selected ? null : agent.agentId)}
          >
            {/* Agent Avatar */}
            <div className="pipeline-avatar">
              <IconToken
                src={teamIcon}
                fallback={agentAvatarEmoji(agent) || teamEmoji(agent)}
                title={agent.agentId}
                className="pipeline-avatar-icon"
              />
              {agent.state === "active" && <div className="pipeline-pulse" />}
            </div>

            {/* Agent Info */}
            <div className="pipeline-info">
              <div className="pipeline-name">
                {shortId(agent.agentId)}
                <span className={`pipeline-role role-${agent.runtimeRole}`}>{runtimeRoleLabel(agent.runtimeRole)}</span>
                {agent.state === "completed" && <span className="pipeline-status completed">완료</span>}
              </div>
              <div className="pipeline-xp-bar">
                <div
                  className={`pipeline-xp-fill growth-${agent.growthStage}`}
                  style={{ width: `${xp}%` }}
                />
                <span
                  className="pipeline-xp-label"
                  title={`경험치 진행도: ${agent.growthLevelUsage}/35 · 단계 ${growthLabel(agent.growthStage)}`}
                >
                  XP {agent.growthLevelUsage}/35
                </span>
              </div>
            </div>

            {/* Skill Stage */}
            <div
              className={`pipeline-stage stage-skill ${skill ? "" : "inactive"}`}
              onClick={(e) => {
                e.stopPropagation();
                if (skill) onSelectSkill(filter.selectedSkill === skill ? null : skill);
              }}
            >
              <IconToken
                src={skillIcon}
                fallback={skillEmoji(skill)}
                title={`스킬: ${skillLabel(skill)}`}
                className="pipeline-stage-icon"
              />
              <span className="pipeline-stage-label">{skillLabel(skill)}</span>
              {agentSkillCount > 0 && (
                <span className="pipeline-stage-count">{agentSkillCount}</span>
              )}
            </div>

            {/* Gate Status */}
            <div className={`pipeline-gate ${gateStatusClass(gate)}`}>
              <div className="pipeline-gate-orb" />
              <span className="pipeline-gate-label">{gateStatusLabel(gate)}</span>
            </div>

            {/* Stats */}
            <div className="pipeline-stats">
              <span className="pipeline-stat" title="AGENT.md 호출 횟수">
                <span className="pipeline-stat-icon">📄</span>
                <span className="pipeline-stat-val">{agent.agentMdCallsTotal}</span>
              </span>
              <span className="pipeline-stat" title="작업 이벤트 누적 횟수">
                <span className="pipeline-stat-icon">🔁</span>
                <span className="pipeline-stat-val">{agent.usageCount}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
