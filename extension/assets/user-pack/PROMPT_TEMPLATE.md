# PNG Prompt Template (GPT Image)

Use this template when generating Ranch-Agent rail-control assets.

## Global Prompt Base

```text
Create a premium rail control room UI asset pack for a VS Code dashboard.
Style: clean 2D, soft shading, high contrast, readable at small size.
No text, no logos, no copyrighted characters, no watermarks.
Transparent background, centered subject, single object per image.
Output: square PNG.
```

## Per Type

- `icons/*`: `512x512` PNG, keep thick silhouette for 24-32px readability.
- `sprites/*`: use `1024x384` or `768x256` for rail side views.
- `tiles/*`: `512x512` PNG, subtle background texture or stage panel insert.

## Key Prompt Snippets

- `rail_front_default`: "front-facing premium metro train icon, original design, burgundy and charcoal, readable at 48px"
- `rail_front_main`: "front-facing premium metro train icon for main line, original design, burgundy and charcoal"
- `rail_front_subagent`: "front-facing premium metro train icon for branch line, original design, burgundy and charcoal"
- `rail_front_team`: "front-facing premium metro train icon for team transfer line, original design, burgundy and charcoal"
- `rail_side_default`: "side-view premium autonomous metro train sprite, original design, burgundy and charcoal, transparent background, wide crop"
- `rail_side_main`: "side-view premium autonomous metro train sprite for main line, original design, burgundy and charcoal, transparent background, wide crop"
- `rail_side_subagent`: "side-view premium autonomous metro train sprite for branch line, original design, burgundy and charcoal, transparent background, wide crop"
- `rail_side_team`: "side-view premium autonomous metro train sprite for transfer/team line, original design, burgundy and charcoal, transparent background, wide crop"
- `skill_read`: "open book tool icon"
- `skill_edit`: "pencil edit icon"
- `skill_write`: "construction block write icon"
- `skill_bash`: "utility hammer icon"
- `skill_search`: "magnifier search icon"
- `skill_task`: "delivery crate task icon"
- `skill_ask`: "question sign icon"
- `skill_other`: "jigsaw puzzle utility icon"
- `gate_open`: "green status gate icon"
- `gate_blocked`: "yellow blocked status gate icon"
- `gate_failed`: "red failed status gate icon"
- `gate_closed`: "gray closed status gate icon"
- `zone_src`: "fresh grass pasture tile/icon"
- `zone_apps`: "cattle barn tile/icon"
- `zone_packages`: "chicken coop tile/icon"
- `zone_infra`: "feed workshop shed tile/icon"
- `zone_scripts`: "training paddock tile/icon"
- `zone_docs`: "office management building tile/icon"
- `zone_tests`: "veterinary clinic tile/icon"
- `zone_etc`: "storage lumber yard tile/icon"
- `rail_stage_bg`: "premium underground metro platform ambient background panel, no text, no people, subtle lighting"

## Final QA Prompt

```text
Regenerate if edges are blurry, object is cut off, or background is not transparent.
Keep visual consistency across the full set.
```
