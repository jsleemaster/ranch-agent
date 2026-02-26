import type { WebviewAssetCatalog } from "@shared/assets";

const primitive: WebviewAssetCatalog = {
  source: "primitive",
  icons: {},
  sprites: {},
  tiles: {}
};

function asCatalog(value: unknown): WebviewAssetCatalog | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.source !== "primitive" &&
      candidate.source !== "placeholder-pack" &&
      candidate.source !== "user-pack" &&
      candidate.source !== "mixed") ||
    !candidate.icons ||
    typeof candidate.icons !== "object" ||
    Array.isArray(candidate.icons) ||
    !candidate.sprites ||
    typeof candidate.sprites !== "object" ||
    Array.isArray(candidate.sprites) ||
    !candidate.tiles ||
    typeof candidate.tiles !== "object" ||
    Array.isArray(candidate.tiles)
  ) {
    return null;
  }
  return {
    source: candidate.source,
    icons: candidate.icons as Record<string, string>,
    sprites: candidate.sprites as Record<string, string>,
    tiles: candidate.tiles as Record<string, string>
  };
}

export function readAssetCatalog(): WebviewAssetCatalog {
  return asCatalog(window.__FARM_AGENT_ASSETS__) ?? asCatalog(window.__EXPEDITION_ASSETS__) ?? primitive;
}
