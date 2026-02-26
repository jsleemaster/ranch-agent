import type { SkillKind } from "../../shared/domain";
import type { WebviewToExtMessage } from "../../shared/protocol";

const SKILL_VALUES = new Set<SkillKind>(["read", "edit", "write", "bash", "search", "task", "ask", "other"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function parseWebviewMessage(value: unknown): WebviewToExtMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "webview_ready":
      return { type: "webview_ready" };
    case "select_agent": {
      if (!isNullableString(value.agentId)) {
        return null;
      }
      return { type: "select_agent", agentId: value.agentId };
    }
    case "select_zone": {
      if (!isNullableString(value.zoneId)) {
        return null;
      }
      return { type: "select_zone", zoneId: value.zoneId };
    }
    case "select_skill": {
      if (value.skill === null) {
        return { type: "select_skill", skill: null };
      }
      if (typeof value.skill !== "string" || !SKILL_VALUES.has(value.skill as SkillKind)) {
        return null;
      }
      return { type: "select_skill", skill: value.skill as SkillKind };
    }
    default:
      return null;
  }
}
