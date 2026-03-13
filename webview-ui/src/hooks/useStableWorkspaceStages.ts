import { useEffect, useRef, useState } from "react";

import type { AgentSnapshot } from "@shared/domain";
import { workspaceStageForAgent, workspaceStageRank, type WorkspaceStageId } from "../world/workspaceStages";

const STAGE_SETTLE_MS = 2000;

interface PendingStageTransition {
  nextStage: WorkspaceStageId;
  since: number;
}

function mapsEqual(left: Record<string, WorkspaceStageId>, right: Record<string, WorkspaceStageId>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

export function useStableWorkspaceStages(agents: AgentSnapshot[]): Record<string, WorkspaceStageId> {
  const pendingRef = useRef<Record<string, PendingStageTransition>>({});
  const timeoutRef = useRef<number | null>(null);
  const [clock, setClock] = useState(0);
  const [stableStages, setStableStages] = useState<Record<string, WorkspaceStageId>>({});

  useEffect(() => {
    const now = Date.now();
    let nextDelayMs: number | null = null;

    setStableStages((previous) => {
      const next: Record<string, WorkspaceStageId> = {};
      const nextPending: Record<string, PendingStageTransition> = {};

      for (const agent of agents) {
        const currentStage = workspaceStageForAgent(agent);
        const stableStage = previous[agent.agentId] ?? currentStage;
        const pending = pendingRef.current[agent.agentId];
        const stableRank = workspaceStageRank(stableStage);
        const currentRank = workspaceStageRank(currentStage);
        const allowReset =
          stableStage === "delivery" &&
          currentStage === "kickoff" &&
          agent.state !== "completed" &&
          (agent.currentSkill === "read" || agent.currentSkill === "search" || agent.currentSkill === null);

        if (stableStage === currentStage) {
          next[agent.agentId] = currentStage;
          continue;
        }

        if (currentRank < stableRank && !allowReset) {
          next[agent.agentId] = stableStage;
          continue;
        }

        if (pending && pending.nextStage === currentStage) {
          const elapsed = now - pending.since;
          if (elapsed >= STAGE_SETTLE_MS) {
            next[agent.agentId] = currentStage;
            continue;
          }

          next[agent.agentId] = stableStage;
          nextPending[agent.agentId] = pending;
          const remaining = STAGE_SETTLE_MS - elapsed;
          nextDelayMs = nextDelayMs === null ? remaining : Math.min(nextDelayMs, remaining);
          continue;
        }

        next[agent.agentId] = stableStage;
        nextPending[agent.agentId] = { nextStage: currentStage, since: now };
        nextDelayMs = nextDelayMs === null ? STAGE_SETTLE_MS : Math.min(nextDelayMs, STAGE_SETTLE_MS);
      }

      pendingRef.current = nextPending;
      return mapsEqual(previous, next) ? previous : next;
    });

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (nextDelayMs !== null) {
      timeoutRef.current = window.setTimeout(() => {
        setClock((value) => value + 1);
      }, nextDelayMs + 24);
    }

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [agents, clock]);

  return stableStages;
}
