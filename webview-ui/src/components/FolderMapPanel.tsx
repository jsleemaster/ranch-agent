import React, { useEffect, useMemo, useRef } from "react";
import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, ZoneSnapshot } from "@shared/domain";
import {
  iconUrl,
  spriteUrl,
  teamEmoji,
  teamIconKey,
  zoneLabel
} from "../world/iconKeys";

interface FolderMapPanelProps {
  zones: ZoneSnapshot[];
  agents: AgentSnapshot[];
  assets: WebviewAssetCatalog;
  isMinimap?: boolean;
}

interface WanderState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nextShift: number;
}

interface DrawItem {
  agent: AgentSnapshot;
  x: number;
  y: number;
  size: number;
}

interface TrimRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function seedFromAgent(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(31, h) + id.charCodeAt(i) | 0;
  return h;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function getImage(cache: Map<string, HTMLImageElement>, url: string): HTMLImageElement | null {
  if (cache.has(url)) return cache.get(url)!;
  const img = new Image();
  img.src = url;
  cache.set(url, img);
  return img;
}

function computeTrimRect(image: HTMLImageElement): TrimRect | null {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  try {
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3];
        if (alpha < 8) {
          continue;
        }
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return {
      sx: minX,
      sy: minY,
      sw: maxX - minX + 1,
      sh: maxY - minY + 1
    };
  } catch {
    return null;
  }
}

function getTrimRect(cache: Map<string, TrimRect | null>, key: string, image: HTMLImageElement): TrimRect | null {
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const rect = computeTrimRect(image);
  cache.set(key, rect);
  return rect;
}

function gateAura(gate: AgentSnapshot["currentHookGate"]): string | null {
  switch (gate) {
    case "open": return "rgba(124, 198, 110, 0.4)";
    case "failed": return "rgba(224, 85, 69, 0.5)";
    case "blocked": return "rgba(240, 184, 64, 0.4)";
    default: return null;
  }
}

function growthAura(agent: AgentSnapshot): string {
  switch (agent.growthStage) {
    case "harvest": return "rgba(240, 184, 64, 0.5)";
    case "grow": return "rgba(124, 198, 110, 0.3)";
    default: return "rgba(168, 148, 120, 0.2)";
  }
}

/** Legacy-safe rounded rect fallback */
function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Simplified Zone for effectiveZones */
interface SimplifiedZone {
    zoneId: string;
}

export default function FolderMapPanel({
  zones,
  agents,
  assets,
  isMinimap = false
}: FolderMapPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wanderRef = useRef<Map<string, WanderState>>(new Map());
  const positionRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
const trimRectCacheRef = useRef<Map<string, TrimRect | null>>(new Map());

  const effectiveZones = useMemo<SimplifiedZone[]>(() => {
    if (zones.length > 0) return zones.map(z => ({ zoneId: z.zoneId }));
    const agentZones = Array.from(new Set(agents.map(a => a.currentZoneId).filter((id): id is string => !!id)));
    if (agentZones.length > 0) return agentZones.map(id => ({ zoneId: id }));
    return [{ zoneId: "ranch-main" }];
  }, [zones, agents]);

  const ranchStats = useMemo(() => {
    if (isMinimap) return null;
    const activeZoneIds = new Set(agents.map(a => a.currentZoneId).filter((id): id is string => !!id));
    const failedGateZones = new Set(agents.filter(a => a.currentHookGate === "failed").map(a => a.currentZoneId).filter((id): id is string => !!id));
    return {
      activeCount: activeZoneIds.size,
      totalCount: effectiveZones.length,
      utilPercent: Math.round((activeZoneIds.size / (effectiveZones.length || 1)) * 100),
      harvestableCount: agents.filter(a => a.growthStage === "harvest").length,
      warningCount: failedGateZones.size,
      totalTokens: agents.reduce((sum, a) => sum + (a.totalTokensTotal ?? 0), 0)
    };
  }, [agents, effectiveZones, isMinimap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame: number;
    const dpr = window.devicePixelRatio || 1;

    const activeZones = effectiveZones;
    const activeAgents = agents;
    const activeAssets = assets;
    const render = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const rectBounds = parent.getBoundingClientRect();
      const wWidth = rectBounds.width;
      const wHeight = rectBounds.height;

      if (canvas.width !== wWidth * dpr || canvas.height !== wHeight * dpr) {
        canvas.width = wWidth * dpr;
        canvas.height = wHeight * dpr;
        canvas.style.width = `${wWidth}px`;
        canvas.style.height = `${wHeight}px`;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = !isMinimap;
      context.clearRect(0, 0, wWidth, wHeight);

      const zoneCount = activeZones.length;
      if (zoneCount === 0) return;

      const aspect = wWidth / (wHeight || 1);
      let cols = Math.ceil(Math.sqrt(zoneCount * (aspect || 1)));
      if (zoneCount === 1) cols = 1;
      const rows = Math.ceil(zoneCount / (cols || 1));

      const gap = isMinimap ? 4 : 8;
      const tileW = Math.max(10, (wWidth - (cols + 1) * gap) / (cols || 1));
      const tileH = Math.max(10, (wHeight - (rows + 1) * gap) / (rows || 1));

      const now = Date.now() / 1000;
      const visibleAgentIds = new Set<string>();
      const drawQueue: DrawItem[] = [];

      for (let i = 0; i < zoneCount; i += 1) {
        const zone = activeZones[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gap + col * (tileW + gap);
        const y = gap + row * (tileH + gap);
        const w = tileW;
        const h = tileH;

        const zoneAgents = isMinimap && zone.zoneId === "ranch-main"
          ? activeAgents
          : activeAgents.filter((a) => (a.currentZoneId ?? "ranch-main") === zone.zoneId);
        const zoneFeed = zoneAgents.reduce((s, a) => s + (a.totalTokensTotal ?? 0), 0);
        const hasWarning = zoneAgents.some(a => a.currentHookGate === "failed");
        const isEmpty = zoneAgents.length === 0;

        // Tile background
        if (isMinimap) {
            context.fillStyle = "rgba(28, 19, 10, 0.92)";
        } else {
            context.fillStyle = "rgba(30, 24, 15, 0.3)";
        }
        drawRoundedRect(context, x, y, w, h, 8);
        context.fill();

        // Border
        context.strokeStyle = isMinimap ? "rgba(212, 134, 11, 0.15)" : "rgba(139, 107, 62, 0.2)";
        if (hasWarning && !isMinimap) {
          const pulse = (Math.sin(now * 4) + 1) / 2;
          context.strokeStyle = `rgba(224, 85, 69, ${0.3 + pulse * 0.5})`;
          context.lineWidth = 2 + pulse * 2;
        } else {
          context.lineWidth = 1;
        }
        context.stroke();

        // Decorations (Grass/Dirt)
        if (!isMinimap) {
            context.fillStyle = "rgba(74, 122, 58, 0.15)";
            const seed = seedFromAgent(zone.zoneId);
            for (let d = 0; d < 12; d++) {
                const dx = x + 10 + ((seed + d * 137) % (w - 20 || 1));
                const dy = y + 10 + ((seed * (d + 1) * 263) % (h - 20 || 1));
                context.beginPath();
                context.arc(dx, dy, 1.2, 0, Math.PI * 2);
                context.fill();
            }
        }

        // Zone labels
        if (!isMinimap) {
            context.font = "bold 13px 'JetBrains Mono', monospace";
            context.fillStyle = isEmpty ? "rgba(200, 180, 150, 0.5)" : "#F5E6C8";
            context.textAlign = "left";
            context.textBaseline = "top";
            context.fillText(zoneLabel(zone.zoneId), x + 8, y + 8);

            context.font = "bold 12px 'JetBrains Mono', monospace";
            context.fillText(`${zoneAgents.length}명`, x + 8, y + h - 22);
            
            context.font = "11px 'JetBrains Mono', monospace";
            context.fillStyle = "rgba(240, 184, 64, 0.9)";
            context.textAlign = "right";
            context.fillText(`🌾${formatTokens(zoneFeed)}`, x + w - 8, y + h - 8);
        }

        if (isEmpty && !isMinimap) {
            context.font = "12px sans-serif";
            context.fillStyle = "rgba(180, 160, 130, 0.5)";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("비어있음", x + w/2, y + h/2);
        }

        for (const agent of zoneAgents) {
          let state = wanderRef.current.get(agent.agentId);
          const rangeX = (w - 40) * 0.4;
          const rangeY = (h - 40) * 0.4;

          if (!state || now > state.nextShift) {
            state = {
              x: state?.x ?? 0, y: state?.y ?? 0,
              tx: (Math.random() - 0.5) * rangeX * 2,
              ty: (Math.random() - 0.5) * rangeY * 2,
              nextShift: now + 3 + Math.random() * 4
            };
            wanderRef.current.set(agent.agentId, state);
          }
          state.x += (state.tx - state.x) * 0.02;
          state.y += (state.ty - state.y) * 0.02;

          const basePosX = x + w / 2 + state.x;
          const basePosY = y + h / 2 + state.y;

          const pos = positionRef.current.get(agent.agentId) ?? { x: basePosX, y: basePosY };
          pos.x += (basePosX - pos.x) * 0.1;
          pos.y += (basePosY - pos.y) * 0.1;
          positionRef.current.set(agent.agentId, pos);

          const bounce = isMinimap ? 0 : Math.sin(now * 5 + seedFromAgent(agent.agentId)) * 2;
          const size = isMinimap ? 42 : 20;

          drawQueue.push({
            agent, x: pos.x - size / 2, y: pos.y - size / 2 + bounce,
            size,
          });
          visibleAgentIds.add(agent.agentId);
        }
      }

      for (const id of Array.from(positionRef.current.keys())) {
        if (!visibleAgentIds.has(id)) positionRef.current.delete(id);
      }

      drawQueue.sort((a, b) => a.y - b.y);
      for (const item of drawQueue) {
        const { agent, x, y, size } = item;
        const renderedSize = isMinimap ? Math.round(size * 1.35) : size;
        const drawX = x - (renderedSize - size) / 2;
        const drawY = y - (renderedSize - size) / 2;
        context.globalAlpha = 1;
        
        const spriteUrlStr = spriteUrl(activeAssets, agent.state);
        const iconUrlStr = iconUrl(activeAssets, teamIconKey(agent));
        
        const sprite = (spriteUrlStr ? getImage(imageCacheRef.current, spriteUrlStr) : null) ||
                       (iconUrlStr ? getImage(imageCacheRef.current, iconUrlStr) : null);
        const spriteCacheKey = spriteUrlStr ?? iconUrlStr ?? "";

        const canDrawSprite = !!(sprite && sprite.complete && sprite.naturalWidth > 0 && sprite.naturalHeight > 0);
        if (canDrawSprite && sprite) {
          const trim = spriteCacheKey
            ? getTrimRect(trimRectCacheRef.current, spriteCacheKey, sprite)
            : null;

          if (trim && trim.sw > 0 && trim.sh > 0) {
            context.drawImage(sprite, trim.sx, trim.sy, trim.sw, trim.sh, drawX, drawY, renderedSize, renderedSize);
          } else {
            context.drawImage(sprite, drawX, drawY, renderedSize, renderedSize);
          }
        } else {
          const fillColor = agent.state === "active"
            ? "#7CC66E"
            : agent.state === "completed"
              ? "#8FA2B5"
              : (isMinimap ? "#D1BE95" : "#A89478");
          context.fillStyle = fillColor;
          context.beginPath();
          context.arc(drawX + renderedSize / 2, drawY + renderedSize / 2, renderedSize / 2, 0, Math.PI * 2);
          context.fill();

          // Fallback mark so minimap remains visible even if sprites fail to load.
          context.strokeStyle = isMinimap ? "rgba(255, 244, 220, 0.55)" : "rgba(20, 16, 12, 0.8)";
          context.lineWidth = 1;
          context.stroke();
          context.font = isMinimap ? "10px sans-serif" : "12px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = "#1f150c";
          context.fillText(teamEmoji(agent), drawX + renderedSize / 2, drawY + renderedSize / 2 + 0.5);
        }

        const aura = gateAura(agent.currentHookGate);
        if (aura && !isMinimap) {
          context.strokeStyle = aura; context.lineWidth = 2;
          context.strokeRect(x - 2, y - 2, size + 4, size + 4);
        }
      }
      context.globalAlpha = 1;

      if (isMinimap && drawQueue.length === 0) {
        context.fillStyle = "rgba(180, 160, 130, 0.7)";
        context.font = "11px 'JetBrains Mono', monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("일꾼 대기 중", wWidth / 2, wHeight / 2);
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [effectiveZones, agents, assets, isMinimap]);

  return (
    <div className={`folder-map ${isMinimap ? 'minimap-mode' : ''}`}>
      <canvas ref={canvasRef} className="zone-canvas" />
      {!isMinimap && ranchStats && (
        <div className="ranch-summary-bar">
          <div className="summary-pill">🏠 <span>구역 활용</span> <strong>{ranchStats.activeCount}/{ranchStats.totalCount} ({ranchStats.utilPercent}%)</strong></div>
          <div className="summary-pill">🧺 <span>수확 가능</span> <strong>{ranchStats.harvestableCount}</strong></div>
          {ranchStats.warningCount > 0 && <div className="summary-pill warning">⚠️ <span>경고</span> <strong>{ranchStats.warningCount}</strong></div>}
          <div className="summary-pill">🌾 <span>총 사료</span> <strong>{formatTokens(ranchStats.totalTokens)}</strong></div>
        </div>
      )}
    </div>
  );
}
