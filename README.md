# Ranch-Agent

Premium rail control room for visualizing Claude multi-agent runtime activity inside VS Code.

![Ranch-Agent Dashboard](./docs/images/ranch-agent-main.png)

> Hero image path: `docs/images/ranch-agent-main.png`

## Overview

Ranch-Agent watches Claude runtime events and renders them as a live rail-control dashboard.
The current UI theme is inspired by premium autonomous metropolitan rail operations: a control board, line control, trip archive, route minimap, and control log.

Core runtime sources:

- Claude JSONL transcripts (primary source of truth)
- Claude HTTP hooks (optional supplemental input)
- Claude `statusLine` stdin snapshots (optional session/context/cost overlay)

## What You See

- `관제 보드`: active formations, role badges, throughput
- `노선 관제`: per-lineage live stage, gate state, and budget strip
- `운행 기록`: finished / rotated sessions with duration, throughput, and cost
- `노선 미니맵`: simplified 5-stop route (`대기`, `탐색`, `정비`, `실행`, `보고`)
- `관제 로그`: recent runtime events and session rollover history

## Runtime Model

- `agentRuntimeId` = stable lineage ID used for on-screen identity
- `sessionRuntimeId` = actual Claude session / rollover identity
- JSONL remains the source of truth for tool activity and per-agent history
- statusLine is only used to enrich the current main-line session with:
  - context usage
  - trip throughput
  - operating cost

## Features

- Near real-time Claude JSONL observation
- Multi-session lineage handling
- Session archive with rollover detection
- Runtime signal aggregation (`운행 조정`, `외부 설비`, `신호 누락`, `운행 안내`)
- `.claude/agents/*.md` and skill usage tracking
- Optional HTTP hooks receiver
- Optional Claude statusLine bridge with `claude-hud` fan-out wrapper
- Local debug NDJSON logging under VS Code global storage

## Installation

### Development install

Prerequisites:

- Node.js 18+
- npm 9+
- VS Code 1.90+

```bash
npm --prefix webview-ui install
npm --prefix extension install
npm run build
```

### VSIX install

```bash
npm run build
cd extension
npx @vscode/vsce package
```

Then install the generated `.vsix` from VS Code.

## Quick Start

### Extension Development Host

1. Open this repository in VS Code.
2. Run `Run Ranch-Agent` from Run and Debug.
3. In the Extension Development Host, open `Ranch-Agent: Focus Control Room`.
4. Confirm the bottom panel shows the control room.

### Main VS Code local loop

```bash
npm run dev:main-vscode
```

### Typical Claude workflow

1. Open your target workspace in VS Code.
2. Start Claude Code in that workspace terminal.
3. Run tasks or agent teams.
4. Open `Ranch-Agent: Focus Control Room`.
5. Watch live activity stream into the control room.

If auto-discovery misses the intended file, set `expeditionSituationRoom.runtimeJsonlPath` manually.

## Configuration

All settings stay under `expeditionSituationRoom.*` for compatibility.

### JSONL runtime input

```json
{
  "expeditionSituationRoom.runtimeJsonlPath": "/absolute/path/to/session.jsonl"
}
```

### HTTP hooks input (optional)

```json
{
  "expeditionSituationRoom.httpHook.enabled": true,
  "expeditionSituationRoom.httpHook.bind": "127.0.0.1",
  "expeditionSituationRoom.httpHook.port": 48216,
  "expeditionSituationRoom.httpHook.path": "/ranch-hook",
  "expeditionSituationRoom.httpHook.authToken": "",
  "expeditionSituationRoom.httpHook.mergeMode": "jsonl_primary"
}
```

Detailed guide: [docs/HTTP_HOOKS.md](./docs/HTTP_HOOKS.md)

### Claude statusLine bridge (optional)

Enable the local receiver:

```json
{
  "expeditionSituationRoom.statusline.enabled": true,
  "expeditionSituationRoom.statusline.bind": "127.0.0.1",
  "expeditionSituationRoom.statusline.port": 48217,
  "expeditionSituationRoom.statusline.path": "/ranch-statusline",
  "expeditionSituationRoom.statusline.authToken": "",
  "expeditionSituationRoom.statusline.rawLog.enabled": false,
  "expeditionSituationRoom.statusline.rawLog.filePath": ".local-debug/statusline-events.ndjson",
  "expeditionSituationRoom.statusline.rawLog.relativeBase": "global"
}
```

Recommended flow:

1. Enable `expeditionSituationRoom.statusline.enabled`
2. Run `Ranch-Agent: Copy Claude StatusLine Setup`
3. Paste the copied `statusLine` block into `.claude/settings.json` or `.claude/settings.local.json`
4. Restart Claude

Notes:

- The current bridge reads only what Claude actually sends via `statusLine.command` stdin
- Current UI uses `노선 점유율`, `회차 처리량`, and `운영비`
- A fan-out wrapper lets Ranch-Agent and `claude-hud` run together
- Missing fields are hidden instead of guessed

Detailed guide: [docs/STATUSLINE_BRIDGE.md](./docs/STATUSLINE_BRIDGE.md)

### Main branch detection

```json
{
  "expeditionSituationRoom.mainBranchDetect.enabled": true,
  "expeditionSituationRoom.mainBranchDetect.mainBranchNames": ["main", "master", "trunk"],
  "expeditionSituationRoom.mainBranchDetect.excludeAgentIdPattern": "^(my-agent-id|coordinator)$"
}
```

### Debug logging

```json
{
  "expeditionSituationRoom.debug.unmappedSkillLog.enabled": true,
  "expeditionSituationRoom.debug.unmappedSkillLog.filePath": ".local-debug/unmapped-skill-events.ndjson",
  "expeditionSituationRoom.debug.unmappedSkillLog.relativeBase": "global",
  "expeditionSituationRoom.debug.unmappedSkillLog.maxDetailChars": 1200,
  "expeditionSituationRoom.debug.unmappedSkillLog.captureReasons": [
    "unknown_tool_name",
    "missing_tool_name",
    "assistant_without_tool_name"
  ]
}
```

Default signal lane labels in the UI:

- `orchestration_signal` → `운행 조정`
- `unknown_tool_signal` → `외부 설비`
- `tool_name_missing_signal` → `신호 누락`
- `assistant_reply_signal` → `운행 안내`

## Development Checks

Before opening a PR, run:

```bash
npm run build
npm --prefix extension run test
npm --prefix extension run typecheck
npm --prefix webview-ui run typecheck
```

## Credits

This project was originally sparked by the idea of making agent runtime activity feel spatial and alive inside VS Code.

Shout-out to [pixel-agents](https://github.com/pablodelucca/pixel-agents) for helping validate the core direction around runtime watching and visual storytelling.

## License

MIT
