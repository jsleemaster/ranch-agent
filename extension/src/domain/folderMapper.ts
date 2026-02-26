import * as path from "node:path";

import { DEFAULT_ZONE_ORDER } from "../constants";

export interface ZoneMatch {
  zoneId: string | null;
  folderPrefix: string | null;
}

function normalizePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^\.\//, "");
}

export class FolderMapper {
  private readonly workspaceRoot: string | null;
  private readonly zoneOrder: string[];

  constructor(workspaceRoot: string | null, zoneOrder: string[] = DEFAULT_ZONE_ORDER) {
    this.workspaceRoot = workspaceRoot;
    this.zoneOrder = zoneOrder;
  }

  getZoneOrder(): string[] {
    return [...this.zoneOrder];
  }

  resolveZone(filePath: string | undefined): ZoneMatch {
    if (!filePath) {
      return { zoneId: null, folderPrefix: null };
    }

    let normalized = normalizePath(filePath);

    if (this.workspaceRoot && path.isAbsolute(normalized)) {
      const relative = path.relative(this.workspaceRoot, normalized);
      if (!relative.startsWith("..")) {
        normalized = normalizePath(relative);
      }
    }

    const first = normalized.split("/").find((segment) => segment.length > 0) ?? null;
    if (!first) {
      return { zoneId: null, folderPrefix: null };
    }

    const zoneId = this.zoneOrder.includes(first) ? first : "etc";
    return { zoneId, folderPrefix: first };
  }
}
