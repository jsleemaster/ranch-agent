import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

import type { AssetPackManifest, ResolvedAssetCatalog } from "../../shared/assets";

interface AssetPackSource {
  dir: string;
  manifest: AssetPackManifest | null;
}

export interface WebviewAssetCatalog extends ResolvedAssetCatalog {}

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

export function loadAssetCatalog(placeholderPackDir: string, userPackDir: string): ResolvedAssetCatalog {
  const placeholder: AssetPackSource = {
    dir: placeholderPackDir,
    manifest: readManifest(placeholderPackDir)
  };
  const user: AssetPackSource = {
    dir: userPackDir,
    manifest: readManifest(userPackDir)
  };

  const placeholderIcons = resolveSection(placeholder, "icons");
  const placeholderSprites = resolveSection(placeholder, "sprites");
  const placeholderTiles = resolveSection(placeholder, "tiles");

  const userIcons = resolveSection(user, "icons");
  const userSprites = resolveSection(user, "sprites");
  const userTiles = resolveSection(user, "tiles");

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
