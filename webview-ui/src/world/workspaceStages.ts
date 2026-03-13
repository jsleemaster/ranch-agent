import type { AgentRuntimeRole, AgentSnapshot, FeedEvent, RuntimeSignalMetricSnapshot } from "@shared/domain";

export type WorkspaceStageId = "kickoff" | "development" | "review" | "delivery";

export interface WorkspaceStageDefinition {
  id: WorkspaceStageId;
  label: string;
  subtitle: string;
  accentClass: string;
}

export const WORKSPACE_STAGES: WorkspaceStageDefinition[] = [
  { id: "kickoff", label: "준비", subtitle: "자료와 요청을 먼저 확인합니다", accentClass: "stage-kickoff" },
  { id: "development", label: "진행", subtitle: "수정과 실행이 실제로 이뤄집니다", accentClass: "stage-development" },
  { id: "review", label: "확인", subtitle: "막힌 부분과 남은 문제를 살핍니다", accentClass: "stage-review" },
  { id: "delivery", label: "마무리", subtitle: "결과를 정리하고 끝냅니다", accentClass: "stage-delivery" }
];

export function workspaceStageRank(stageId: WorkspaceStageId): number {
  switch (stageId) {
    case "kickoff":
      return 0;
    case "development":
      return 1;
    case "review":
      return 2;
    case "delivery":
      return 3;
    default:
      return 0;
  }
}

export function workspaceRoleLabel(role: AgentRuntimeRole): string {
  switch (role) {
    case "subagent":
      return "보조";
    case "team":
      return "공동";
    default:
      return "메인";
  }
}

export function workspaceRoleTone(role: AgentRuntimeRole): string {
  switch (role) {
    case "subagent":
      return "role-support";
    case "team":
      return "role-team";
    default:
      return "role-lead";
  }
}

export function workspaceStateLabel(agent: AgentSnapshot): string {
  if (agent.state === "completed") {
    return "끝남";
  }
  if (agent.currentHookGate === "failed") {
    return "확인 필요";
  }
  if (agent.currentHookGate === "blocked") {
    return "확인 대기";
  }
  if (agent.state === "active") {
    return "작업 중";
  }
  return "잠시 멈춤";
}

export function workspaceSkillLabel(skill: AgentSnapshot["currentSkill"]): string {
  switch (skill) {
    case "read":
      return "읽기";
    case "search":
      return "탐색";
    case "edit":
      return "수정";
    case "write":
      return "작성";
    case "bash":
      return "실행";
    case "task":
      return "분배";
    case "ask":
      return "확인 요청";
    case "other":
      return "기타 작업";
    default:
      return "준비 중";
  }
}

export function workspaceHookGateLabel(hookGate: AgentSnapshot["currentHookGate"]): string | null {
  switch (hookGate) {
    case "open":
      return "작업 중";
    case "blocked":
      return "확인 대기";
    case "failed":
      return "문제";
    case "closed":
      return "끝남";
    default:
      return null;
  }
}

export function workspaceStageForAgent(agent: AgentSnapshot): WorkspaceStageId {
  if (agent.state === "completed" || agent.currentHookGate === "closed") {
    return "delivery";
  }
  if (agent.currentHookGate === "blocked" || agent.currentHookGate === "failed" || agent.currentSkill === "ask" || agent.currentSkill === "other") {
    return "review";
  }
  if (
    agent.currentSkill === "edit" ||
    agent.currentSkill === "write" ||
    agent.currentSkill === "bash" ||
    agent.currentSkill === "task"
  ) {
    return "development";
  }
  return "kickoff";
}

export function workspaceStageProgress(agent: AgentSnapshot): number {
  if (agent.state === "completed") {
    return 100;
  }
  switch (workspaceStageForAgent(agent)) {
    case "kickoff":
      return agent.currentSkill === "search" || agent.currentSkill === "read" ? 28 : 12;
    case "development":
      return agent.currentSkill === "bash" || agent.currentSkill === "task" ? 72 : 56;
    case "review":
      return agent.currentHookGate === "failed" ? 88 : 82;
    case "delivery":
      return 100;
    default:
      return 0;
  }
}

export function workspaceInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "AI";
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  const compact = trimmed.replace(/[^\p{L}\p{N}]/gu, "");
  return compact.slice(0, 2).toUpperCase();
}

export function workspaceAvatarTone(agent: AgentSnapshot): string {
  const roleTone = workspaceRoleTone(agent.runtimeRole);
  if (agent.state === "completed") {
    return `${roleTone} avatar-completed`;
  }
  if (agent.currentHookGate === "failed") {
    return `${roleTone} avatar-alert`;
  }
  return roleTone;
}

export function latestAgentNarrative(agent: AgentSnapshot, events: FeedEvent[]): string {
  const latest = events
    .filter((event) => event.agentId === agent.agentId && typeof event.text === "string" && event.text.trim().length > 0)
    .sort((a, b) => b.ts - a.ts)[0];

  if (latest?.text) {
    const normalized = latest.text.replace(/\s+/g, " ").trim();
    return normalized.length > 88 ? `${normalized.slice(0, 87).trimEnd()}…` : normalized;
  }

  switch (workspaceStageForAgent(agent)) {
    case "kickoff":
      return "무엇을 해야 하는지 먼저 확인하고 있습니다.";
    case "development":
      return "실제 변경을 만들고 바로 쓸 수 있게 정리하고 있습니다.";
    case "review":
      return agent.currentHookGate === "blocked"
        ? "다음 확인이나 입력을 기다리고 있습니다."
        : "결과를 다시 보고 남은 문제를 확인하고 있습니다.";
    case "delivery":
      return "이번 작업에서 맡은 내용을 정리했습니다.";
    default:
      return "현재 상태를 모으는 중입니다.";
  }
}

export function workspaceSignalSummary(signalMetrics: RuntimeSignalMetricSnapshot[]): Array<{ key: string; label: string; value: number; tone: string }> {
  const byKind = new Map(signalMetrics.map((metric) => [metric.signal, metric.usageCount]));
  const entries = [
    {
      key: "orchestration",
      label: "흐름 변경",
      value: byKind.get("orchestration_signal") ?? 0,
      tone: "tone-primary"
    },
    {
      key: "unknown",
      label: "새 작업",
      value: byKind.get("unknown_tool_signal") ?? 0,
      tone: "tone-warning"
    },
    {
      key: "missing",
      label: "정보 비어 있음",
      value: byKind.get("tool_name_missing_signal") ?? 0,
      tone: "tone-muted"
    },
    {
      key: "assistant",
      label: "진행 보고",
      value: byKind.get("assistant_reply_signal") ?? 0,
      tone: "tone-success"
    }
  ];

  const nonZero = entries.filter((entry) => entry.value > 0);
  return nonZero.length > 0 ? nonZero : [{ key: "idle", label: "새 알림 없음", value: 0, tone: "tone-muted" }];
}
