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

You can either:

1. declare files in `manifest.json`, or
2. just drop the conventional rail filenames below and let Ranch-Agent auto-discover them

Auto-discovered filenames:

- `icons/train_front.png` or `icons/train_front.svg`
- `icons/train_front_main.png`
- `icons/train_front_subagent.png`
- `icons/train_front_team.png`
- `sprites/train_side.png` or `sprites/train_side.svg`
- `sprites/train_side_main.png`
- `sprites/train_side_subagent.png`
- `sprites/train_side_team.png`
- `tiles/rail_stage_bg.png`

## Supported icon keys

- team: `team_default`, `team_solo`
- rail: `rail_front_default`, `rail_front_main`, `rail_front_subagent`, `rail_front_team`
- skill: `skill_read`, `skill_edit`, `skill_write`, `skill_bash`, `skill_search`, `skill_task`, `skill_ask`, `skill_other`
- gate: `gate_open`, `gate_blocked`, `gate_failed`, `gate_closed`
- zone: `zone_src`, `zone_apps`, `zone_packages`, `zone_infra`, `zone_scripts`, `zone_docs`, `zone_tests`, `zone_etc`

## Supported sprite keys

- `agent_idle`
- `agent_active`
- `rail_side_default`
- `rail_side_main`
- `rail_side_subagent`
- `rail_side_team`

## Supported tile keys

- `zone_src`, `zone_apps`, `zone_packages`, `zone_infra`, `zone_scripts`, `zone_docs`, `zone_tests`, `zone_etc`
- `rail_stage_bg`

## Recommended size

- icons: `64x64`
- rail front icons: `256x256` or larger (transparent background, centered, square)
- sprites: `64x64` (transparent background)
- rail side sprites: `1024x384` or `768x256` (transparent background, wide crop)
- tiles: `96x96` (tileable)

## Steps

1. If you want zero-config rail assets, keep the conventional names above.
2. If your names differ, map them in `manifest.json`.
3. Put PNG/SVG files into matching folders. You can point multiple keys to a single file.
4. Re-run extension host (`F5`) or reload window.
5. If you generate images with GPT, start from `PROMPT_TEMPLATE.md`.
