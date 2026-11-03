# CommoHedge chart brand

## Canvas

- **1600×900 PNG**, matplotlib, `dpi=100` (X / LinkedIn)
- Prefer static PNG for LinkedIn; GIF optional for X if user asks animation

## Colors

| Token | Hex | Use |
|-------|-----|-----|
| Background | `#0C1322` | Full canvas |
| Card | `#131D30` | Panels |
| Card border | `#3A4759` | 1px, rounded corners |
| Accent lime | `#A6FF00` | HEDGE, CTA URL, context tag, positive emphasis |
| Text | `#FFFFFF` | Titles, primary numbers |
| Secondary | `#8FA0B5` | Subtitles, body, footnotes |
| Negative | `#FF4D5E` | Down moves |
| Neutral | `#5C6B80` | Axes, dividers |
| Cyan | `#4DD9E6` | Optional secondary series |

Positive bars / up moves: lime `#A6FF00` (or close green consistent with brand). Down: `#FF4D5E`.

## Typography

- **Poppins** Bold for titles/numbers, Regular for body — if available
- Fallback: **DejaVu Sans**
- Title: white bold **24–26pt**, max ~**55 characters**
- Footer/sources: **8.5pt** minimum — shorten captions rather than going smaller

## Chrome

- **Top left:** `COMMO` white + `HEDGE` lime
- **Top right:** small lime context tag (e.g. `US MIDTERMS`, `DAILY TOUR`)
- **Subtitle:** grey + date
- **Footer:** thin grey line → two lines sources/caveats → `WWW.COMMOHEDGE.COM` lime bottom-right

## Layouts (pick one)

### A — Daily tour

1. Strip of **4 news cards** at top  
2. Four cards: **Energy / Precious metals / Base metals / Agriculture**  
3. Horizontal bars of **daily % change** on **one common scale** (green up, red down)

### B — Headlines

- **2×2** cards: tag, one big number, one grey line, 3 text lines, small footnote  
- Plus **"Today's moves"** bar chart and **"Also on the radar"** card

### C — Weekly / trend

- Daily **line chart** of settlements for **two key assets** (same instrument family per line)  
- Daily % + short cause under each day  
- Weekly scoreboard

## Plotting rules

- Plot **only** values from the research log / data plan
- **No placeholders or estimates** drawn as data
- Intraday: hatched bars or hollow markers + note in subtitle/footer
- **Never** connect different instruments on one line (e.g. futures close + spot)
- Missing day → omit point and say so in footer
- Escape dollars: `\$` in matplotlib strings
- Keep all text inside cards
- After save: visually check overflow/overlap → fix → re-render
- Deliver: `commohedge_<topic>_YYYY-MM-DD.png` + matching `.py`

## Consistency check (after image)

Table: `figure in image | same in post (yes / rounded / absent) | source`  
List anything approximate, derived, or differing from the post.
