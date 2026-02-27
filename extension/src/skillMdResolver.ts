import * as fs from "node:fs";
import * as path from "node:path";

import type { SkillMdCatalogItem } from "../../shared/domain";
import type { RawRuntimeEvent } from "../../shared/runtime";

const SKILL_MD_PATH_PATTERN = /(?:^|[\s"'`([{]|\/)\.claude\/skills\/([^?#\s]+?\.md)\b/i;

function normalizeSkillMdId(value: string): string {
  const lower = value.trim().toLowerCase();
  const baseName = path.basename(lower);
  return baseName.endsWith(".md") ? baseName.slice(0, -3) : baseName;
}

function labelFromRelativeMdPath(relativeMdPath: string): string {
  const normalized = relativeMdPath.replace(/\\/g, "/");
  const extless = normalized.replace(/\.md$/i, "");
  const fileName = path.basename(extless);
  if (fileName.toLowerCase() === "skill" || fileName.toLowerCase() === "skills") {
    return path.basename(path.dirname(extless));
  }
  return fileName;
}

function parseIdFromPathHint(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\\/g, "/");
  const matched = normalized.match(SKILL_MD_PATH_PATTERN);
  if (!matched?.[1]) {
    return null;
  }
  return normalizeSkillMdId(labelFromRelativeMdPath(matched[1]));
}

export class SkillMdResolver {
  private readonly skillsDir: string;
  private catalog: SkillMdCatalogItem[] = [];
  private catalogById = new Map<string, SkillMdCatalogItem>();

  constructor(workspaceRoot: string) {
    this.skillsDir = path.join(workspaceRoot, ".claude", "skills");
    this.reload();
  }

  reload(): void {
    if (!fs.existsSync(this.skillsDir)) {
      this.catalog = [];
      this.catalogById = new Map();
      return;
    }

    const nextById = new Map<string, SkillMdCatalogItem>();
    const walkQueue = [this.skillsDir];

    while (walkQueue.length > 0) {
      const currentDir = walkQueue.shift();
      if (!currentDir) {
        continue;
      }

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walkQueue.push(absolutePath);
          continue;
        }
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
          continue;
        }

        const relativePath = path.relative(this.skillsDir, absolutePath).replace(/\\/g, "/");
        const label = labelFromRelativeMdPath(relativePath);
        const id = normalizeSkillMdId(label);
        if (!id || nextById.has(id)) {
          continue;
        }

        nextById.set(id, {
          id,
          label,
          fileName: relativePath
        });
      }
    }

    const next = [...nextById.values()].sort((a, b) => a.label.localeCompare(b.label));
    this.catalog = next;
    this.catalogById = new Map(next.map((item) => [item.id, item]));
  }

  getCatalog(): SkillMdCatalogItem[] {
    return [...this.catalog];
  }

  enrich(event: RawRuntimeEvent): RawRuntimeEvent {
    const resolvedId = this.resolveInvokedSkillMdId(event);
    return {
      ...event,
      invokedSkillMdId: resolvedId
    };
  }

  private resolveInvokedSkillMdId(event: RawRuntimeEvent): string | null {
    const candidates: string[] = [];

    if (event.invokedSkillHint) {
      candidates.push(event.invokedSkillHint);
    }
    if (event.detail) {
      candidates.push(event.detail);
    }
    if (event.filePath) {
      candidates.push(event.filePath);
    }

    for (const raw of candidates) {
      const fromPath = parseIdFromPathHint(raw);
      if (fromPath && this.catalogById.has(fromPath)) {
        return fromPath;
      }

      const normalized = normalizeSkillMdId(raw);
      if (this.catalogById.has(normalized)) {
        return normalized;
      }
    }

    return null;
  }
}
