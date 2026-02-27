# Runtime Timing Metrics (Backend-Only)

This document describes the timing metrics derived in the extension host.
No UI rendering is required for these fields; they are computed in domain logic
and attached to `AgentSnapshot` and `FeedEvent`.

## Scope

- Source: `Claude JSONL` runtime events
- Processing point: `extension/src/domain/snapshotStore.ts`
- Output contracts:
  - `shared/domain.ts` -> `AgentSnapshot`
  - `shared/domain.ts` -> `FeedEvent`

## Waiting Time

Waiting time tracks how long an agent stays in a waiting state before work
resumes.

- Wait start events:
  - `permission_wait` -> wait kind `permission`
  - `turn_waiting` -> wait kind `turn`
- Wait end events:
  - `tool_start`
  - `turn_active`
- Duration formula:
  - `waitDurationMs = max(0, waitEndTs - waitStartTs)`

### AgentSnapshot fields

- `waitTotalMs`: cumulative wait duration (all kinds)
- `waitCount`: number of completed wait intervals
- `waitAvgMs`: rounded average (`waitTotalMs / waitCount`)
- `lastWaitMs`: last completed wait interval
- `permissionWaitTotalMs`, `permissionWaitCount`
- `turnWaitTotalMs`, `turnWaitCount`

### FeedEvent fields

- `waitDurationMs`: populated only when a wait interval closes
- `waitKind`: `"permission"` or `"turn"`

## Tool Run Duration

Tool run duration tracks the elapsed time between `tool_start` and `tool_done`.

- Start event: `tool_start`
- End event: `tool_done`
- Match strategy:
  1. `toolId` exact match
  2. fallback `toolName` match (normalized lowercase)
  3. fallback oldest pending start for that agent (FIFO)
- Duration formula:
  - `toolRunDurationMs = max(0, toolDoneTs - toolStartTs)`

### AgentSnapshot fields

- `toolRunTotalMs`: cumulative tool runtime
- `toolRunCount`: number of completed tool intervals
- `toolRunAvgMs`: rounded average (`toolRunTotalMs / toolRunCount`)
- `lastToolRunMs`: last completed tool interval

### FeedEvent fields

- `toolRunDurationMs`: populated only on matched `tool_done`

## Guardrails

- Negative/invalid durations are clamped to `0`.
- Pending tool starts are bounded per agent (`MAX_PENDING_TOOL_STARTS`) to avoid
  unbounded memory usage when done events are missing.
- Metrics are session-memory only (not persisted).

