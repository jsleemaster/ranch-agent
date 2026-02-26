# User Asset Pack

Drop a `manifest.json` here to override placeholder assets.

Fallback order at runtime:

1. `assets/user-pack`
2. `assets/placeholder-pack`
3. primitive draw

Manifest contract:

```json
{
  "version": 1,
  "icons": { "team_default": "icons/team_default.png" },
  "sprites": { "agent_idle": "sprites/agent_idle.png" },
  "tiles": { "zone_src": "tiles/zone_src.png" }
}
```
