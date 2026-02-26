import type { HookGateState } from "../../../shared/domain";
import type { RawRuntimeEvent } from "../../../shared/runtime";

export function deriveHookGateState(event: RawRuntimeEvent): HookGateState | null {
  if (event.type === "permission_wait") {
    return "blocked";
  }
  if (event.isError) {
    return "failed";
  }
  if (event.type === "tool_done") {
    return "closed";
  }
  if (event.type === "tool_start" || event.type === "turn_active") {
    return "open";
  }
  if (event.type === "turn_waiting") {
    return "closed";
  }
  return null;
}

export function deriveAgentState(event: RawRuntimeEvent): "active" | "waiting" | null {
  if (event.type === "tool_start" || event.type === "turn_active" || event.type === "assistant_text") {
    return "active";
  }

  if (event.type === "permission_wait" || event.type === "turn_waiting" || event.type === "tool_done") {
    return "waiting";
  }

  return null;
}
