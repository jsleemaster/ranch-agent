import React, { useMemo } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type {
  AgentSnapshot,
  RuntimeSignalMetricSnapshot,
  SkillMetricSnapshot,
  StatuslineBudgetSnapshot
} from "@shared/domain";
import {
  agentAvatarEmoji,
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
  signalMetrics: RuntimeSignalMetricSnapshot[];
  budgets: StatuslineBudgetSnapshot[];
  assets: WebviewAssetCatalog;
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

export function gateStatusLabel(
  gate: AgentSnapshot["currentHookGate"],
  agentState?: AgentSnapshot["state"]
): string {
  switch (gate) {
    case "open": return "운행 중";
    case "blocked": return "신호 대기";
    case "failed": return "장애";
    case "closed": return agentState === "completed" ? "종점" : "정차";
    default: return "정차";
  }
}

export function growthLabel(stage: AgentSnapshot["growthStage"]): string {
  switch (stage) {
    case "seed": return "일반";
    case "sprout": return "준급";
    case "grow": return "급행";
    case "harvest": return "특급";
    default: return "일반";
  }
}

export function skillLabel(skill: string | null): string {
  if (!skill) return "—";
  const labels: Record<string, string> = {
    read: "탐색",
    edit: "정비",
    write: "정비",
    bash: "운행",
    search: "탐색",
    task: "배차",
    ask: "보고",
    other: "기타"
  };
  return labels[skill] ?? skill;
}

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

function shortId(id: string): string {
  if (id.length <= 12) return id;
  if (id.startsWith("agent-") && id.length > 12) {
    return `agent-${id.slice(6, 12)}`;
  }
  const dash = id.indexOf("-");
  if (dash > 0 && dash <= 10 && !id.startsWith("agent-")) return id.slice(0, dash);
  return id.slice(0, 10) + "…";
}

function xpPercent(growthLevelUsage: number): number {
  if (growthLevelUsage <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((growthLevelUsage / 34) * 100));
}

function formatCompactNumber(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
}

function formatPercent(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return `${Math.round(value)}%`;
}

function formatUsd(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 100) {
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${value.toFixed(3)}`;
}

export default function SkillFlowPanel({
  agents,
  skillMetrics: _skillMetrics,
  signalMetrics,
  budgets,
  assets
}: SkillFlowPanelProps): JSX.Element {
  const signalSummary = useMemo(() => {
    const byKind = new Map(signalMetrics.map((metric) => [metric.signal, metric.usageCount]));
    return {
      orchestration: byKind.get("orchestration_signal") ?? 0,
      unknown: byKind.get("unknown_tool_signal") ?? 0,
      missing: byKind.get("tool_name_missing_signal") ?? 0,
      assistant: byKind.get("assistant_reply_signal") ?? 0
    };
  }, [signalMetrics]);
  const signalChips = useMemo(() => {
    const chips = [
      {
        key: "orchestration",
        className: "signal-chip",
        title: "에이전트가 내부적으로 작업을 넘기거나 정리한 운행 조정 횟수",
        label: "운행 조정",
        value: signalSummary.orchestration
      },
      {
        key: "unknown",
        className: "signal-chip warn",
        title: "아직 분류표에 없는 외부 설비 사용 횟수",
        label: "외부 설비",
        value: signalSummary.unknown
      },
      {
        key: "missing",
        className: "signal-chip muted",
        title: "설비 이름 같은 핵심 신호가 비어 들어온 횟수",
        label: "신호 누락",
        value: signalSummary.missing
      },
      {
        key: "assistant",
        className: "signal-chip info",
        title: "설비 실행 없이 들어온 일반 진행 보고 횟수",
        label: "운행 안내",
        value: signalSummary.assistant
      }
    ];
    const nonZero = chips.filter((chip) => chip.value > 0);
    return nonZero.length > 0
      ? nonZero
      : [
          {
            key: "idle",
            className: "signal-chip muted",
            title: "신호 이벤트가 아직 없습니다",
            label: "신호 없음",
            value: 0
          }
        ];
  }, [signalSummary]);

  const rows = useMemo(() => {
    return agents
      .filter(a => a.state === "active" || a.usageCount > 0)
      .sort((a, b) => b.lastEventTs - a.lastEventTs)
      .slice(0, MAX_VISIBLE);
  }, [agents]);
  const budgetByLineage = useMemo(() => {
    return new Map(budgets.map((budget) => [budget.lineageId, budget]));
  }, [budgets]);

  return (
    <div className="panel-body pipeline-board">
      <div className="signal-summary-bar">
        {signalChips.map((chip) => (
          <span key={chip.key} className={chip.className} title={chip.title}>
            {chip.label} {chip.value}건
          </span>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="pipeline-empty">
          <div className="pipeline-empty-icon">⚡</div>
          <div className="pipeline-empty-text">편성 진입 대기 중</div>
          <div className="pipeline-empty-sub">운행 데이터가 들어오면 실시간으로 표시됩니다</div>
        </div>
      )}

      {rows.map((agent) => {
        const skill = agent.currentSkill;
        const gate = agent.currentHookGate;
        const agentSkillCount = skill ? (agent.skillUsageByKind[skill] ?? 0) : 0;
        const teamIcon = iconUrl(assets, teamIconKey(agent));
        const skillIcon = iconUrl(assets, skillIconKey(skill));
        const xp = xpPercent(agent.growthLevelUsage);
        const budget = agent.runtimeRole === "main" ? budgetByLineage.get(agent.agentId) : undefined;
        const budgetChips = [
          budget?.contextPercent != null
            ? { key: "ctx", label: `점유율 ${formatPercent(budget.contextPercent)}` }
            : null,
          budget?.sessionTokensTotal != null
            ? { key: "session", label: `회차 ${formatCompactNumber(budget.sessionTokensTotal)}` }
            : null,
          budget?.costUsd != null
            ? { key: "cost", label: `운영비 ${formatUsd(budget.costUsd)}` }
            : null
        ].filter((chip): chip is { key: string; label: string } => !!chip);

        return (
          <div
            key={agent.agentId}
            className={`pipeline-row ${agent.state} growth-${agent.growthStage}`}
          >
            {/* Agent Avatar */}
            <div className="pipeline-avatar">
              <IconToken
                src={teamIcon}
                fallback={agentAvatarEmoji(agent) || teamEmoji(agent)}
                title={agent.agentId}
                className="pipeline-avatar-icon"
                autoTrim={true}
                maxAutoScale={7}
                minAutoScale={3}
              />
              {agent.state === "active" && <div className="pipeline-pulse" />}
            </div>

            {/* Agent Info */}
            <div className="pipeline-info">
              <div className="pipeline-name">
                <span className="pipeline-id">{shortId(agent.agentId)}</span>
                <span className={`pipeline-role role-${agent.runtimeRole}`}>{runtimeRoleLabel(agent.runtimeRole)}</span>
                {agent.state === "completed" && <span className="pipeline-status completed">종점</span>}
              </div>
              <div className="pipeline-xp-bar">
                <div
                  className={`pipeline-xp-fill growth-${agent.growthStage}`}
                  style={{ width: `${xp}%` }}
                />
                <span
                  className="pipeline-xp-label"
                  title={`등급 진행도: ${agent.growthLevelUsage}/35 · 등급 ${growthLabel(agent.growthStage)}`}
                >
                  {growthLabel(agent.growthStage)} {agent.growthLevelUsage}/35
                </span>
              </div>
              {budgetChips.length > 0 ? (
                <div className="pipeline-budget-strip">
                  {budgetChips.map((chip) => (
                    <span key={chip.key} className="pipeline-budget-chip">
                      {chip.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Skill Stage */}
            <div
              className={`pipeline-stage stage-skill ${skill ? "" : "inactive"}`}
            >
              <IconToken
                src={skillIcon}
                fallback={skillEmoji(skill)}
                title={`운행 단계: ${skillLabel(skill)}`}
                className="pipeline-stage-icon"
              />
              <span className="pipeline-stage-label">{skillLabel(skill)}</span>
              {agentSkillCount > 0 && (
                <span className="pipeline-stage-count" title={`해당 편성의 '${skillLabel(skill)}' 누적 횟수`}>
                  {agentSkillCount}회
                </span>
              )}
            </div>

            {/* Gate Status */}
            <div className={`pipeline-gate ${gateStatusClass(gate)}`}>
              <div className="pipeline-gate-orb" />
              <span className="pipeline-gate-label">{gateStatusLabel(gate, agent.state)}</span>
            </div>

            {/* Stats */}
            <div className="pipeline-stats">
              <span className="pipeline-stat" title="배치 지침 호출 횟수">
                <span className="pipeline-stat-icon">📄</span>
                <span className="pipeline-stat-val">{agent.agentMdCallsTotal}</span>
              </span>
              <span className="pipeline-stat" title="누적 운행 이벤트 횟수">
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
