import { describe, expect, it } from "vitest";

import { parseClaudeStatuslinePayload } from "../statuslinePayloadParser";

describe("parseClaudeStatuslinePayload", () => {
  it("parses core statusline fields from stdin payload", () => {
    const snapshot = parseClaudeStatuslinePayload({
      session_id: "sess-1",
      transcript_path: "/tmp/ranch/session.jsonl",
      cwd: "/tmp/ranch",
      workspace: {
        current_dir: "/tmp/ranch",
        project_dir: "/tmp"
      },
      model: {
        id: "claude-opus-4-1",
        display_name: "Opus"
      },
      version: "1.2.3",
      cost: {
        total_cost_usd: 1.23,
        total_duration_ms: 4500
      },
      context_window: {
        total_input_tokens: 1200,
        total_output_tokens: 300,
        context_window_size: 200000,
        used_percentage: 42.5,
        current_usage: {
          input_tokens: 500,
          output_tokens: 50,
          cache_creation_input_tokens: 100,
          cache_read_input_tokens: 25
        }
      }
    });

    expect(snapshot).toEqual({
      ts: expect.any(Number),
      sessionRuntimeId: "sess-1",
      transcriptPath: "/tmp/ranch/session.jsonl",
      cwd: "/tmp/ranch",
      workspaceCurrentDir: "/tmp/ranch",
      workspaceProjectDir: "/tmp",
      modelId: "claude-opus-4-1",
      modelDisplayName: "Opus",
      version: "1.2.3",
      totalCostUsd: 1.23,
      totalDurationMs: 4500,
      contextUsedTokens: 675,
      contextMaxTokens: 200000,
      contextPercent: 42.5,
      sessionInputTokensTotal: 1200,
      sessionOutputTokensTotal: 300,
      sessionTokensTotal: 1500
    });
  });

  it("derives totals and context percent from partial values", () => {
    const snapshot = parseClaudeStatuslinePayload({
      sessionId: "sess-2",
      transcriptPath: "/tmp/ranch/derived.jsonl",
      context_window: {
        total_input_tokens: 200,
        total_output_tokens: 80,
        context_window_size: 4000,
        current_usage: {
          input_tokens: 100,
          output_tokens: 20
        }
      }
    });

    expect(snapshot?.sessionTokensTotal).toBe(280);
    expect(snapshot?.contextUsedTokens).toBe(120);
    expect(snapshot?.contextPercent).toBe(3);
  });

  it("returns null when there is no session or transcript identity", () => {
    expect(parseClaudeStatuslinePayload({ model: { id: "opus" } })).toBeNull();
  });
});
