# User Asset Pack

Place custom assets here and map them in `manifest.json`.

Runtime fallback order:

1. `assets/user-pack`
2. `assets/placeholder-pack`
3. emoji fallback

## Quick Start

1. Keep `manifest.json` as the source of truth.
2. Generate PNGs and drop them into `icons/`, `sprites/`, `tiles/`.
3. Reload the VS Code window.

Manifest contract:

```json
{
  "version": 1,
  "icons": { "team_default": "icons/team_default.png" },
  "sprites": { "agent_idle": "sprites/agent_idle.png" },
  "tiles": { "zone_src": "tiles/zone_src.png" }
}
```

Image prompt template:

- See `PROMPT_TEMPLATE.md`
