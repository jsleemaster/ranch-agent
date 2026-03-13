import type { AgentSnapshot } from "@shared/domain";

export type RailSectionId = "ingress" | "idle" | "explore" | "maintain" | "execute" | "verify" | "report";
export type RailTrackId = "main-a" | "main-b" | "depot";

export interface RailSection {
  id: RailSectionId;
  label: string;
  glyph: string;
}

export const RAIL_SECTIONS: RailSection[] = [
  { id: "ingress", label: "입고", glyph: "▤" },
  { id: "idle", label: "대기", glyph: "◌" },
  { id: "explore", label: "탐색", glyph: "⌕" },
  { id: "maintain", label: "정비", glyph: "⚙" },
  { id: "execute", label: "실행", glyph: "▶" },
  { id: "verify", label: "검증", glyph: "✦" },
  { id: "report", label: "보고", glyph: "▣" }
];

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash);
}

export function railSectionForAgent(
  agent: Pick<AgentSnapshot, "state" | "currentHookGate" | "currentSkill">
): RailSectionId {
  if (agent.state === "completed") {
    return "report";
  }
  if (agent.currentHookGate === "failed" || agent.currentHookGate === "blocked") {
    return "verify";
  }
  if (agent.state === "waiting" && !agent.currentSkill) {
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
      return agent.state === "active" ? "ingress" : "idle";
  }
}

export function railSectionLabel(sectionId: RailSectionId): string {
  return RAIL_SECTIONS.find((section) => section.id === sectionId)?.label ?? "대기";
}

export function railSectionIndex(sectionId: RailSectionId): number {
  const index = RAIL_SECTIONS.findIndex((section) => section.id === sectionId);
  return index >= 0 ? index : 0;
}

export function railTrackForAgent(
  agent: Pick<AgentSnapshot, "agentId" | "runtimeRole" | "state" | "currentSkill">
): RailTrackId {
  if (agent.runtimeRole === "team" || agent.state === "completed" || (agent.state === "waiting" && !agent.currentSkill)) {
    return "depot";
  }
  if (agent.runtimeRole === "subagent") {
    return "main-b";
  }
  return hashText(agent.agentId) % 2 === 0 ? "main-a" : "main-b";
}

export function railTrackLabel(trackId: RailTrackId): string {
  switch (trackId) {
    case "main-b":
      return "본선 B";
    case "depot":
      return "회송선";
    default:
      return "본선 A";
  }
}

export function railStatusLabel(agent: Pick<AgentSnapshot, "state" | "currentHookGate">): string {
  if (agent.state === "completed") {
    return "종점";
  }
  switch (agent.currentHookGate) {
    case "open":
      return "운행 중";
    case "blocked":
      return "신호 대기";
    case "failed":
      return "검증 중";
    case "closed":
      return agent.state === "waiting" ? "대기" : "정차";
    default:
      return agent.state === "active" ? "운행 중" : "대기";
  }
}

