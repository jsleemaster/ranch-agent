import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { TeamResolver } from "../domain/teamResolver";

describe("TeamResolver", () => {
  it("matches agent id rule", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "team-resolver-"));
    const configPath = path.join(tempDir, ".agent-teams.json");

    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: 1,
          defaultTeamId: "solo",
          teams: [
            { id: "solo", icon: "team_solo", color: "#111", members: [] },
            {
              id: "ops",
              icon: "team_ops",
              color: "#222",
              members: [{ agentIdPattern: "^ops-" }]
            }
          ]
        },
        null,
        2
      )
    );

    const resolver = new TeamResolver(configPath);
    expect(resolver.resolveTeam("ops-1", "src/a.ts").id).toBe("ops");
    expect(resolver.resolveTeam("x-1", "src/a.ts").id).toBe("solo");
  });

  it("falls back when config file is missing", () => {
    const resolver = new TeamResolver("/tmp/does-not-exist-config.json");
    expect(resolver.resolveTeam("any", "src/a.ts").id).toBe("solo");
  });
});
