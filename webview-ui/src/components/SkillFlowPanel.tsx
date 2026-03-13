import React, { useMemo } from "react";

import type {
  AgentSnapshot,
  FeedEvent,
  RuntimeSignalMetricSnapshot,
  SkillMetricSnapshot,
  StatuslineBudgetSnapshot
} from "@shared/domain";
import {
  latestAgentNarrative,
  workspaceAvatarTone,
  workspaceInitials,
  workspaceRoleLabel,
  workspaceSkillLabel,
  workspaceSignalSummary,
  workspaceStageProgress,
  workspaceStateLabel,
  WORKSPACE_STAGES,
  type WorkspaceStageId
} from "../world/workspaceStages";

interface SkillFlowPanelProps {
  agents: AgentSnapshot[];
  skillMetrics: SkillMetricSnapshot[];
  signalMetrics: RuntimeSignalMetricSnapshot[];
  budgets: StatuslineBudgetSnapshot[];
  feed: FeedEvent[];
  stableStages: Record<string, WorkspaceStageId>;
}

function formatCompact(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return Math.round(value).toString();
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
  feed,
  stableStages
}: SkillFlowPanelProps): JSX.Element {
  const signalSummary = useMemo(() => workspaceSignalSummary(signalMetrics), [signalMetrics]);
  const budgetByLineage = useMemo(() => new Map(budgets.map((budget) => [budget.lineageId, budget])), [budgets]);
  const activeAgents = useMemo(() => {
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

    return [...agents]
      .filter((agent) => agent.state !== "completed" || agent.totalTokensTotal || agent.usageCount)
      .sort((a, b) => {
        return (
          roleRank(a.runtimeRole) - roleRank(b.runtimeRole) ||
          a.displayShortName.localeCompare(b.displayShortName, "ko") ||
          a.rawShortId.localeCompare(b.rawShortId, "en")
        );
      });
  }, [agents]);

  const columns = useMemo(() => {
    return WORKSPACE_STAGES.map((stage) => ({
      ...stage,
      items: activeAgents.filter((agent) => (stableStages[agent.agentId] ?? "kickoff") === stage.id)
    }));
  }, [activeAgents, stableStages]);

  return (
    <div className="workspace-board">
      <div className="workspace-panel-header workbench-header">
        <div>
          <h3 className="workspace-panel-title">작업 단계</h3>
          <p className="workspace-panel-subtitle">작업이 지금 어디까지 왔는지 단계별로 보여줍니다.</p>
        </div>
        <div className="workbench-signal-row">
          {signalSummary.map((chip) => (
            <span key={chip.key} className={`workspace-chip ${chip.tone}`}>
              {chip.label} {chip.value}건
            </span>
          ))}
        </div>
      </div>

      <div className="workbench-scroll">
        <div className="workbench-columns">
          {columns.map((column) => (
            <section key={column.id} className="workbench-column">
              <div className="workbench-column-head">
                <div>
                  <div className="workbench-column-title-row">
                    <span className={`workbench-column-dot ${column.accentClass}`} />
                    <h4 className="workbench-column-title">{column.label}</h4>
                    <span className="workbench-column-count">{column.items.length}</span>
                  </div>
                  <p className="workbench-column-subtitle">{column.subtitle}</p>
                </div>
              </div>

              <div className="workbench-column-body">
                {column.items.length === 0 ? (
                  <div className="workbench-empty-card">지금은 이 단계에 있는 작업이 없습니다.</div>
                ) : (
                  column.items.map((agent) => {
                    const budget = agent.runtimeRole === "main" ? budgetByLineage.get(agent.agentId) : undefined;
                    const progress = workspaceStageProgress(agent);
                    const narrative = latestAgentNarrative(agent, feed);
                    const tokenLabel = formatCompact(agent.totalTokensTotal);
                    const sessionLabel = formatCompact(budget?.sessionTokensTotal);
                    const costLabel = formatUsd(budget?.costUsd);

                    return (
                      <article key={agent.agentId} className="workbench-card">
                        <div className="workbench-card-head">
                          <div className={`workbench-avatar ${workspaceAvatarTone(agent)}`}>
                            {workspaceInitials(agent.displayName)}
                          </div>
                          <div className="workbench-card-titleblock">
                            <div className="workbench-card-titleline">
                              <span className="workbench-card-title">{agent.displayShortName}</span>
                              <span className={`workbench-card-role role-${agent.runtimeRole}`}>{workspaceRoleLabel(agent.runtimeRole)}</span>
                            </div>
                            <p className="workbench-card-subtitle">{workspaceStateLabel(agent)}</p>
                          </div>
                        </div>

                        <p className="workbench-card-copy">{narrative}</p>

                        <div className="workbench-progress-meta">
                          <span>{agent.currentSkill ? `${workspaceSkillLabel(agent.currentSkill)} 진행` : "다음 작업 준비"}</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="workbench-progress-track">
                          <div className="workbench-progress-fill" style={{ width: `${progress}%` }} />
                        </div>

                        <div className="workbench-card-footer">
                          {tokenLabel ? <span className="workspace-chip tone-primary">총 사용량 {tokenLabel}</span> : null}
                          {sessionLabel ? <span className="workspace-chip tone-info">현재 대화 {sessionLabel}</span> : null}
                          {costLabel ? <span className="workspace-chip tone-muted">사용 비용 {costLabel}</span> : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
