# Ranch-Agent HTTP Hooks

This guide explains how to feed Claude Code HTTP hooks into Ranch-Agent as a supplemental runtime source.

## 1. Enable the local receiver

```json
{
  "expeditionSituationRoom.httpHook.enabled": true,
  "expeditionSituationRoom.httpHook.bind": "127.0.0.1",
  "expeditionSituationRoom.httpHook.port": 48216,
  "expeditionSituationRoom.httpHook.path": "/ranch-hook",
  "expeditionSituationRoom.httpHook.authToken": "replace-with-strong-token",
  "expeditionSituationRoom.httpHook.mergeMode": "jsonl_primary"
}
```

Optional raw log:

```json
{
  "expeditionSituationRoom.httpHook.rawLog.enabled": true,
  "expeditionSituationRoom.httpHook.rawLog.filePath": ".local-debug/http-hook-events.ndjson",
  "expeditionSituationRoom.httpHook.rawLog.relativeBase": "global"
}
```

## 2. Add Claude HTTP hooks

Put the hook entries in `.claude/settings.json` or `.claude/settings.local.json`.

Example receiver endpoint:

- `http://127.0.0.1:48216/ranch-hook`

Use the same URL for the hook events you want to observe.

## 3. Event mapping used by Ranch-Agent

- `PreToolUse` -> `tool_start`
- `PostToolUse` -> `tool_done`
- `Notification` -> `assistant_text`
- `UserPromptSubmit` -> `turn_active`
- `SessionStart` -> `turn_active`
- `SessionEnd` / `Stop` / `SubagentStop` -> `turn_waiting`
- `PermissionRequest` -> `permission_wait`
- unknown hook events -> stored as assistant-style detail events

## 4. Merge behavior

- JSONL remains the primary source of truth
- HTTP hooks act as a supplemental stream
- Default mode is `jsonl_primary`
- Duplicate events are suppressed by fingerprint + short dedupe window

## 5. What changes in the UI

HTTP hook events feed the same control-room UI:

- `관제 보드`
- `노선 관제`
- `운행 기록`
- `관제 로그`

No separate hook-only UI is added.

## 6. Troubleshooting

If nothing appears:

- confirm Ranch-Agent output channel shows `[http-hook] listening on ...`
- confirm the hook URL matches `bind + port + path`
- confirm bearer token matches if auth is enabled
- confirm JSONL is not overriding everything because the hook payload is duplicate noise

If you want payload inspection, enable `httpHook.rawLog.enabled` and inspect the NDJSON file under VS Code global storage.
