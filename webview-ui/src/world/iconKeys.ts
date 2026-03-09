import type { AgentSnapshot, GrowthStage, HookGateState, SkillKind } from "@shared/domain";
import type { WebviewAssetCatalog } from "@shared/assets";

const SKILL_EMOJI: Record<SkillKind, string> = {
  read: "📖",
  edit: "✏️",
  write: "🧱",
  bash: "🛠️",
  search: "🔎",
  task: "📦",
  ask: "❓",
  other: "🧩"
};

const GATE_EMOJI: Record<HookGateState, string> = {
  open: "🟢",
  blocked: "🟡",
  failed: "🔴",
  closed: "⚪"
};

const ZONE_EMOJI: Record<string, string> = {
  src: "🔎",
  apps: "🚆",
  packages: "🔀",
  infra: "🛠️",
  scripts: "🧪",
  docs: "📝",
  tests: "✅",
  etc: "🚉"
};

const ZONE_LABELS: Record<string, string> = {
  src: "탐색역",
  apps: "본선 승강장",
  packages: "환승 구간",
  infra: "정비고",
  scripts: "시험선",
  docs: "보고실",
  tests: "검수선",
  etc: "대합실"
};

const TEAM_EMOJI_BY_ICON: Record<string, string> = {
  team_default: "🚆",
  team_solo: "🚈"
};

const TEAM_EMOJI_VARIANTS: Record<string, readonly string[]> = {
  team_default: ["🚆", "🚇", "🚄", "🚉"],
  team_solo: ["🚈", "🚊", "🚄", "🚇"]
};

const GROWTH_EMOJI_BY_STAGE: Record<GrowthStage, string> = {
  seed: "일",
  sprout: "준",
  grow: "급",
  harvest: "특"
};

function hashText(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = Math.imul(31, h) + value.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

export function skillIconKey(skill: SkillKind | null): string {
  return `skill_${skill ?? "other"}`;
}

export function gateIconKey(gate: HookGateState | null): string {
  return `gate_${gate ?? "closed"}`;
}

export function zoneIconKey(zoneId: string | null): string {
  return `zone_${zoneId ?? "etc"}`;
}

export function teamIconKey(agent: AgentSnapshot): string {
  return agent.icon || "team_default";
}

export function iconUrl(catalog: WebviewAssetCatalog, key: string): string | undefined {
  if (catalog.source === "placeholder-pack" || catalog.source === "primitive") {
    return undefined;
  }
  return catalog.icons[key];
}

export function spriteUrl(catalog: WebviewAssetCatalog, state: AgentSnapshot["state"]): string | undefined {
  if (catalog.source === "placeholder-pack" || catalog.source === "primitive") {
    return undefined;
  }
  return catalog.sprites[state === "active" ? "agent_active" : "agent_idle"];
}

export function tileUrl(catalog: WebviewAssetCatalog, zoneId: string): string | undefined {
  if (catalog.source === "placeholder-pack" || catalog.source === "primitive") {
    return undefined;
  }
  return catalog.tiles[`zone_${zoneId}`];
}

export function teamEmoji(agent: AgentSnapshot): string {
  return TEAM_EMOJI_BY_ICON[teamIconKey(agent)] ?? TEAM_EMOJI_BY_ICON.team_default;
}

export function agentAvatarEmoji(agent: AgentSnapshot): string {
  const iconKey = teamIconKey(agent);
  const variants = TEAM_EMOJI_VARIANTS[iconKey] ?? TEAM_EMOJI_VARIANTS.team_default;
  const idx = hashText(agent.agentId || iconKey) % variants.length;
  return variants[idx] ?? teamEmoji(agent);
}

export function skillEmoji(skill: SkillKind | null): string {
  if (!skill) {
    return SKILL_EMOJI.other;
  }
  return SKILL_EMOJI[skill] ?? SKILL_EMOJI.other;
}

export function gateEmoji(gate: HookGateState | null): string {
  if (!gate) {
    return GATE_EMOJI.closed;
  }
  return GATE_EMOJI[gate] ?? GATE_EMOJI.closed;
}

export function zoneEmoji(zoneId: string | null): string {
  if (!zoneId) {
    return ZONE_EMOJI.etc;
  }
  return ZONE_EMOJI[zoneId] ?? ZONE_EMOJI.etc;
}

export function zoneLabel(zoneId: string | null): string {
  if (!zoneId) {
    return "미지정";
  }
  return ZONE_LABELS[zoneId] ?? zoneId;
}

export function growthEmoji(stage: GrowthStage | null | undefined): string {
  if (!stage) {
    return GROWTH_EMOJI_BY_STAGE.seed;
  }
  return GROWTH_EMOJI_BY_STAGE[stage] ?? GROWTH_EMOJI_BY_STAGE.seed;
}
