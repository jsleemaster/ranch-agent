import { describe, expect, it } from "vitest";

import { FolderMapper } from "../domain/folderMapper";

describe("FolderMapper", () => {
  const mapper = new FolderMapper("/repo");

  it("maps known top-level folder", () => {
    const match = mapper.resolveZone("/repo/src/main.ts");
    expect(match.zoneId).toBe("src");
  });

  it("maps unknown folder to etc", () => {
    const match = mapper.resolveZone("/repo/random/main.ts");
    expect(match.zoneId).toBe("etc");
    expect(match.folderPrefix).toBe("random");
  });
});
