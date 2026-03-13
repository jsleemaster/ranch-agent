import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { SnapshotStore } from "../domain/snapshotStore";
import { TeamResolver } from "../domain/teamResolver";
import { stableAgentRuntimeIdForSource } from "../runtimeHub";

function makeEvent(type: RawRuntimeEvent["type"], patch: Partial<RawRuntimeEvent> = {}): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "agent-1",
    sessionRuntimeId: "session-1",
    ts: Date.now(),
    type,
    toolName: "Bash",
    filePath: "src/a.ts",
    ...patch
  };
}

describe("SnapshotStore", () => {
  it("keeps flow consistency for tool_start -> permission_wait -> tool_done", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const start = store.applyRawEvent(makeEvent("tool_start"));
    const wait = store.applyRawEvent(makeEvent("permission_wait"));
    const done = store.applyRawEvent(makeEvent("tool_done"));

    expect(start.agent.runtimeRole).toBe("main");
    expect(start.agent.currentHookGate).toBe("open");
    expect(wait.agent.currentHookGate).toBe("blocked");
    expect(done.agent.currentHookGate).toBe("closed");
  });

  it("classifies runtime role as team/subagent/main", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-role-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(makeEvent("tool_start", { ts: 1 }));
    expect(update.agent.runtimeRole).toBe("main");

    update = store.applyRawEvent(
      makeEvent("tool_start", { ts: 2, toolName: "Task", invokedAgentMdId: "code-reviewer" })
    );
    expect(update.agent.runtimeRole).toBe("team");

    update = store.applyRawEvent(
      makeEvent("assistant_text", { ts: 3, sourcePath: "/Users/me/.claude/projects/repo/subagents/worker-1.jsonl" })
    );
    expect(update.agent.runtimeRole).toBe("subagent");
  });

  it("prunes stale runtime agents after retention window", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-prune-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: "old-agent" }));
    store.applyRawEvent(makeEvent("tool_start", { ts: 182_000, agentRuntimeId: "new-agent" }));

    const world = store.getWorldInit();
    const agentIds = world.agents.map((agent) => agent.agentId);
    expect(agentIds).toContain("new-agent");
    expect(agentIds).not.toContain("old-agent");
  });

  it("archives idle waiting sessions and removes them from the live world", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-completed-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(makeEvent("tool_done", { ts: 1_000, agentRuntimeId: "worker-a" }));
    expect(update.agent.state).toBe("waiting");

    store.applyRawEvent(makeEvent("assistant_text", { ts: 32_000, agentRuntimeId: "worker-b" }));
    const world = store.getWorldInit();
    expect(world.agents.find((agent) => agent.agentId === "worker-a")).toBeUndefined();
    expect(world.sessions.find((session) => session.lineageId === "worker-a")?.closeReason).toBe("work_finished");

    update = store.applyRawEvent(
      makeEvent("tool_start", { ts: 33_000, agentRuntimeId: "worker-a", sessionRuntimeId: "session-2" })
    );
    expect(update.agent.state).toBe("active");
  });

  it("does not mark agent as completed while a wait session is still pending", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-completed-pending-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("permission_wait", { ts: 1_000, agentRuntimeId: "worker-a" }));
    store.applyRawEvent(makeEvent("assistant_text", { ts: 32_000, agentRuntimeId: "worker-b" }));

    const workerA = store.getWorldInit().agents.find((agent) => agent.agentId === "worker-a");
    expect(workerA?.state).toBe("waiting");
  });

  it("clears stale pending wait and archives the session after timeout", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-stale-wait-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("permission_wait", { ts: 1_000, agentRuntimeId: "worker-a" }));
    store.applyRawEvent(makeEvent("assistant_text", { ts: 50_000, agentRuntimeId: "worker-b" }));

    const world = store.getWorldInit();
    expect(world.agents.find((agent) => agent.agentId === "worker-a")).toBeUndefined();
    const archived = world.sessions.find((session) => session.lineageId === "worker-a");
    expect(archived?.closeReason).toBe("work_finished");
    expect(archived?.waitTotalMs).toBe(49_000);
  });

  it("prunes stale subagents faster than main agents", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-subagent-prune-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(
      makeEvent("tool_start", {
        ts: 1_000,
        agentRuntimeId: "sub-worker",
        sourcePath: "/Users/me/.claude/projects/repo/subagents/agent-1.jsonl"
      })
    );
    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: "main-worker" }));

    // Advance time with another agent event.
    store.applyRawEvent(makeEvent("assistant_text", { ts: 23_000, agentRuntimeId: "ticker" }));
    const world = store.getWorldInit();
    const agentIds = world.agents.map((agent) => agent.agentId);
    expect(agentIds).toContain("main-worker");
    expect(agentIds).not.toContain("sub-worker");
  });

  it("archives prior session on same lineage when sessionRuntimeId rolls over", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-rollover-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: "worker-a", sessionRuntimeId: "sess-1" }));
    const update = store.applyRawEvent(
      makeEvent("assistant_text", { ts: 2_000, agentRuntimeId: "worker-a", sessionRuntimeId: "sess-2" })
    );

    expect(update.sessionArchives).toHaveLength(1);
    expect(update.sessionArchives[0]?.closeReason).toBe("conversation_rollover");
    expect(update.sessionArchives[0]?.sessionId).toBe("sess-1");
    expect(update.agent.agentId).toBe("worker-a");
  });

  it("archives stuck sessions as stale cleanup when pending tool blocks normal completion", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-stale-cleanup-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: "worker-a", sessionRuntimeId: "sess-1" }));
    store.applyRawEvent(makeEvent("assistant_text", { ts: 182_000, agentRuntimeId: "ticker", sessionRuntimeId: "tick-1" }));

    const archived = store.getWorldInit().sessions.find((session) => session.lineageId === "worker-a");
    expect(archived?.closeReason).toBe("stale_cleanup");
    expect(archived?.toolRunCount).toBe(0);
  });

  it("measures wait durations for permission and turn waits", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-wait-ms-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("permission_wait", { ts: 1_000 }));
    let resumed = store.applyRawEvent(makeEvent("tool_start", { ts: 1_800 }));
    expect(resumed.feed.waitDurationMs).toBe(800);
    expect(resumed.feed.waitKind).toBe("permission");
    expect(resumed.agent.waitTotalMs).toBe(800);
    expect(resumed.agent.waitCount).toBe(1);
    expect(resumed.agent.permissionWaitTotalMs).toBe(800);
    expect(resumed.agent.permissionWaitCount).toBe(1);
    expect(resumed.agent.waitAvgMs).toBe(800);

    store.applyRawEvent(makeEvent("turn_waiting", { ts: 2_000 }));
    resumed = store.applyRawEvent(makeEvent("turn_active", { ts: 3_000 }));
    expect(resumed.feed.waitDurationMs).toBe(1000);
    expect(resumed.feed.waitKind).toBe("turn");
    expect(resumed.agent.waitTotalMs).toBe(1800);
    expect(resumed.agent.waitCount).toBe(2);
    expect(resumed.agent.turnWaitTotalMs).toBe(1000);
    expect(resumed.agent.turnWaitCount).toBe(1);
    expect(resumed.agent.waitAvgMs).toBe(900);
  });

  it("derives growth stage from usage thresholds", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-growth-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(makeEvent("tool_start", { ts: 1 }));
    for (let i = 2; i <= 4; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(4);
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(4);
    expect(update.agent.growthStage).toBe("seed");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 5 }));
    expect(update.agent.usageCount).toBe(5);
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(5);
    expect(update.agent.growthStage).toBe("sprout");

    for (let i = 6; i <= 14; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(14);
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(14);
    expect(update.agent.growthStage).toBe("sprout");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 15 }));
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(15);
    expect(update.agent.growthStage).toBe("grow");

    for (let i = 16; i <= 24; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(24);
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(24);
    expect(update.agent.growthStage).toBe("grow");

    for (let i = 25; i <= 34; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(34);
    expect(update.agent.growthLevel).toBe(1);
    expect(update.agent.growthLevelUsage).toBe(34);
    expect(update.agent.growthStage).toBe("harvest");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 35 }));
    expect(update.agent.usageCount).toBe(35);
    expect(update.agent.growthLevel).toBe(2);
    expect(update.agent.growthLevelUsage).toBe(0);
    expect(update.agent.growthStage).toBe("seed");
  });

  it("accumulates skill metrics and exposes upsert payload", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-skills-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const first = store.applyRawEvent(makeEvent("tool_start", { ts: 1, toolName: "Bash" }));
    expect(first.skillMetrics).toEqual([{ skill: "bash", usageCount: 1, growthStage: "seed" }]);
    expect(first.agent.skillUsageByKind.bash).toBe(1);

    for (let i = 2; i <= 5; i += 1) {
      store.applyRawEvent(makeEvent("tool_start", { ts: i, toolName: "Bash" }));
    }

    const world = store.getWorldInit();
    const updatedAgent = world.agents.find((agent) => agent.agentId === "agent-1");
    const bashMetric = world.skills.find((metric) => metric.skill === "bash");
    expect(world.skills).toHaveLength(8);
    expect(updatedAgent?.skillUsageByKind.bash).toBe(5);
    expect(bashMetric).toEqual({ skill: "bash", usageCount: 5, growthStage: "sprout" });
  });

  it("separates runtime signal metrics from skill metrics", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-signals-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const orchestrationUpdate = store.applyRawEvent(makeEvent("tool_start", { ts: 1, toolName: "Agent" }));
    expect(orchestrationUpdate.signalMetrics).toEqual([{ signal: "orchestration_signal", usageCount: 1 }]);
    expect(orchestrationUpdate.skillMetrics).toEqual([{ skill: "other", usageCount: 1, growthStage: "seed" }]);

    const missingToolUpdate = store.applyRawEvent(makeEvent("tool_done", { ts: 2, toolName: undefined }));
    expect(missingToolUpdate.signalMetrics).toEqual([{ signal: "tool_name_missing_signal", usageCount: 1 }]);

    const assistantUpdate = store.applyRawEvent(makeEvent("assistant_text", { ts: 3, toolName: undefined }));
    expect(assistantUpdate.signalMetrics).toEqual([{ signal: "assistant_reply_signal", usageCount: 1 }]);

    const unknownToolUpdate = store.applyRawEvent(makeEvent("tool_start", { ts: 4, toolName: "MagicTool" }));
    expect(unknownToolUpdate.signalMetrics).toEqual([{ signal: "unknown_tool_signal", usageCount: 1 }]);

    // Known mapped skill should not increment runtime signal metrics.
    const mappedSkillUpdate = store.applyRawEvent(makeEvent("tool_start", { ts: 5, toolName: "Read" }));
    expect(mappedSkillUpdate.signalMetrics).toEqual([]);

    const world = store.getWorldInit();
    const signalByKind = new Map(world.signals.map((metric) => [metric.signal, metric.usageCount]));
    expect(signalByKind.get("orchestration_signal")).toBe(1);
    expect(signalByKind.get("tool_name_missing_signal")).toBe(1);
    expect(signalByKind.get("assistant_reply_signal")).toBe(1);
    expect(signalByKind.get("unknown_tool_signal")).toBe(1);
  });

  it("measures tool run duration from start to done", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-tool-run-ms-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    store.applyRawEvent(makeEvent("tool_start", { ts: 100, toolId: "tool-1", toolName: "Bash" }));
    let done = store.applyRawEvent(makeEvent("tool_done", { ts: 350, toolId: "tool-1", toolName: "Bash" }));
    expect(done.feed.toolRunDurationMs).toBe(250);
    expect(done.agent.toolRunTotalMs).toBe(250);
    expect(done.agent.toolRunCount).toBe(1);
    expect(done.agent.toolRunAvgMs).toBe(250);
    expect(done.agent.lastToolRunMs).toBe(250);

    store.applyRawEvent(makeEvent("tool_start", { ts: 500, toolName: "Read" }));
    done = store.applyRawEvent(makeEvent("tool_done", { ts: 900, toolName: "Read" }));
    expect(done.feed.toolRunDurationMs).toBe(400);
    expect(done.agent.toolRunTotalMs).toBe(650);
    expect(done.agent.toolRunCount).toBe(2);
    expect(done.agent.toolRunAvgMs).toBe(325);
  });

  it("tracks invoked agent-md call counts per runtime agent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-agent-md-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(makeEvent("tool_start", { invokedAgentMdId: "reviewer", ts: 1 }));
    expect(update.agent.agentMdCallsTotal).toBe(1);
    expect(update.agent.agentMdCallsById).toEqual({ reviewer: 1 });
    expect(update.feed.invokedAgentMdId).toBe("reviewer");

    update = store.applyRawEvent(makeEvent("tool_start", { invokedAgentMdId: "reviewer", ts: 2 }));
    expect(update.agent.agentMdCallsTotal).toBe(2);
    expect(update.agent.agentMdCallsById).toEqual({ reviewer: 2 });

    update = store.applyRawEvent(makeEvent("tool_start", { invokedAgentMdId: "planner", ts: 3 }));
    expect(update.agent.agentMdCallsTotal).toBe(3);
    expect(update.agent.agentMdCallsById).toEqual({ reviewer: 2, planner: 1 });
  });

  it("tracks invoked skill-md call counts per runtime agent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-skill-md-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(makeEvent("tool_start", { invokedSkillMdId: "fix-pr", ts: 1 }));
    expect(update.agent.skillMdCallsTotal).toBe(1);
    expect(update.agent.skillMdCallsById).toEqual({ "fix-pr": 1 });
    expect(update.feed.invokedSkillMdId).toBe("fix-pr");

    update = store.applyRawEvent(makeEvent("tool_start", { invokedSkillMdId: "fix-pr", ts: 2 }));
    expect(update.agent.skillMdCallsTotal).toBe(2);
    expect(update.agent.skillMdCallsById).toEqual({ "fix-pr": 2 });

    update = store.applyRawEvent(makeEvent("tool_start", { invokedSkillMdId: "test-generator", ts: 3 }));
    expect(update.agent.skillMdCallsTotal).toBe(3);
    expect(update.agent.skillMdCallsById).toEqual({ "fix-pr": 2, "test-generator": 1 });
  });

  it("accumulates token usage per runtime agent", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-tokens-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    let update = store.applyRawEvent(
      makeEvent("assistant_text", {
        ts: 1,
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120
      })
    );
    expect(update.agent.promptTokensTotal).toBe(100);
    expect(update.agent.completionTokensTotal).toBe(20);
    expect(update.agent.totalTokensTotal).toBe(120);
    expect(update.feed.totalTokens).toBe(120);

    update = store.applyRawEvent(
      makeEvent("assistant_text", {
        ts: 2,
        promptTokens: 50,
        completionTokens: 10
      })
    );
    expect(update.agent.promptTokensTotal).toBe(150);
    expect(update.agent.completionTokensTotal).toBe(30);
    expect(update.agent.totalTokensTotal).toBe(180);
    expect(update.agent.lastTotalTokens).toBe(60);
  });

  it("stores statusline budgets on transcript-derived lineage ids", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-statusline-budget-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const transcriptPath = path.join(tempDir, "runtime-a.jsonl");
    const lineageId = stableAgentRuntimeIdForSource(transcriptPath);
    store.applyRawEvent(
      makeEvent("assistant_text", { ts: 1_000, agentRuntimeId: lineageId, sessionRuntimeId: "sess-1" })
    );

    const update = store.applyStatuslineSnapshot({
      ts: 1_500,
      transcriptPath,
      sessionRuntimeId: "sess-1",
      contextPercent: 42,
      sessionTokensTotal: 1300,
      totalCostUsd: 1.23
    });

    expect(update.budget?.lineageId).toBe(lineageId);
    expect(store.getWorldInit().budgets[0]).toMatchObject({
      lineageId,
      sessionTokensTotal: 1300,
      contextPercent: 42
    });
  });

  it("archives prior session and emits session rollover feed when statusline session id changes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-statusline-rollover-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const transcriptPath = path.join(tempDir, "runtime-b.jsonl");
    const lineageId = stableAgentRuntimeIdForSource(transcriptPath);
    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: lineageId, sessionRuntimeId: "sess-1" }));
    store.applyStatuslineSnapshot({
      ts: 1_500,
      transcriptPath,
      sessionRuntimeId: "sess-1",
      sessionTokensTotal: 100
    });

    const update = store.applyStatuslineSnapshot({
      ts: 2_000,
      transcriptPath,
      sessionRuntimeId: "sess-2",
      sessionTokensTotal: 12
    });

    expect(update.sessionArchives).toHaveLength(1);
    expect(update.sessionArchives[0]?.closeReason).toBe("conversation_rollover");
    expect(update.feed.map((event) => event.kind)).toContain("session_rollover");
    expect(store.getWorldInit().budgets[0]?.sessionRuntimeId).toBe("sess-2");
  });

  it("copies statusline metrics into archived sessions", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "snapshot-store-statusline-archive-"));
    const configPath = path.join(tempDir, ".agent-teams.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        defaultTeamId: "solo",
        teams: [{ id: "solo", icon: "team_default", color: "#000", members: [] }]
      })
    );

    const store = new SnapshotStore({
      teamResolver: new TeamResolver(configPath)
    });

    const transcriptPath = path.join(tempDir, "runtime-d.jsonl");
    const lineageId = stableAgentRuntimeIdForSource(transcriptPath);
    store.applyRawEvent(makeEvent("tool_start", { ts: 1_000, agentRuntimeId: lineageId, sessionRuntimeId: "sess-1" }));
    store.applyStatuslineSnapshot({
      ts: 1_100,
      transcriptPath,
      sessionRuntimeId: "sess-1",
      contextPercent: 61,
      sessionTokensTotal: 2300,
      totalCostUsd: 0.42
    });

    const rolloverUpdate = store.applyStatuslineSnapshot({
      ts: 1_200,
      transcriptPath,
      sessionRuntimeId: "sess-2",
      sessionTokensTotal: 12
    });

    const archived = rolloverUpdate.sessionArchives.find((session) => session.lineageId === lineageId);
    expect(archived?.statuslineSessionTokensTotal).toBe(2300);
    expect(archived?.statuslineContextPeakPercent).toBe(61);
    expect(archived?.statuslineCostUsd).toBe(0.42);
  });
});
