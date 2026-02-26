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
  workingDir?: string;
  branchName?: string | null;
  isMainBranch?: boolean;
  mainBranchRisk?: boolean;
  invokedAgentHint?: string | null;
  invokedAgentMdId?: string | null;
  detail?: string;
  isError?: boolean;
}
