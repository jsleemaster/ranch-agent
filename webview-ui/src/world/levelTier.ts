export type LevelTier = "rookie" | "seasoned" | "veteran" | "legend";

export function levelTier(level: number | undefined): LevelTier {
  const safeLevel = typeof level === "number" && Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  if (safeLevel >= 8) {
    return "legend";
  }
  if (safeLevel >= 5) {
    return "veteran";
  }
  if (safeLevel >= 3) {
    return "seasoned";
  }
  return "rookie";
}
