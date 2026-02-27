import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import type { RawRuntimeEvent } from "../../../shared/runtime";
import { SkillMdResolver } from "../skillMdResolver";

function makeEvent(patch: Partial<RawRuntimeEvent> = {}): RawRuntimeEvent {
  return {
    runtime: "claude-jsonl",
    agentRuntimeId: "runtime-agent",
    ts: Date.now(),
    type: "tool_start",
    ...patch
  };
}

describe("SkillMdResolver", () => {
  it("loads both flat and nested skill markdown names", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skill-md-resolver-"));
    const skillsDir = path.join(workspace, ".claude", "skills");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "lint.md"), "# lint");
    fs.mkdirSync(path.join(skillsDir, "fix-pr"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "fix-pr", "SKILL.md"), "# fix-pr");

    const resolver = new SkillMdResolver(workspace);
    const labels = resolver.getCatalog().map((item) => item.label);

    expect(labels).toEqual(["fix-pr", "lint"]);
  });

  it("resolves invoked skill id from hint and path detail", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skill-md-resolver-map-"));
    const skillsDir = path.join(workspace, ".claude", "skills");
    fs.mkdirSync(path.join(skillsDir, "fix-pr"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "fix-pr", "SKILL.md"), "# fix-pr");

    const resolver = new SkillMdResolver(workspace);

    const byHint = resolver.enrich(makeEvent({ invokedSkillHint: "fix-pr" }));
    expect(byHint.invokedSkillMdId).toBe("fix-pr");

    const byPath = resolver.enrich(
      makeEvent({
        detail: "use /tmp/project/.claude/skills/fix-pr/SKILL.md before coding"
      })
    );
    expect(byPath.invokedSkillMdId).toBe("fix-pr");
  });
});
