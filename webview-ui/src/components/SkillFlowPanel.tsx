import React, { useMemo } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, FilterState, GrowthStage, SkillKind, SkillMetricSnapshot } from "@shared/domain";
import {
  gateEmoji,
  gateIconKey,
  iconUrl,
  skillEmoji,
  skillIconKey,
  teamEmoji,
  teamIconKey
} from "../world/iconKeys";

interface SkillFlowPanelProps {
  agents: AgentSnapshot[];
  skillMetrics: SkillMetricSnapshot[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectAgent: (agentId: string | null) => void;
  onSelectSkill: (skill: SkillKind | null) => void;
}

const MAX_VISIBLE_ROWS = 28;

interface NodeProps {
  x: number;
  y: number;
  size: number;
  imageUrl?: string;
  fallbackColor: string;
  fallbackEmoji: string;
  stage?: GrowthStage;
  usageCount?: number;
  selected: boolean;
  title: string;
  onClick?: () => void;
}

function Node({
  x,
  y,
  size,
  imageUrl,
  fallbackColor,
  fallbackEmoji,
  stage,
  usageCount,
  selected,
  title,
  onClick
}: NodeProps): JSX.Element {
  return (
    <g
      transform={`translate(${x - size / 2}, ${y - size / 2})`}
      onClick={onClick}
      className={`flow-node ${stage ? `stage-${stage}` : ""}`.trim()}
      role="button"
      tabIndex={0}
    >
      {imageUrl ? (
        <image href={imageUrl} width={size} height={size} />
      ) : (
        <>
          <rect width={size} height={size} rx={8} fill={fallbackColor} />
          <text className="flow-node-emoji" x={size / 2} y={size / 2 + 5} textAnchor="middle">
            {fallbackEmoji}
          </text>
        </>
      )}

      {selected ? <rect width={size} height={size} rx={8} fill="none" stroke="#FFE16E" strokeWidth={2} /> : null}
      {typeof usageCount === "number" ? (
        <text className="flow-node-usage" x={size - 1} y={size - 2} textAnchor="end">
          {Math.min(99, usageCount)}
        </text>
      ) : null}
      <title>{title}</title>
    </g>
  );
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

export default function SkillFlowPanel({
  agents,
  skillMetrics,
  filter,
  assets,
  onSelectAgent,
  onSelectSkill
}: SkillFlowPanelProps): JSX.Element {
  const rows = useMemo(() => {
    return [...agents].sort((a, b) => b.lastEventTs - a.lastEventTs).slice(0, MAX_VISIBLE_ROWS);
  }, [agents]);
  const hiddenCount = Math.max(0, agents.length - rows.length);
  const rowHeight = 52;
  const baseHeight = 26;
  const width = 340;
  const height = Math.max(140, baseHeight + rows.length * rowHeight);

  const skillMetricByKind = useMemo(() => {
    return new Map(skillMetrics.map((metric) => [metric.skill, metric]));
  }, [skillMetrics]);

  return (
    <div className="panel-body skill-flow-panel">
      <div className="skill-flow-wrap">
        <svg
          className="skill-flow"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ height: `${height}px` }}
        >
        {rows.map((agent, index) => {
          const y = baseHeight + index * rowHeight;
          const skill = agent.currentSkill;
          const gate = agent.currentHookGate;
          const matched = matchesAgent(agent, filter);
          const skillMetric = skill ? skillMetricByKind.get(skill) : undefined;

          const agentSelected = filter.selectedAgentId === agent.agentId;
          const skillSelected = filter.selectedSkill !== null && filter.selectedSkill === skill;

          const teamUrl = iconUrl(assets, teamIconKey(agent));
          const skillUrl = iconUrl(assets, skillIconKey(skill));
          const gateUrl = iconUrl(assets, gateIconKey(gate));

          return (
            <g key={agent.agentId} className={matched ? "" : "flow-row-muted"}>
              <line className="flow-link" x1={58} y1={y} x2={148} y2={y} stroke="#497B7A" strokeWidth={2} opacity={0.8} />
              <line className="flow-link" x1={176} y1={y} x2={266} y2={y} stroke="#77603A" strokeWidth={2} opacity={0.8} />

              <Node
                x={42}
                y={y}
                size={30}
                imageUrl={teamUrl}
                fallbackColor="#4A6E52"
                fallbackEmoji={teamEmoji(agent)}
                stage={agent.growthStage}
                usageCount={agent.usageCount}
                selected={agentSelected}
                title={`agent: ${agent.agentId} | growth: ${agent.growthStage} | usage: ${agent.usageCount}`}
                onClick={() => onSelectAgent(agentSelected ? null : agent.agentId)}
              />

              <Node
                x={162}
                y={y}
                size={30}
                imageUrl={skillUrl}
                fallbackColor="#5A6A3E"
                fallbackEmoji={skillEmoji(skill)}
                stage={skillMetric?.growthStage ?? "seed"}
                usageCount={skillMetric?.usageCount ?? 0}
                selected={skillSelected}
                title={`skill: ${skill ?? "none"} | usage: ${skillMetric?.usageCount ?? 0}`}
                onClick={() => onSelectSkill(skillSelected ? null : skill)}
              />

              <Node
                x={282}
                y={y}
                size={30}
                imageUrl={gateUrl}
                fallbackColor="#6B5A4B"
                fallbackEmoji={gateEmoji(gate)}
                selected={false}
                title={`gate: ${gate ?? "none"}`}
              />
            </g>
          );
        })}
        </svg>
      </div>
      {hiddenCount > 0 ? <div className="flow-note">최근 {rows.length}명 표시 · 나머지 {hiddenCount}명 숨김</div> : null}
    </div>
  );
}
