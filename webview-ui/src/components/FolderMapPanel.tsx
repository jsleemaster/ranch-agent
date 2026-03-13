import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";

import type { WebviewAssetCatalog } from "@shared/assets";
import type { AgentSnapshot, ZoneSnapshot } from "@shared/domain";
import {
  agentAvatarEmoji,
  iconUrl,
  railFrontIconUrl,
  railSideSpriteUrl,
  railStageBackgroundUrl,
  teamEmoji,
  teamIconKey
} from "../world/iconKeys";
import { RAIL_SECTIONS, railSectionForAgent, railTrackForAgent, type RailSectionId, type RailTrackId } from "../world/railRoute";
import IconToken from "./IconToken";

interface FolderMapPanelProps {
  zones: ZoneSnapshot[];
  agents: AgentSnapshot[];
  assets: WebviewAssetCatalog;
  isMinimap?: boolean;
}

interface RailTrackMeta {
  id: RailTrackId;
  label: string;
  topPercent: number;
  leftPercent: number;
  rightPercent: number;
}

interface TrainLaneAssignment {
  sectionId: RailSectionId;
  sectionIndex: number;
  track: RailTrackId;
  slotIndex: number;
  leftOffsetPx: number;
  topPercent: number;
}

interface AnimatedTrainViewModel {
  agentId: string;
  sectionId: RailSectionId;
  sectionIndex: number;
  track: RailTrackId;
  direction: "forward" | "reverse";
  phase: "dwell" | "travel" | "arrive-pulse";
  phaseStartedAt: number;
  phaseDurationMs: number;
  lane: TrainLaneAssignment;
}

const TRACKS: RailTrackMeta[] = [
  { id: "main-a", label: "본선 A", topPercent: 36, leftPercent: 10, rightPercent: 8 },
  { id: "main-b", label: "본선 B", topPercent: 54, leftPercent: 8, rightPercent: 10 },
  { id: "depot", label: "회송/대기선", topPercent: 72, leftPercent: 14, rightPercent: 16 }
];

const TRACK_META_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));
const SECTION_X_PERCENT = [7, 18, 31, 47, 63, 79, 93];
const SLOT_OFFSETS_PX = [0, -42, -84];
const TRAVEL_MS = 1200;
const DWELL_MS = 1400;
const ARRIVE_PULSE_MS = 350;
const MAX_VISIBLE_PER_SECTION_TRACK = 3;

function trackMetaFor(trackId: RailTrackId): RailTrackMeta {
  return TRACK_META_BY_ID.get(trackId) ?? TRACKS[0];
}

function laneFor(sectionIndex: number, slotIndex: number, track: RailTrackId): TrainLaneAssignment {
  const trackMeta = trackMetaFor(track);
  return {
    sectionId: RAIL_SECTIONS[sectionIndex]?.id ?? "idle",
    sectionIndex,
    track,
    slotIndex,
    leftOffsetPx: SLOT_OFFSETS_PX[slotIndex] ?? SLOT_OFFSETS_PX[SLOT_OFFSETS_PX.length - 1] ?? 0,
    topPercent: trackMeta.topPercent
  };
}

function trainPositionStyle(train: AnimatedTrainViewModel): CSSProperties {
  const leftPercent = SECTION_X_PERCENT[train.sectionIndex] ?? SECTION_X_PERCENT[0];
  return {
    left: `calc(${leftPercent}% + ${train.lane.leftOffsetPx}px)`,
    top: `${train.lane.topPercent}%`,
    ["--travel-ms" as string]: `${TRAVEL_MS}ms`
  };
}

function sectionLabel(sectionId: RailSectionId): string {
  return RAIL_SECTIONS.find((section) => section.id === sectionId)?.label ?? "대기";
}

function RailStageSprite({
  src,
  direction
}: {
  src: string;
  direction: AnimatedTrainViewModel["direction"];
}): JSX.Element {
  return <img className={`rail-stage-train-sprite direction-${direction}`} src={src} alt="" loading="lazy" />;
}

function shouldShowDisembarkEffect(train: AnimatedTrainViewModel): boolean {
  return (train.sectionId === "execute" || train.sectionId === "verify") && train.phase !== "travel";
}

function shouldShowWorklight(train: AnimatedTrainViewModel): boolean {
  return (train.sectionId === "explore" || train.sectionId === "maintain") && train.phase !== "travel";
}

function shouldShowSignalPulse(train: AnimatedTrainViewModel): boolean {
  return train.sectionId === "report" && train.phase !== "travel";
}

function DisembarkEffect({
  agentId
}: {
  agentId: string;
}): JSX.Element {
  const seed = Array.from(agentId).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const offsets = [-30, -10, 10, 30].map((base, index) => base + ((seed + index * 5) % 6) - 3);
  return (
    <div className="rail-stage-disembark">
      {offsets.map((offset, index) => (
        <span
          key={`${agentId}-${index}`}
          className={`rail-stage-passenger passenger-${index + 1}`}
          style={{ ["--passenger-offset" as string]: `${offset}px`, ["--passenger-delay" as string]: `${index * 110}ms` }}
        />
      ))}
    </div>
  );
}

function WorklightEffect(): JSX.Element {
  return <div className="rail-stage-worklight" />;
}

function SignalPulse(): JSX.Element {
  return <div className="rail-stage-signal-pulse" />;
}

export default function FolderMapPanel({
  zones: _zones,
  agents,
  assets,
  isMinimap = false
}: FolderMapPanelProps): JSX.Element {
  const timerRef = useRef<Record<string, number[]>>({});
  const [animatedTrains, setAnimatedTrains] = useState<Record<string, AnimatedTrainViewModel>>({});

  const orderedAgents = useMemo(() => {
    return [...agents].sort((a, b) => b.lastEventTs - a.lastEventTs);
  }, [agents]);

  const agentById = useMemo(() => {
    return new Map(orderedAgents.map((agent) => [agent.agentId, agent]));
  }, [orderedAgents]);

  useEffect(() => {
    return () => {
      Object.values(timerRef.current)
        .flat()
        .forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  useEffect(() => {
    const scheduled: Array<() => void> = [];

    setAnimatedTrains((current) => {
      const next: Record<string, AnimatedTrainViewModel> = {};
      const now = Date.now();
      const occupancy = new Map<string, number>();

      for (const agent of orderedAgents) {
        const targetSectionId = railSectionForAgent(agent);
        const targetSectionIndex = RAIL_SECTIONS.findIndex((section) => section.id === targetSectionId);
        const targetTrack = railTrackForAgent(agent);
        const occupancyKey = `${targetTrack}:${targetSectionId}`;
        const slotIndex = occupancy.get(occupancyKey) ?? 0;
        occupancy.set(occupancyKey, slotIndex + 1);
        const lane = laneFor(targetSectionIndex, slotIndex, targetTrack);
        const existing = current[agent.agentId];

        if (!existing) {
          next[agent.agentId] = {
            agentId: agent.agentId,
            sectionId: targetSectionId,
            sectionIndex: targetSectionIndex,
            track: targetTrack,
            direction: "forward",
            phase: "dwell",
            phaseStartedAt: now,
            phaseDurationMs: DWELL_MS,
            lane
          };
          continue;
        }

        const moved = existing.sectionId !== targetSectionId || existing.track !== targetTrack;
        const direction: AnimatedTrainViewModel["direction"] =
          targetSectionIndex >= existing.sectionIndex ? "forward" : "reverse";

        if (!moved) {
          next[agent.agentId] = {
            ...existing,
            sectionId: targetSectionId,
            sectionIndex: targetSectionIndex,
            track: targetTrack,
            direction,
            lane
          };
          continue;
        }

        timerRef.current[agent.agentId]?.forEach((timerId) => window.clearTimeout(timerId));
        timerRef.current[agent.agentId] = [];

        next[agent.agentId] = {
          agentId: agent.agentId,
          sectionId: targetSectionId,
          sectionIndex: targetSectionIndex,
          track: targetTrack,
          direction,
          phase: "travel",
          phaseStartedAt: now,
          phaseDurationMs: TRAVEL_MS,
          lane
        };

        scheduled.push(() => {
          const arriveTimer = window.setTimeout(() => {
            setAnimatedTrains((prev) => {
              const candidate = prev[agent.agentId];
              if (!candidate || candidate.sectionId !== targetSectionId || candidate.track !== targetTrack) {
                return prev;
              }
              return {
                ...prev,
                [agent.agentId]: {
                  ...candidate,
                  phase: "arrive-pulse",
                  phaseStartedAt: Date.now(),
                  phaseDurationMs: ARRIVE_PULSE_MS
                }
              };
            });
          }, TRAVEL_MS);

          const dwellTimer = window.setTimeout(() => {
            setAnimatedTrains((prev) => {
              const candidate = prev[agent.agentId];
              if (!candidate || candidate.sectionId !== targetSectionId || candidate.track !== targetTrack) {
                return prev;
              }
              return {
                ...prev,
                [agent.agentId]: {
                  ...candidate,
                  phase: "dwell",
                  phaseStartedAt: Date.now(),
                  phaseDurationMs: DWELL_MS
                }
              };
            });
          }, TRAVEL_MS + ARRIVE_PULSE_MS);

          timerRef.current[agent.agentId] = [arriveTimer, dwellTimer];
        });
      }

      for (const agentId of Object.keys(current)) {
        if (!agentById.has(agentId)) {
          timerRef.current[agentId]?.forEach((timerId) => window.clearTimeout(timerId));
          delete timerRef.current[agentId];
        }
      }

      return next;
    });

    scheduled.forEach((schedule) => schedule());
  }, [agentById, orderedAgents]);

  const stageBackground = railStageBackgroundUrl(assets);

  const renderedTrains = useMemo(() => {
    return Object.values(animatedTrains)
      .map((train) => {
        const agent = agentById.get(train.agentId);
        if (!agent) {
          return null;
        }
        return { train, agent };
      })
      .filter((value): value is { train: AnimatedTrainViewModel; agent: AgentSnapshot } => !!value)
      .sort((a, b) => b.agent.lastEventTs - a.agent.lastEventTs);
  }, [agentById, animatedTrains]);

  const visibleTrains = useMemo(() => {
    return renderedTrains.filter(({ train }) => train.lane.slotIndex < MAX_VISIBLE_PER_SECTION_TRACK);
  }, [renderedTrains]);

  const overflowChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { train } of renderedTrains) {
      const key = `${train.track}:${train.sectionId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const overflow: Array<{ key: string; track: RailTrackId; sectionId: RailSectionId; count: number }> = [];
    for (const [key, count] of counts.entries()) {
      if (count <= MAX_VISIBLE_PER_SECTION_TRACK) {
        continue;
      }
      const [track, sectionId] = key.split(":") as [RailTrackId, RailSectionId];
      overflow.push({
        key,
        track,
        sectionId,
        count: count - MAX_VISIBLE_PER_SECTION_TRACK
      });
    }
    return overflow;
  }, [renderedTrains]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<RailSectionId, number>();
    for (const section of RAIL_SECTIONS) {
      counts.set(section.id, 0);
    }
    for (const agent of orderedAgents) {
      const sectionId = railSectionForAgent(agent);
      counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
    }
    return counts;
  }, [orderedAgents]);

  return (
    <div className={`rail-stage ${isMinimap ? "minimap-mode" : "stage-mode"} stage-v3`}>
      {stageBackground ? (
        <div
          className="rail-stage-backplate has-custom-bg"
          style={{ backgroundImage: `url(${stageBackground})` }}
          aria-hidden="true"
        />
      ) : null}
      <div className="rail-stage-veil" />
      <div className="rail-stage-glow" />

      <div className="rail-stage-track-labels" aria-hidden="true">
        {TRACKS.map((track) => (
          <span key={track.id} className={`rail-stage-track-label track-${track.id}`} style={{ top: `${track.topPercent - 8}%` }}>
            {track.label}
          </span>
        ))}
      </div>

      <div className="rail-stage-tracks" aria-hidden="true">
        {TRACKS.map((track) => (
          <div
            key={track.id}
            className={`rail-stage-track-line track-${track.id}`}
            style={{
              top: `${track.topPercent}%`,
              left: `${track.leftPercent}%`,
              right: `${track.rightPercent}%`
            }}
          />
        ))}
      </div>

      {RAIL_SECTIONS.map((section, index) => {
        const style = { ["--section-index" as string]: index, left: `${SECTION_X_PERCENT[index] ?? SECTION_X_PERCENT[0]}%` } as CSSProperties;
        const sectionCount = sectionCounts.get(section.id) ?? 0;

        return (
          <div key={section.id} className={`rail-stage-section section-${section.id}`} style={style}>
            <div className="rail-stage-section-label">{section.label}</div>
            <div className="rail-stage-section-node">{section.glyph}</div>
            {sectionCount > 0 ? <div className="rail-stage-section-count">{sectionCount}</div> : null}
          </div>
        );
      })}

      {overflowChips.map((overflow) => {
        const sectionIndex = RAIL_SECTIONS.findIndex((section) => section.id === overflow.sectionId);
        const topPercent = trackMetaFor(overflow.track).topPercent;
        const leftPercent = SECTION_X_PERCENT[sectionIndex] ?? SECTION_X_PERCENT[0];
        return (
          <div
            key={overflow.key}
            className="rail-stage-overflow-chip"
            style={{ left: `calc(${leftPercent}% + 26px)`, top: `${topPercent - 3}%` }}
            title={`${sectionLabel(overflow.sectionId)} 구간 추가 편성 ${overflow.count}개`}
          >
            +{overflow.count}
          </div>
        );
      })}

      <div className="rail-stage-train-layer" aria-hidden="true">
        {visibleTrains.map(({ train, agent }) => {
          const teamIcon = iconUrl(assets, teamIconKey(agent));
          const frontIcon = railFrontIconUrl(assets, agent) ?? teamIcon;
          const sideSprite = railSideSpriteUrl(assets, agent);
          const hasRailFrontIcon = Boolean(frontIcon && frontIcon !== teamIcon);

          return (
            <div
              key={agent.agentId}
              className={`rail-stage-train ${agent.state} phase-${train.phase} track-${train.track} ${sideSprite ? "has-side-sprite" : ""}`.trim()}
              style={trainPositionStyle(train)}
              title={`${agent.displayName}\n원본 ID: ${agent.rawShortId}\n현재 구간: ${sectionLabel(train.sectionId)}\n선로: ${trackMetaFor(train.track).label}`}
            >
              {sideSprite ? (
                <>
                  <RailStageSprite src={sideSprite} direction={train.direction} />
                  {shouldShowWorklight(train) ? <WorklightEffect /> : null}
                  {shouldShowDisembarkEffect(train) ? <DisembarkEffect agentId={agent.agentId} /> : null}
                  {shouldShowSignalPulse(train) ? <SignalPulse /> : null}
                </>
              ) : (
                <IconToken
                  src={frontIcon}
                  fallback={agentAvatarEmoji(agent) || teamEmoji(agent)}
                  title={agent.displayName}
                  className="rail-stage-train-icon"
                  autoTrim={true}
                  minAutoScale={2.6}
                  maxAutoScale={7}
                  backgroundFloodTrim={false}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
