import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { SnapshotStore } from "../domain/snapshotStore";
import { TeamResolver } from "../domain/teamResolver";

function makeEvent(type: RawRuntimeEvent["type"], patch: Partial<RawRuntimeEvent> = {}): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "agent-1",
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
});
