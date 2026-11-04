# Image specification

## Contents
1. Brand
2. Choosing a layout
3. JSON schema per layout
4. Rules for the data
5. Quality checks
6. Presenting the result

## 1. Brand
1600x900 PNG (16:9, LinkedIn). Background #0C1322, cards #131D30 with a 1px #3A4759 border and rounded corners, accent lime #A6FF00, text white, secondary grey #8FA0B5, negative red #FF4D5E, neutral #5C6B80, cyan #4DD9E6. Font Poppins (falls back to DejaVu Sans). Top left: "COMMO" in white + "HEDGE" in lime. Top right: a small lime context tag. White bold title (about 55 characters max), grey subtitle with the date. Footer: thin line, two lines of 8.5pt sources and caveats, "WWW.COMMOHEDGE.COM" in lime at the bottom right. Green/lime = up, red = down, grey = flat.

Prefer **static PNG** for LinkedIn.

## 2. Choosing a layout
- `tour`: the default for a daily "tour of all commodities". 4 news chips on top, then Energy, Precious metals, Base metals and Agriculture cards with horizontal % change bars on one common scale.
- `headlines`: when 3-4 shocks dominate the day (an attack, a record, a crash). 2x2 big-number cards, a "Today's moves" bar chart and an "Also on the radar" card.
- `weekly`: for the move of a week on two key assets (for example Brent and gold). Daily line charts of settlements with daily % and a short cause under each day, plus a week scoreboard.

## 3. JSON schema per layout
Common keys: `title`, `subtitle`, `tag` (top-right tag — change it when the context changes), `footer_lines` (list of 1-2 strings), `website` (default "WWW.COMMOHEDGE.COM").

**tour**
- `news`: 4 items `{tag, text}`; `text` has an explicit `\n` after about 45 characters (2 lines).
- `groups`: exactly 4, in this order: energy, precious metals, base metals, agriculture. Each `{title, subtitle, footer (optional), rows}` and each row `{name, level, pct, hatched}`. `level` may be an empty string. Sort rows from highest to lowest `pct`. `hatched: true` marks intraday or unverified-close readings.
- `xlim` (optional): `[min, max]`; computed automatically otherwise.

**headlines**
- `cards`: 4 items `{tag, big, big_color ("lime"|"red"|"white"), sub, text, foot}`; `text` has 3 lines separated by `\n`.
- `moves`: `{title, subtitle, rows: [{name, pct, hatched}]}` (4-7 rows, any order; shown in the given order).
- `radar`: `{title, items: [{tag, text}]}` (3-4 items, `text` on 2 lines).

**weekly**
- `charts`: exactly 2, each `{title, subtitle, color ("lime"|"red"|"cyan"), points, bracket (optional text such as "+6.2%\nweek")}`. Each point `{label, value, pct (text such as "-0.3%"), pct_color ("lime"|"red"|"grey"), event (optional, 2 short lines), value_text (optional), hollow (optional), pos ("above"|"below", optional)}`. Use `hollow: true` for a point from a different instrument or an intraday reading: it is drawn as a hollow marker, never connected to the line.
- `scoreboard`: `{title, bars: [{name, pct}], lines: [str, str, str]}`.

Run:
`python scripts/make_image.py --layout tour --data my.json --out out.png`

## 4. Rules for the data
- Every plotted value comes from the research log. No placeholders, no estimates drawn as data.
- Hatch (or hollow marker) anything intraday and say so in the subtitle or footer.
- Never connect two different instruments (futures close and spot) with a line.
- If a day or asset has no reliable value, leave it out and say so in the footer.
- Unconfirmed claims appear as "reported" or "claimed", exactly as in the posts.
- Use one common scale across panels so bars are comparable; mention it in the footer.
- The footer states sources, snapshot times, derived percentages ("computed from the reported change") and "Not investment advice".

## 5. Quality checks (always, before presenting)
1. Run the script and read its warnings (long texts, too many rows).
2. View the PNG. Look for overlapping labels, text running outside its card, cramped rows, a title that is too long.
3. Fix by shortening text, not by shrinking fonts below 8.5pt. Re-render until clean.
4. Compare every figure on the image with the research log and the LinkedIn post (same rounding, same caveats).

## 6. Presenting the result
Present the PNG and the JSON data file. In the message, list the figures that are intraday, derived, or single-sourced. Deliver as `commohedge_<topic>_YYYY-MM-DD.png` (+ matching `.json`).
