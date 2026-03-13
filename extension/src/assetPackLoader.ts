import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import type { AssetPackManifest, ResolvedAssetCatalog } from "../../shared/assets";

interface AssetPackSource {
  dir: string;
  manifest: AssetPackManifest | null;
}

export interface WebviewAssetCatalog extends ResolvedAssetCatalog {}

const AUTO_DISCOVERED_ASSET_PATHS = {
  icons: {
    rail_front_default: [
      "icons/train_front.png",
      "icons/train_front.svg",
      "icons/rail_front_default.png",
      "icons/rail_front_default.svg",
      "icons/rail_front.png",
      "icons/rail_front.svg"
    ],
    rail_front_main: [
      "icons/train_front_main.png",
      "icons/train_front_main.svg",
      "icons/rail_front_main.png",
      "icons/rail_front_main.svg"
    ],
    rail_front_subagent: [
      "icons/train_front_subagent.png",
      "icons/train_front_subagent.svg",
      "icons/train_front_sub.png",
      "icons/train_front_sub.svg",
      "icons/rail_front_subagent.png",
      "icons/rail_front_subagent.svg"
    ],
    rail_front_team: [
      "icons/train_front_team.png",
      "icons/train_front_team.svg",
      "icons/rail_front_team.png",
      "icons/rail_front_team.svg"
    ]
  },
  sprites: {
    rail_side_default: [
      "sprites/train_side.png",
      "sprites/train_side.svg",
      "sprites/rail_side_default.png",
      "sprites/rail_side_default.svg",
      "sprites/rail_side.png",
      "sprites/rail_side.svg"
    ],
    rail_side_main: [
      "sprites/train_side_main.png",
      "sprites/train_side_main.svg",
      "sprites/rail_side_main.png",
      "sprites/rail_side_main.svg"
    ],
    rail_side_subagent: [
      "sprites/train_side_subagent.png",
      "sprites/train_side_subagent.svg",
      "sprites/train_side_sub.png",
      "sprites/train_side_sub.svg",
      "sprites/rail_side_subagent.png",
      "sprites/rail_side_subagent.svg"
    ],
    rail_side_team: [
      "sprites/train_side_team.png",
      "sprites/train_side_team.svg",
      "sprites/rail_side_team.png",
      "sprites/rail_side_team.svg"
    ]
  },
  tiles: {
    rail_stage_bg: [
      "tiles/rail_stage_bg.png",
      "tiles/rail_stage_bg.svg",
      "tiles/stage_bg.png",
      "tiles/stage_bg.svg"
    ]
  }
} satisfies Record<"icons" | "sprites" | "tiles", Record<string, string[]>>;

function readManifest(packDir: string): AssetPackManifest | null {
  const manifestPath = path.join(packDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as AssetPackManifest;
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function resolveSection(
  source: AssetPackSource,
  section: "icons" | "sprites" | "tiles"
): Record<string, string> {
  const resolved: Record<string, string> = {};

  const entries = source.manifest?.[section] ?? {};
  for (const [key, relativePath] of Object.entries(entries)) {
    const absolutePath = path.join(source.dir, relativePath);
    if (fs.existsSync(absolutePath)) {
      resolved[key] = absolutePath;
    }
  }

  return resolved;
}

function resolveDiscoveredSection(
  source: AssetPackSource,
  section: "icons" | "sprites" | "tiles"
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const candidates = AUTO_DISCOVERED_ASSET_PATHS[section];

  for (const [key, relativePaths] of Object.entries(candidates)) {
    for (const relativePath of relativePaths) {
      const absolutePath = path.join(source.dir, relativePath);
      if (!fs.existsSync(absolutePath)) {
        continue;
      }
      resolved[key] = absolutePath;
      break;
    }
  }

  return resolved;
}

export function loadAssetCatalog(placeholderPackDir: string, userPackDir: string): ResolvedAssetCatalog {
  const placeholder: AssetPackSource = {
    dir: placeholderPackDir,
    manifest: readManifest(placeholderPackDir)
  };
  const user: AssetPackSource = {
    dir: userPackDir,
    manifest: readManifest(userPackDir)
  };

  const placeholderIcons = { ...resolveDiscoveredSection(placeholder, "icons"), ...resolveSection(placeholder, "icons") };
  const placeholderSprites = {
    ...resolveDiscoveredSection(placeholder, "sprites"),
    ...resolveSection(placeholder, "sprites")
  };
  const placeholderTiles = { ...resolveDiscoveredSection(placeholder, "tiles"), ...resolveSection(placeholder, "tiles") };

  const userIcons = { ...resolveDiscoveredSection(user, "icons"), ...resolveSection(user, "icons") };
  const userSprites = { ...resolveDiscoveredSection(user, "sprites"), ...resolveSection(user, "sprites") };
  const userTiles = { ...resolveDiscoveredSection(user, "tiles"), ...resolveSection(user, "tiles") };

  const icons = { ...placeholderIcons, ...userIcons };
  const sprites = { ...placeholderSprites, ...userSprites };
  const tiles = { ...placeholderTiles, ...userTiles };

  const userAssetCount = Object.keys(userIcons).length + Object.keys(userSprites).length + Object.keys(userTiles).length;
  const placeholderAssetCount =
    Object.keys(placeholderIcons).length + Object.keys(placeholderSprites).length + Object.keys(placeholderTiles).length;

  let source: ResolvedAssetCatalog["source"] = "primitive";
  if (placeholderAssetCount > 0 && userAssetCount > 0) {
    source = "mixed";
  } else if (userAssetCount > 0) {
    source = "user-pack";
  } else if (placeholderAssetCount > 0) {
    source = "placeholder-pack";
  }

  return {
    source,
    icons,
    sprites,
    tiles
  };
}

function toUriRecord(webview: vscode.Webview, input: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, absolutePath] of Object.entries(input)) {
    output[key] = webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
  }
  return output;
}

export function toWebviewAssetCatalog(webview: vscode.Webview, catalog: ResolvedAssetCatalog): WebviewAssetCatalog {
  return {
    source: catalog.source,
    icons: toUriRecord(webview, catalog.icons),
    sprites: toUriRecord(webview, catalog.sprites),
    tiles: toUriRecord(webview, catalog.tiles)
  };
}
