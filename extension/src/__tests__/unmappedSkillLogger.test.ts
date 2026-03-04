import * as path from "node:path";
import * as os from "node:os";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { buildUnmappedSkillRecord, resolveUnmappedSkillLogPath } from "../debug/unmappedSkillLogger";

function event(type: RawRuntimeEvent["type"], toolName?: string): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "agent-1",
    ts: 1_000,
    type,
    toolName
  };
}

describe("buildUnmappedSkillRecord", () => {
  it("returns null for mapped tool names", () => {
    expect(buildUnmappedSkillRecord(event("tool_start", "Read"))).toBeNull();
    expect(buildUnmappedSkillRecord(event("tool_done", "Bash"))).toBeNull();
  });

  it("captures unknown tool names as unmapped records", () => {
    const record = buildUnmappedSkillRecord(event("tool_start", "PlanReview"));
    expect(record).not.toBeNull();
    expect(record?.reason).toBe("unknown_tool_name");
    expect(record?.mappedSkill).toBe("other");
  });

  it("captures assistant events without tool names", () => {
    const record = buildUnmappedSkillRecord(event("assistant_text"));
    expect(record).not.toBeNull();
    expect(record?.reason).toBe("assistant_without_tool_name");
    expect(record?.mappedSkill).toBeNull();
  });
});

describe("resolveUnmappedSkillLogPath", () => {
  it("resolves relative paths against workspace root", () => {
    const resolved = resolveUnmappedSkillLogPath("/repo/workspace", ".local-debug/custom.ndjson");
    expect(resolved).toBe(path.resolve("/repo/workspace", ".local-debug/custom.ndjson"));
  });

  it("resolves relative paths against global root when configured", () => {
    const resolved = resolveUnmappedSkillLogPath("/repo/workspace", ".local-debug/custom.ndjson", {
      globalRoot: "/var/global-store/ranch-agent",
      relativeBase: "global"
    });
    expect(resolved).toBe(path.resolve("/var/global-store/ranch-agent", ".local-debug/custom.ndjson"));
  });

  it("keeps absolute paths as-is", () => {
    const resolved = resolveUnmappedSkillLogPath("/repo/workspace", "/tmp/unmapped.ndjson");
    expect(resolved).toBe("/tmp/unmapped.ndjson");
  });

  it("expands home-prefixed paths", () => {
    const resolved = resolveUnmappedSkillLogPath("/repo/workspace", "~/.ranch-agent/unmapped.ndjson");
    expect(resolved).toBe(path.join(os.homedir(), ".ranch-agent/unmapped.ndjson"));
  });
});
