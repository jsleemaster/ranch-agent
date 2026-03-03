# PNG Prompt Template (GPT Image)

Use this template when generating Ranch-Agent assets.

## Global Prompt Base

```text
Create a game UI icon pack for a farm-ranch coding dashboard.
Style: clean 2D, soft shading, high contrast, readable at small size.
No text, no logos, no copyrighted characters, no watermarks.
Transparent background, centered subject, single object per image.
Output: square PNG.
```

## Per Type

- `icons/*`: `512x512` PNG, keep thick silhouette for 24-32px readability.
- `sprites/*`: `512x512` PNG, character full body with idle pose.
- `tiles/*`: `512x512` PNG, seamless texture or flat area tile style.

## Key Prompt Snippets

- `team_default`: "friendly ranch mascot head icon"
- `team_solo`: "independent ranch runner mascot icon"
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

## Final QA Prompt

```text
Regenerate if edges are blurry, object is cut off, or background is not transparent.
Keep visual consistency across the full set.
```
