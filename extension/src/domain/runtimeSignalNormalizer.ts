import type { RuntimeSignalKind } from "../../../shared/domain";
import type { RawRuntimeEvent } from "../../../shared/runtime";
import { normalizeSkill } from "./skillNormalizer";

const TRACKED_EVENT_TYPES = new Set<RawRuntimeEvent["type"]>(["assistant_text", "tool_start", "tool_done"]);
const ORCHESTRATION_TOOL_NAMES = new Set(["agent", "taskoutput", "exitplanmode"]);

export const RUNTIME_SIGNAL_LABELS: Record<RuntimeSignalKind, string> = {
  orchestration_signal: "운행 조정",
  unknown_tool_signal: "외부 설비",
  tool_name_missing_signal: "신호 누락",
  assistant_reply_signal: "운행 안내"
};

function normalizeToolName(toolName: string | undefined): string | null {
  if (!toolName) {
    return null;
  }
  const normalized = toolName.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function classifyRuntimeSignal(event: RawRuntimeEvent): RuntimeSignalKind | null {
  if (!TRACKED_EVENT_TYPES.has(event.type)) {
    return null;
  }

  const toolName = normalizeToolName(event.toolName);
  if (!toolName) {
    if (event.type === "assistant_text") {
      return "assistant_reply_signal";
    }
    return "tool_name_missing_signal";
  }

  const mappedSkill = normalizeSkill(toolName);
  if (mappedSkill && mappedSkill !== "other") {
    return null;
  }

  if (ORCHESTRATION_TOOL_NAMES.has(toolName)) {
    return "orchestration_signal";
  }

  return "unknown_tool_signal";
}
