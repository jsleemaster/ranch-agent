import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { FolderMapper } from "../domain/folderMapper";
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
      teamResolver: new TeamResolver(configPath),
      folderMapper: new FolderMapper("/repo")
    });

    const start = store.applyRawEvent(makeEvent("tool_start"));
    const wait = store.applyRawEvent(makeEvent("permission_wait"));
    const done = store.applyRawEvent(makeEvent("tool_done"));

    expect(start.agent.currentHookGate).toBe("open");
    expect(wait.agent.currentHookGate).toBe("blocked");
    expect(done.agent.currentHookGate).toBe("closed");
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
      teamResolver: new TeamResolver(configPath),
      folderMapper: new FolderMapper("/repo")
    });

    let update = store.applyRawEvent(makeEvent("tool_start", { ts: 1 }));
    for (let i = 2; i <= 4; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(4);
    expect(update.agent.growthStage).toBe("seed");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 5 }));
    expect(update.agent.usageCount).toBe(5);
    expect(update.agent.growthStage).toBe("sprout");

    for (let i = 6; i <= 14; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(14);
    expect(update.agent.growthStage).toBe("sprout");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 15 }));
    expect(update.agent.growthStage).toBe("grow");

    for (let i = 16; i <= 34; i += 1) {
      update = store.applyRawEvent(makeEvent("tool_start", { ts: i }));
    }
    expect(update.agent.usageCount).toBe(34);
    expect(update.agent.growthStage).toBe("grow");

    update = store.applyRawEvent(makeEvent("tool_start", { ts: 35 }));
    expect(update.agent.usageCount).toBe(35);
    expect(update.agent.growthStage).toBe("harvest");
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
      teamResolver: new TeamResolver(configPath),
      folderMapper: new FolderMapper("/repo")
    });

    const first = store.applyRawEvent(makeEvent("tool_start", { ts: 1, toolName: "Bash" }));
    expect(first.skillMetrics).toEqual([{ skill: "bash", usageCount: 1, growthStage: "seed" }]);

    for (let i = 2; i <= 5; i += 1) {
      store.applyRawEvent(makeEvent("tool_start", { ts: i, toolName: "Bash" }));
    }

    const world = store.getWorldInit();
    const bashMetric = world.skills.find((metric) => metric.skill === "bash");
    expect(world.skills).toHaveLength(8);
    expect(bashMetric).toEqual({ skill: "bash", usageCount: 5, growthStage: "sprout" });
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
      teamResolver: new TeamResolver(configPath),
      folderMapper: new FolderMapper("/repo")
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
});
