export type RuntimeKind = "claude-jsonl";

export type RuntimeEventType =
  | "tool_start"
  | "tool_done"
  | "assistant_text"
  | "permission_wait"
  | "turn_waiting"
  | "turn_active";

export interface RawRuntimeEvent {
  runtime: RuntimeKind;
  agentRuntimeId: string;
  ts: number;
  type: RuntimeEventType;
  toolName?: string;
  toolId?: string;
  filePath?: string;
  detail?: string;
  isError?: boolean;
}
