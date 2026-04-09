---
name: export-resolve
description: Export confirmed FilmHub segments as color-coded markers to a DaVinci Resolve timeline for review before cutting
user-invocable: false
---

# Export Markers to DaVinci Resolve

Export confirmed segments as timeline markers in DaVinci Resolve so the user can review flagged ranges in context before the cut is made.

## Inputs

- `<segments-json>` — path to a confirmed segments JSON file (e.g. `analysis/<video-name>/clean_NN_segments.json`)

## Steps

### 1. Run the Resolve export script

```
.venv/bin/python -m filmhub.export_resolve "<segments-json>"
```

### 2. Provide the user with the terminal command

Give the user the exact command to run themselves:

```
.venv/bin/python -m filmhub.export_resolve "<segments-json>"
```

### 3. Explain the marker colors

Tell the user: markers have been added to the currently open Resolve timeline with these colors:

- **Red** = Promotions
- **Yellow** = Graphics
- **Blue** = Music
- **Pink** = Multiple types

They can review the flagged ranges in context before the cut is made.
