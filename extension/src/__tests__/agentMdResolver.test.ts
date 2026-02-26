import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { AgentMdResolver } from "../agentMdResolver";

function makeEvent(patch: Partial<RawRuntimeEvent> = {}): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "runtime-agent",
    ts: Date.now(),
    type: "tool_start",
    ...patch
  };
}

describe("AgentMdResolver", () => {
  it("loads both flat and nested agent markdown names", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-md-resolver-"));
    const agentsDir = path.join(workspace, ".claude", "agents");
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "reviewer.md"), "# reviewer");
    fs.mkdirSync(path.join(agentsDir, "planner"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "planner", "AGENT.md"), "# planner");

    const resolver = new AgentMdResolver(workspace);
    const labels = resolver.getCatalog().map((item) => item.label);

    expect(labels).toEqual(["planner", "reviewer"]);
  });

  it("resolves invoked agent id from hint and path detail", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-md-resolver-map-"));
    const agentsDir = path.join(workspace, ".claude", "agents");
    fs.mkdirSync(path.join(agentsDir, "planner"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "planner", "AGENT.md"), "# planner");

    const resolver = new AgentMdResolver(workspace);

    const byHint = resolver.enrich(makeEvent({ invokedAgentHint: "planner" }));
    expect(byHint.invokedAgentMdId).toBe("planner");

    const byPath = resolver.enrich(
      makeEvent({
        detail: "use /tmp/project/.claude/agents/planner/AGENT.md for this task"
      })
    );
    expect(byPath.invokedAgentMdId).toBe("planner");
  });
});
