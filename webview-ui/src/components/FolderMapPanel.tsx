import React, { useEffect, useMemo, useRef } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, FilterState, ZoneSnapshot } from "@shared/domain";
import {
  gateEmoji,
  gateIconKey,
  iconUrl,
  spriteUrl,
  teamEmoji,
  teamIconKey,
  tileUrl,
  zoneEmoji,
  zoneIconKey,
  zoneLabel
} from "../world/iconKeys";

interface FolderMapPanelProps {
  zones: ZoneSnapshot[];
  agents: AgentSnapshot[];
  filter: FilterState;
  assets: WebviewAssetCatalog;
  onSelectZone: (zoneId: string | null) => void;
}

interface ZoneRect {
  zoneId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AgentPoint {
  x: number;
  y: number;
}

interface DrawAgent {
  agent: AgentSnapshot;
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  size: number;
  pulseSeed: number;
  matched: boolean;
}

const ZONE_FALLBACK_COLORS: Record<string, string> = {
  src: "#3B5D2A",
  apps: "#5C3A20",
  packages: "#7A5F2A",
  infra: "#4A3422",
  scripts: "#3E5D44",
  docs: "#6B5830",
  tests: "#5A4030",
  etc: "#4A3A2A"
};

function getImage(cache: Map<string, HTMLImageElement>, url: string | undefined): HTMLImageElement | null {
  if (!url) return null;
  let image = cache.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    cache.set(url, image);
  }
  return image.complete ? image : null;
}

function seedFromAgent(agentId: string): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i += 1) {
    hash = (hash * 31 + agentId.charCodeAt(i)) % 9973;
  }
  return hash;
}

function gateAura(gate: AgentSnapshot["currentHookGate"]): string | null {
  if (gate === "failed") return "rgba(224, 85, 69, 0.55)";
  if (gate === "blocked") return "rgba(240, 184, 64, 0.5)";
  if (gate === "open") return "rgba(124, 198, 110, 0.45)";
  return null;
}

function growthAura(agent: AgentSnapshot): string {
  if (agent.growthStage === "harvest") return "rgba(240, 184, 64, 0.5)";
  if (agent.growthStage === "grow") return "rgba(140, 200, 80, 0.4)";
  if (agent.growthStage === "sprout") return "rgba(90, 180, 70, 0.35)";
  return "rgba(120, 85, 50, 0.2)";
}

function matchesAgent(agent: AgentSnapshot, filter: FilterState): boolean {
  if (filter.selectedAgentId && agent.agentId !== filter.selectedAgentId) return false;
  if (filter.selectedSkill && agent.currentSkill !== filter.selectedSkill) return false;
  if (filter.selectedZoneId && agent.currentZoneId !== filter.selectedZoneId) return false;
  return true;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function FolderMapPanel({ zones, agents, filter, assets, onSelectZone }: FolderMapPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoneRectsRef = useRef<ZoneRect[]>([]);
  const positionRef = useRef<Map<string, AgentPoint>>(new Map());
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Auto-generate zones from agent data if none exist
  const effectiveZones = useMemo(() => {
    if (zones.length > 0) return zones;

    // Build zones from agents' currentZoneId
    const zoneMap = new Map<string, string[]>();
    for (const agent of agents) {
      const zId = agent.currentZoneId ?? "etc";
      if (!zoneMap.has(zId)) zoneMap.set(zId, []);
      zoneMap.get(zId)!.push(agent.agentId);
    }

    // If no agents either, show default zones
    if (zoneMap.size === 0) {
      return [
        { zoneId: "src", folderPrefix: "src", occupants: [] },
        { zoneId: "tests", folderPrefix: "tests", occupants: [] },
        { zoneId: "docs", folderPrefix: "docs", occupants: [] },
        { zoneId: "etc", folderPrefix: "etc", occupants: [] }
      ] as ZoneSnapshot[];
    }

    return [...zoneMap.entries()].map(([zoneId, occupants]) => ({
      zoneId,
      folderPrefix: zoneId,
      occupants
    })) as ZoneSnapshot[];
  }, [zones, agents]);

  const latestRef = useRef({ zones: effectiveZones, agents, filter, assets });
  latestRef.current = { zones: effectiveZones, agents, filter, assets };

  const wanderRef = useRef<Map<string, { x: number; y: number; tx: number; ty: number; nextUpdate: number }>>(new Map());

  const selectedZoneLabel = filter.selectedZoneId ? `구역: ${zoneLabel(filter.selectedZoneId)}` : "구역: 전체";

  // Ranch summary stats (computed from props)
  const ranchStats = useMemo(() => {
    const agentMap = new Map(agents.map(a => [a.agentId, a]));
    let activeZoneCount = 0;
    let totalFeed = 0;
    let harvestCount = 0;
    let warningCount = 0;

    for (const zone of effectiveZones) {
      const zoneAgents = zone.occupants.map(id => agentMap.get(id)).filter(Boolean) as AgentSnapshot[];
      if (zoneAgents.length > 0) activeZoneCount++;

      for (const a of zoneAgents) {
        totalFeed += a.totalTokensTotal ?? 0;
        if (a.growthStage === "harvest") harvestCount++;
        if (a.currentHookGate === "failed") warningCount++;
      }
    }

    const utilPercent = effectiveZones.length > 0 ? Math.round((activeZoneCount / effectiveZones.length) * 100) : 0;
    return { activeZoneCount, totalZones: effectiveZones.length, utilPercent, totalFeed, harvestCount, warningCount };
  }, [effectiveZones, agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;

    const render = () => {
      const { zones: activeZones, agents: activeAgents, filter: activeFilter, assets: activeAssets } = latestRef.current;
      const hasFilter = !!(activeFilter.selectedAgentId || activeFilter.selectedSkill || activeFilter.selectedZoneId);

      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(bounds.width));
      const height = Math.max(1, Math.floor(bounds.height));
      const dpr = window.devicePixelRatio || 1;

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#1A1008");
      gradient.addColorStop(1, "#2E1E0F");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const zoneCount = activeZones.length;
      let cols = 2;
      if (zoneCount <= 1) cols = 1;
      else if (zoneCount === 2) cols = (width > height) ? 2 : 1;
      else if (zoneCount <= 4) cols = 2;
      else cols = Math.min(4, Math.ceil(Math.sqrt(zoneCount * (width / height))));
      
      const rows = Math.ceil(zoneCount / cols);
      const gap = 12;
      const tileW = (width - gap * (cols + 1)) / cols;
      const tileH = (height - gap * (rows + 1)) / rows;

      zoneRectsRef.current = [];

      const drawQueue: DrawAgent[] = [];
      const visibleAgentIds = new Set<string>();
      const activeAgentMap = new Map(activeAgents.map((agent) => [agent.agentId, agent]));
      const totalAgentCount = activeAgents.length || 1;
      const now = performance.now() / 1000;

      for (let i = 0; i < activeZones.length; i += 1) {
        const zone = activeZones[i];
        const col = i % cols;
        const row = Math.floor(i / cols);

        const x = gap + col * (tileW + gap);
        const y = gap + row * (tileH + gap);
        const w = tileW;
        const h = tileH;
        const zoneMatched = !activeFilter.selectedZoneId || activeFilter.selectedZoneId === zone.zoneId;

        zoneRectsRef.current.push({ zoneId: zone.zoneId, x, y, w, h });

        const zoneAgents = zone.occupants
          .map((agentId) => activeAgentMap.get(agentId))
          .filter((agent): agent is AgentSnapshot => !!agent);

        const isEmpty = zoneAgents.length === 0;
        const hasFailed = zoneAgents.some(a => a.currentHookGate === "failed");
        const zoneFeed = zoneAgents.reduce((s, a) => s + (a.totalTokensTotal ?? 0), 0);

        // Tile background
        const tileImage = getImage(imageCacheRef.current, tileUrl(activeAssets, zone.zoneId));
        context.globalAlpha = (hasFilter && !zoneMatched) ? 0.28 : isEmpty ? 0.45 : 1;
        if (tileImage) {
          context.globalAlpha = isEmpty ? 0.35 : 0.88;
          context.drawImage(tileImage, x, y, w, h);
          context.globalAlpha = (hasFilter && !zoneMatched) ? 0.33 : 1;
        } else {
          context.fillStyle = ZONE_FALLBACK_COLORS[zone.zoneId] ?? ZONE_FALLBACK_COLORS.etc;
          context.fillRect(x, y, w, h);
        }

        // ── Decoration (Grass/Dirt) ──
        context.fillStyle = "rgba(0, 0, 0, 0.15)";
        const decorationCount = Math.floor((w * h) / 1000);
        for (let d = 0; d < decorationCount; d++) {
          const dx = x + ((d * 123456) % Math.floor(w - 10));
          const dy = y + ((d * 789012) % Math.floor(h - 10));
          context.beginPath();
          context.arc(dx, dy, 1, 0, Math.PI * 2);
          context.fill();
        }

        // Border — warning (red), selected (gold), or default
        if (hasFailed && zoneMatched) {
          context.strokeStyle = "rgba(224, 85, 69, 0.8)";
          context.lineWidth = 3;
          // Pulsing red border for failed gates
          const alertPulse = 0.5 + Math.sin(now * 4) * 0.3;
          context.globalAlpha = alertPulse;
          context.strokeRect(x + 1, y + 1, w - 2, h - 2);
          context.globalAlpha = 1;
        } else {
          context.strokeStyle = activeFilter.selectedZoneId === zone.zoneId ? "#F0B840" : "rgba(180, 130, 70, 0.4)";
          context.lineWidth = activeFilter.selectedZoneId === zone.zoneId ? 3 : 1.5;
          context.strokeRect(x + 1, y + 1, w - 2, h - 2);
        }

        // Zone icon + label (top-left)
        context.globalAlpha = isEmpty ? 0.5 : 1;
        const zoneIcon = getImage(imageCacheRef.current, iconUrl(activeAssets, zoneIconKey(zone.zoneId)));
        if (zoneIcon) {
          context.drawImage(zoneIcon, x + 6, y + 6, 18, 18);
        } else {
          context.font = "16px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          context.fillStyle = "rgba(255,255,255,0.9)";
          context.fillText(zoneEmoji(zone.zoneId), x + 6, y + 5);
        }
        context.font = "bold 13px 'JetBrains Mono', monospace";
        context.fillStyle = isEmpty ? "rgba(200, 180, 150, 0.5)" : "#F5E6C8";
        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillText(zoneLabel(zone.zoneId), x + 26, y + 7);

        // ── Zone stats overlay (bottom area) ──

        // Agent count
        context.font = "bold 12px 'JetBrains Mono', monospace";
        context.fillStyle = isEmpty ? "rgba(180, 160, 130, 0.4)" : "#F5E6C8";
        context.textAlign = "left";
        context.textBaseline = "bottom";
        context.fillText(`${zoneAgents.length}명`, x + 6, y + h - 20);

        // Activity gauge bar
        const barX = x + 6;
        const barY = y + h - 16;
        const barW = w - 12;
        const barH = 5;
        const ratio = zoneAgents.length / totalAgentCount;

        // Bar background
        context.fillStyle = "rgba(0, 0, 0, 0.4)";
        context.beginPath();
        context.roundRect(barX, barY, barW, barH, 2);
        context.fill();

        // Bar fill
        if (ratio > 0) {
          const barGrad = context.createLinearGradient(barX, barY, barX + barW * ratio, barY);
          barGrad.addColorStop(0, "rgba(90, 180, 70, 0.8)");
          barGrad.addColorStop(1, "rgba(240, 184, 64, 0.9)");
          context.fillStyle = barGrad;
          context.beginPath();
          context.roundRect(barX, barY, barW * ratio, barH, 2);
          context.fill();
        }

        // Feed amount
        context.font = "11px 'JetBrains Mono', monospace";
        context.fillStyle = isEmpty ? "rgba(180, 160, 130, 0.3)" : "rgba(240, 184, 64, 0.9)";
        context.textAlign = "right";
        context.textBaseline = "bottom";
        context.fillText(`🌾${formatTokens(zoneFeed)}`, x + w - 6, y + h - 4);

        // Empty zone overlay
        if (isEmpty) {
          context.fillStyle = "rgba(40, 30, 20, 0.4)";
          context.fillRect(x + 2, y + 2, w - 4, h - 4);
          context.font = "12px sans-serif";
          context.fillStyle = "rgba(180, 160, 130, 0.5)";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText("비어있음", x + w / 2, y + h / 2);
        }

        context.globalAlpha = 1;

        // ── Agent sprites ──
        const agentCols = Math.max(1, Math.floor((w - 24) / 24));

        for (let slot = 0; slot < zoneAgents.length; slot += 1) {
          const agent = zoneAgents[slot];
          
          // ── Wandering & Idle Logic ──
          let wander = wanderRef.current.get(agent.agentId);
          // Scale wander range based on tile size (stay within middle 70% of tile)
          const rangeX = (tileW - 40) * 0.45;
          const rangeY = (tileH - 60) * 0.45;

          if (!wander || now > wander.nextUpdate) {
            const rx = (Math.random() - 0.5) * rangeX * 2;
            const ry = (Math.random() - 0.5) * rangeY * 2;
            wander = {
              x: wander?.x ?? 0,
              y: wander?.y ?? 0,
              tx: rx,
              ty: ry,
              nextUpdate: now + 2 + Math.random() * 3
            };
            wanderRef.current.set(agent.agentId, wander);
          }
          // Smoothly move wander offset toward target wander
          wander.x += (wander.tx - wander.x) * 0.02;
          wander.y += (wander.ty - wander.y) * 0.02;

          // Base position is center of tile for more free-roaming feel
          const tx = x + w / 2 + wander.x;
          const ty = y + h / 2 + wander.y;

          const current = positionRef.current.get(agent.agentId) ?? { x: tx, y: ty };
          const fromX = current.x;
          const fromY = current.y;
          current.x += (tx - current.x) * 0.08;
          current.y += (ty - current.y) * 0.08;
          positionRef.current.set(agent.agentId, current);

          // Breathe/Idle bounce (pure visual Y offset)
          const bounce = Math.sin(now * 5 + seedFromAgent(agent.agentId)) * 2;

          drawQueue.push({
            agent,
            x: current.x - 10, // center correction for 20px sprite
            y: current.y - 10 + bounce,
            fromX,
            fromY,
            size: 20,
            pulseSeed: seedFromAgent(agent.agentId),
            matched: matchesAgent(agent, activeFilter)
          });
          visibleAgentIds.add(agent.agentId);
        }
      }

      // Clean up stale positions
      for (const agentId of [...positionRef.current.keys()]) {
        if (!visibleAgentIds.has(agentId)) {
          positionRef.current.delete(agentId);
        }
      }

      // Draw agents sorted by Y for depth
      drawQueue.sort((a, b) => a.y - b.y);

      for (const drawItem of drawQueue) {
        const { agent, x, y, fromX, fromY, size, pulseSeed, matched } = drawItem;
        const alpha = matched ? 1 : 0.25;
        context.globalAlpha = alpha;

        // Movement trail
        const movement = Math.hypot(x - fromX, y - fromY);
        if (movement > 0.1 && matched) {
          const trailGradient = context.createLinearGradient(fromX, fromY, x, y);
          trailGradient.addColorStop(0, "rgba(212, 134, 11, 0.06)");
          trailGradient.addColorStop(1, "rgba(212, 134, 11, 0.4)");
          context.strokeStyle = trailGradient;
          context.lineWidth = 2.5;
          context.beginPath();
          context.moveTo(fromX + size / 2, fromY + size / 2);
          context.lineTo(x + size / 2, y + size / 2);
          context.stroke();
        }

        const sprite =
          getImage(imageCacheRef.current, spriteUrl(activeAssets, agent.state)) ??
          getImage(imageCacheRef.current, iconUrl(activeAssets, teamIconKey(agent)));

        // Active pulse ring
        if (agent.state === "active" && matched) {
          const pulse = 0.55 + (Math.sin(now * 5 + pulseSeed) + 1) * 0.25;
          context.fillStyle = `rgba(124, 198, 110, ${pulse.toFixed(3)})`;
          context.beginPath();
          context.arc(x + size / 2, y + size / 2, size * 0.7, 0, Math.PI * 2);
          context.fill();
        }

        // Growth aura
        if (matched) {
          context.strokeStyle = growthAura(agent);
          context.lineWidth = 2;
          context.strokeRect(x - 3, y - 3, size + 6, size + 6);
        }

        // Gate aura
        const aura = gateAura(agent.currentHookGate);
        if (aura && matched) {
          context.strokeStyle = aura;
          context.lineWidth = 1.8;
          context.strokeRect(x - 2, y - 2, size + 4, size + 4);
        }

        // Sprite or fallback
        if (sprite) {
          context.drawImage(sprite, x, y, size, size);
        } else {
          context.fillStyle = agent.state === "active" ? "#7CC66E" : "#A89478";
          context.beginPath();
          context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          context.fill();
          context.font = "14px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = "#1A1008";
          context.fillText(teamEmoji(agent), x + size / 2, y + size / 2 + 1);
        }

        // Selection ring
        context.strokeStyle = activeFilter.selectedAgentId === agent.agentId ? "#F0B840" : "rgba(74, 52, 34, 0.6)";
        context.lineWidth = activeFilter.selectedAgentId === agent.agentId ? 2.5 : 1;
        context.strokeRect(x - 1, y - 1, size + 2, size + 2);

        // Gate badge
        const gate = getImage(imageCacheRef.current, iconUrl(activeAssets, gateIconKey(agent.currentHookGate)));
        if (gate) {
          context.drawImage(gate, x + size - 8, y - 6, 10, 10);
        } else {
          context.font = "12px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          context.fillStyle = "#F5E6C8";
          context.fillText(gateEmoji(agent.currentHookGate), x + size - 8, y - 6);
        }
        context.globalAlpha = 1;
      }

      canvas.title = selectedZoneLabel;
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [selectedZoneLabel]);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const hit = zoneRectsRef.current.find((zoneRect) => {
      return x >= zoneRect.x && x <= zoneRect.x + zoneRect.w && y >= zoneRect.y && y <= zoneRect.y + zoneRect.h;
    });

    if (!hit) return;
    onSelectZone(filter.selectedZoneId === hit.zoneId ? null : hit.zoneId);
  };

  return (
    <div className="panel-body ranch-map-container">
      <canvas ref={canvasRef} className="zone-canvas" onClick={onCanvasClick} />
      <div className="ranch-summary">
        <span className="ranch-stat">
          🏠 구역 활용 <strong>{ranchStats.activeZoneCount}/{ranchStats.totalZones}</strong> ({ranchStats.utilPercent}%)
        </span>
        <span className="ranch-stat">
          🧺 수확 가능 <strong>{ranchStats.harvestCount}</strong>마리
        </span>
        {ranchStats.warningCount > 0 && (
          <span className="ranch-stat ranch-warning">
            ⚠️ 경고 <strong>{ranchStats.warningCount}</strong>건
          </span>
        )}
        <span className="ranch-stat">
          🌾 총 사료 <strong>{formatTokens(ranchStats.totalFeed)}</strong>
        </span>
      </div>
    </div>
  );
}
