# Ranch-Agent StatusLine Bridge

Ranch-Agent can ingest Claude Code `statusLine.command` stdin snapshots and merge them with the existing JSONL runtime stream.

This bridge is used only for main-session overlay data:

- `노선 점유율`
- `회차 처리량`
- `운영비`

It does not replace JSONL as the source of truth for per-agent tool activity.

## 1. Enable the receiver

```json
{
  "expeditionSituationRoom.statusline.enabled": true,
  "expeditionSituationRoom.statusline.bind": "127.0.0.1",
  "expeditionSituationRoom.statusline.port": 48217,
  "expeditionSituationRoom.statusline.path": "/ranch-statusline",
  "expeditionSituationRoom.statusline.authToken": ""
}
```

Optional raw log:

```json
{
  "expeditionSituationRoom.statusline.rawLog.enabled": false,
  "expeditionSituationRoom.statusline.rawLog.filePath": ".local-debug/statusline-events.ndjson",
  "expeditionSituationRoom.statusline.rawLog.relativeBase": "global"
}
```

## 2. Copy the setup snippet

Run:

- `Ranch-Agent: Copy Claude StatusLine Setup`

This copies a `statusLine` block that points Claude to the local Ranch-Agent fan-out wrapper.

## 3. Paste it into Claude settings

Put the copied block into one of:

- `.claude/settings.json`
- `.claude/settings.local.json`

The copied setup uses `statusline-fanout.js` so Ranch-Agent and `claude-hud` can run together.

## 4. What Ranch-Agent reads in this phase

Only fields present in Claude's `statusLine.command` stdin payload are used.
Current UI uses:

- session ID / transcript path for lineage matching
- model metadata
- context usage percent
- trip throughput
- operating cost

Unavailable fields are hidden instead of backfilled.

## 5. Where the data appears

When data is present, Ranch-Agent updates:

- top HUD: `노선 점유율`, `회차 처리량`, `운영비`
- `노선 관제` main row budget strip
- `운행 기록` archive metrics

## 6. Troubleshooting

If nothing appears:

- confirm `expeditionSituationRoom.statusline.enabled` is `true`
- confirm Ranch-Agent is open in VS Code
- confirm Claude was restarted after changing `statusLine`
- confirm the copied setup replaced any older single-command `statusLine`

For raw input inspection, enable `statusline.rawLog.enabled` and inspect the NDJSON file under VS Code global storage.
