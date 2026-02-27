import React, { useMemo } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, FilterState, SkillKind, SkillMetricSnapshot } from "@shared/domain";
import {
  gateEmoji,
  growthEmoji,
  iconUrl,
  skillEmoji,
  skillIconKey,
  teamEmoji,
  teamIconKey,
  zoneEmoji,
  zoneLabel
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

function shortId(id: string): string {
  if (id.length <= 12) return id;
  const dash = id.indexOf("-");
  if (dash > 0 && dash <= 10) return id.slice(0, dash);
  return id.slice(0, 10) + "…";
}

function xpPercent(stage: AgentSnapshot["growthStage"]): number {
  switch (stage) {
    case "seed": return 10;
    case "sprout": return 35;
    case "grow": return 65;
    case "harvest": return 100;
    default: return 0;
  }
}

function formatTokens(n: number | undefined): string {
  if (!n) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function SkillFlowPanel({
  agents,
  skillMetrics,
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

  const skillMap = useMemo(() => {
    return new Map(skillMetrics.map(s => [s.skill, s]));
  }, [skillMetrics]);

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
        const metric = skill ? skillMap.get(skill) : undefined;
        const teamIcon = iconUrl(assets, teamIconKey(agent));
        const skillIcon = iconUrl(assets, skillIconKey(skill));
        const xp = xpPercent(agent.growthStage);

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
                fallback={teamEmoji(agent)}
                title={agent.agentId}
                className="pipeline-avatar-icon"
              />
              {agent.state === "active" && <div className="pipeline-pulse" />}
            </div>

            {/* Agent Info */}
            <div className="pipeline-info">
              <div className="pipeline-name">{shortId(agent.agentId)}</div>
              <div className="pipeline-xp-bar">
                <div
                  className={`pipeline-xp-fill growth-${agent.growthStage}`}
                  style={{ width: `${xp}%` }}
                />
                <span className="pipeline-xp-label">{growthEmoji(agent.growthStage)} {growthLabel(agent.growthStage)}</span>
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
              {metric && metric.usageCount > 0 && (
                <span className="pipeline-stage-count">{metric.usageCount}</span>
              )}
            </div>

            {/* Flow Arrow */}
            <div className="pipeline-arrow">
              <div className={`pipeline-arrow-line ${agent.state}`} />
              <div className={`pipeline-arrow-dot ${agent.state}`} />
            </div>

            {/* Gate Status */}
            <div className={`pipeline-gate ${gateStatusClass(gate)}`}>
              <div className="pipeline-gate-orb" />
              <span className="pipeline-gate-label">{gateStatusLabel(gate)}</span>
            </div>

            {/* Flow Arrow */}
            <div className="pipeline-arrow">
              <div className={`pipeline-arrow-line ${agent.state}`} />
              <div className={`pipeline-arrow-dot ${agent.state}`} />
            </div>

            {/* Zone */}
            <div className="pipeline-zone">
              <span className="pipeline-zone-icon">{zoneEmoji(agent.currentZoneId)}</span>
              <span className="pipeline-zone-label">{zoneLabel(agent.currentZoneId)}</span>
            </div>

            {/* Token Meter (사료 바) */}
            <div className="pipeline-token-meter" title={`투입 사료: ${(agent.promptTokensTotal ?? 0).toLocaleString()} / 산출물: ${(agent.completionTokensTotal ?? 0).toLocaleString()}`}>
              <div className="token-bar">
                {(() => {
                  const total = (agent.totalTokensTotal ?? 0);
                  const prompt = (agent.promptTokensTotal ?? 0);
                  const completion = (agent.completionTokensTotal ?? 0);
                  if (total === 0) return <div className="token-fill-empty" />;
                  const pRatio = `${(prompt / total * 100).toFixed(0)}%`;
                  const cRatio = `${(completion / total * 100).toFixed(0)}%`;
                  return (
                    <>
                      <div className="token-fill prompt" style={{ width: pRatio }} />
                      <div className="token-fill completion" style={{ width: cRatio }} />
                    </>
                  );
                })()}
              </div>
              <span className="token-total">🌾 {formatTokens(agent.totalTokensTotal)}</span>
            </div>

            {/* Stats */}
            <div className="pipeline-stats">
              <span className="pipeline-stat" title="에이전트 로직 호출 횟수">
                <span className="pipeline-stat-icon">🧠</span>
                <span className="pipeline-stat-val">{agent.agentMdCallsTotal}</span>
              </span>
              <span className="pipeline-stat" title="총 작업 수행 횟수">
                <span className="pipeline-stat-icon">⚔️</span>
                <span className="pipeline-stat-val">{agent.usageCount}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
