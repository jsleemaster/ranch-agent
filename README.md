# Ranch-Agent MVP

VS Code webview extension that visualizes multi-agent runtime activity as an emoji-first 2D ranch.

## Shout-out

- Inspired by [pixel-agents](https://github.com/pablodelucca/pixel-agents) and its real-time multi-agent visualization approach.

## Packages

- `extension`: VS Code extension host (watcher, domain engine, message bridge)
- `webview-ui`: React + canvas UI overlays and map renderer
- `shared`: cross-package runtime/domain/protocol types

## Quick start

1. `npm --prefix webview-ui install`
2. `npm --prefix extension install`
3. `npm run build`
4. Open `extension/` in VS Code and run `F5`

## Runtime source

Set `expeditionSituationRoom.runtimeJsonlPath` in VS Code settings to a Claude JSONL transcript path.

## Architecture snapshot

1. Extension watcher parses JSONL lines into `RawRuntimeEvent`.
2. Domain engine resolves team/skill/folder/hook plus growth metrics into snapshots.
3. Extension streams protocol events to webview (`world_init`, `agent_upsert`, `skill_metric_upsert`, `zone_upsert`, `feed_append`, `filter_state`).
4. Webview maintains an imperative `WorldState` and renders:
   - 일꾼 우리
   - 작업 동선
   - 목장 구역 맵 (canvas)
   - 작업 일지
