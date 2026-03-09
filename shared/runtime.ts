export type RuntimeKind = "claude-jsonl" | "claude-http-hook";

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
  sessionRuntimeId?: string | null;
  ts: number;
  type: RuntimeEventType;
  ingestSource?: "jsonl" | "http";
  sourcePath?: string;
  hookEventName?: string;
  hookMatcher?: string;
  hookSessionId?: string;
  hookDecision?: string | null;
  hookSourceUrl?: string;
  toolName?: string;
  toolId?: string;
  filePath?: string;
  workingDir?: string;
  branchName?: string | null;
  isMainBranch?: boolean;
  mainBranchRisk?: boolean;
  invokedAgentHint?: string | null;
  invokedAgentMdId?: string | null;
  invokedSkillHint?: string | null;
  invokedSkillMdId?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  detail?: string;
  isError?: boolean;
}

export interface StatuslineRawSnapshot {
  ts: number;
  sessionRuntimeId?: string | null;
  transcriptPath?: string | null;
  cwd?: string | null;
  workspaceCurrentDir?: string | null;
  workspaceProjectDir?: string | null;
  modelId?: string | null;
  modelDisplayName?: string | null;
  version?: string | null;
  totalCostUsd?: number;
  totalDurationMs?: number;
  contextUsedTokens?: number;
  contextMaxTokens?: number;
  contextPercent?: number;
  sessionInputTokensTotal?: number;
  sessionOutputTokensTotal?: number;
  sessionTokensTotal?: number;
}
