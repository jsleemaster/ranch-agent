# User Pack Checklist

Drop your own assets here. Runtime fallback order is:

1. `assets/user-pack`
2. `assets/placeholder-pack`
3. emoji fallback

## Minimum required

- Nothing is required for MVP. The UI is emoji-first and runs with `0` custom assets.

## Optional folders

- `icons/`
- `sprites/`
- `tiles/`

## Supported icon keys

- team: `team_default`, `team_solo`
- skill: `skill_read`, `skill_edit`, `skill_write`, `skill_bash`, `skill_search`, `skill_task`, `skill_ask`, `skill_other`
- gate: `gate_open`, `gate_blocked`, `gate_failed`, `gate_closed`
- zone: `zone_src`, `zone_apps`, `zone_packages`, `zone_infra`, `zone_scripts`, `zone_docs`, `zone_tests`, `zone_etc`

## Supported sprite keys

- `agent_idle`
- `agent_active`

## Supported tile keys

- `zone_src`, `zone_apps`, `zone_packages`, `zone_infra`, `zone_scripts`, `zone_docs`, `zone_tests`, `zone_etc`

## Recommended size

- icons: `64x64`
- sprites: `64x64` (transparent background)
- tiles: `96x96` (tileable)

## Steps

1. Replace file paths in `manifest.json` if your names differ.
2. Put PNG/SVG files into matching folders. You can point multiple keys to a single file.
3. Re-run extension host (`F5`) or reload window.
