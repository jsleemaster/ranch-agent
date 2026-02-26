export interface AssetPackManifest {
  version: 1;
  icons: Record<string, string>;
  sprites: Record<string, string>;
  tiles: Record<string, string>;
}

export type AssetSource = "primitive" | "placeholder-pack" | "user-pack" | "mixed";

export interface ResolvedAssetCatalog {
  source: AssetSource;
  icons: Record<string, string>;
  sprites: Record<string, string>;
  tiles: Record<string, string>;
}

export interface WebviewAssetCatalog {
  source: AssetSource;
  icons: Record<string, string>;
  sprites: Record<string, string>;
  tiles: Record<string, string>;
}
