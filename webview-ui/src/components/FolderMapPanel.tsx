import React, { useEffect, useRef } from "react";

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
  apps: "#4F6B37",
  packages: "#7A5F2A",
  infra: "#5A4B3A",
  scripts: "#3E5D44",
  docs: "#5D6B42",
  tests: "#5A4C47",
  etc: "#505050"
};

function getImage(cache: Map<string, HTMLImageElement>, url: string | undefined): HTMLImageElement | null {
  if (!url) {
    return null;
  }
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
  if (gate === "failed") {
    return "rgba(255, 84, 97, 0.55)";
  }
  if (gate === "blocked") {
    return "rgba(255, 194, 94, 0.55)";
  }
  if (gate === "open") {
    return "rgba(118, 241, 152, 0.45)";
  }
  return null;
}

function growthAura(agent: AgentSnapshot): string {
  if (agent.growthStage === "harvest") {
    return "rgba(255, 221, 120, 0.55)";
  }
  if (agent.growthStage === "grow") {
    return "rgba(165, 240, 128, 0.45)";
  }
  if (agent.growthStage === "sprout") {
    return "rgba(118, 226, 139, 0.35)";
  }
  return "rgba(122, 159, 122, 0.2)";
}

function matchesAgent(agent: AgentSnapshot, filter: FilterState): boolean {
  if (filter.selectedAgentId && agent.agentId !== filter.selectedAgentId) {
    return false;
  }
  if (filter.selectedSkill && agent.currentSkill !== filter.selectedSkill) {
    return false;
  }
  if (filter.selectedZoneId && agent.currentZoneId !== filter.selectedZoneId) {
    return false;
  }
  return true;
}

export default function FolderMapPanel({ zones, agents, filter, assets, onSelectZone }: FolderMapPanelProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const zoneRectsRef = useRef<ZoneRect[]>([]);
  const positionRef = useRef<Map<string, AgentPoint>>(new Map());
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const latestRef = useRef({ zones, agents, filter, assets });
  latestRef.current = { zones, agents, filter, assets };

  const selectedZoneLabel = filter.selectedZoneId ? `구역: ${zoneLabel(filter.selectedZoneId)}` : "구역: 전체";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

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
      gradient.addColorStop(0, "#1D2718");
      gradient.addColorStop(1, "#2A1F16");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const cols = 4;
      const gap = 10;
      const rows = Math.max(1, Math.ceil(activeZones.length / cols));
      const tileW = (width - gap * (cols + 1)) / cols;
      const tileH = (height - gap * (rows + 1)) / rows;

      zoneRectsRef.current = [];

      const drawQueue: DrawAgent[] = [];
      const visibleAgentIds = new Set<string>();
      const activeAgentMap = new Map(activeAgents.map((agent) => [agent.agentId, agent]));
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

        const tileImage = getImage(imageCacheRef.current, tileUrl(activeAssets, zone.zoneId));
        context.globalAlpha = hasFilter && !zoneMatched ? 0.28 : 1;
        if (tileImage) {
          context.globalAlpha = 0.88;
          context.drawImage(tileImage, x, y, w, h);
          context.globalAlpha = hasFilter && !zoneMatched ? 0.33 : 1;
        } else {
          context.fillStyle = ZONE_FALLBACK_COLORS[zone.zoneId] ?? ZONE_FALLBACK_COLORS.etc;
          context.fillRect(x, y, w, h);
          context.fillStyle = "rgba(255,255,255,0.08)";
          context.fillRect(x + 2, y + 2, w - 4, 3);
        }

        context.strokeStyle = activeFilter.selectedZoneId === zone.zoneId ? "#FFE16E" : "rgba(210,230,250,0.3)";
        context.lineWidth = activeFilter.selectedZoneId === zone.zoneId ? 3 : 1.5;
        context.strokeRect(x + 1, y + 1, w - 2, h - 2);

        const zoneIcon = getImage(imageCacheRef.current, iconUrl(activeAssets, zoneIconKey(zone.zoneId)));
        if (zoneIcon) {
          context.drawImage(zoneIcon, x + 6, y + 6, 18, 18);
        } else {
          context.font = "16px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          context.fillStyle = "rgba(255,255,255,0.9)";
          context.fillText(zoneEmoji(zone.zoneId), x + 6, y + 4);
          context.font = "10px sans-serif";
          context.fillStyle = "rgba(242,246,236,0.86)";
          context.fillText(zoneLabel(zone.zoneId), x + 26, y + 8);
        }

        const zoneAgents = zone.occupants
          .map((agentId) => activeAgentMap.get(agentId))
          .filter((agent): agent is AgentSnapshot => !!agent);

        const agentCols = Math.max(1, Math.floor((w - 24) / 24));

        for (let slot = 0; slot < zoneAgents.length; slot += 1) {
          const agent = zoneAgents[slot];
          const tx = x + 12 + (slot % agentCols) * 22;
          const ty = y + 30 + Math.floor(slot / agentCols) * 22;

          const current = positionRef.current.get(agent.agentId) ?? { x: tx, y: ty };
          const fromX = current.x;
          const fromY = current.y;
          current.x += (tx - current.x) * 0.2;
          current.y += (ty - current.y) * 0.2;
          positionRef.current.set(agent.agentId, current);

          drawQueue.push({
            agent,
            x: current.x,
            y: current.y,
            fromX,
            fromY,
            size: 20,
            pulseSeed: seedFromAgent(agent.agentId),
            matched: matchesAgent(agent, activeFilter)
          });
          visibleAgentIds.add(agent.agentId);
        }
      }

      for (const agentId of [...positionRef.current.keys()]) {
        if (!visibleAgentIds.has(agentId)) {
          positionRef.current.delete(agentId);
        }
      }

      drawQueue.sort((a, b) => a.y - b.y);

      for (const drawItem of drawQueue) {
        const { agent, x, y, fromX, fromY, size, pulseSeed, matched } = drawItem;
        const alpha = matched ? 1 : 0.25;
        context.globalAlpha = alpha;

        const movement = Math.hypot(x - fromX, y - fromY);
        if (movement > 0.1 && matched) {
          const trailGradient = context.createLinearGradient(fromX, fromY, x, y);
          trailGradient.addColorStop(0, "rgba(110, 186, 245, 0.06)");
          trailGradient.addColorStop(1, "rgba(110, 186, 245, 0.45)");
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

        if (agent.state === "active" && matched) {
          const pulse = 0.55 + (Math.sin(now * 5 + pulseSeed) + 1) * 0.25;
          context.fillStyle = `rgba(118, 241, 152, ${pulse.toFixed(3)})`;
          context.beginPath();
          context.arc(x + size / 2, y + size / 2, size * 0.7, 0, Math.PI * 2);
          context.fill();
        }

        if (matched) {
          context.strokeStyle = growthAura(agent);
          context.lineWidth = 2;
          context.strokeRect(x - 3, y - 3, size + 6, size + 6);
        }

        const aura = gateAura(agent.currentHookGate);
        if (aura && matched) {
          context.strokeStyle = aura;
          context.lineWidth = 1.8;
          context.strokeRect(x - 2, y - 2, size + 4, size + 4);
        }

        if (sprite) {
          context.drawImage(sprite, x, y, size, size);
        } else {
          context.fillStyle = agent.state === "active" ? "#89E89D" : "#B0BAC7";
          context.beginPath();
          context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
          context.fill();
          context.font = "12px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillStyle = "#1D2D1F";
          context.fillText(teamEmoji(agent), x + size / 2, y + size / 2 + 1);
        }

        context.strokeStyle = activeFilter.selectedAgentId === agent.agentId ? "#FFE16E" : "rgba(20,30,40,0.5)";
        context.lineWidth = activeFilter.selectedAgentId === agent.agentId ? 2.5 : 1;
        context.strokeRect(x - 1, y - 1, size + 2, size + 2);

        const gate = getImage(imageCacheRef.current, iconUrl(activeAssets, gateIconKey(agent.currentHookGate)));
        if (gate) {
          context.drawImage(gate, x + size - 8, y - 6, 10, 10);
        } else {
          context.font = "10px sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          context.fillStyle = "#f7f7f7";
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
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const hit = zoneRectsRef.current.find((zoneRect) => {
      return x >= zoneRect.x && x <= zoneRect.x + zoneRect.w && y >= zoneRect.y && y <= zoneRect.y + zoneRect.h;
    });

    if (!hit) {
      return;
    }

    onSelectZone(filter.selectedZoneId === hit.zoneId ? null : hit.zoneId);
  };

  return (
    <div className="panel-body folder-map">
      <canvas ref={canvasRef} className="zone-canvas" onClick={onCanvasClick} />
      <div className="canvas-note">{selectedZoneLabel}</div>
    </div>
  );
}
