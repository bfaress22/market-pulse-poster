---
name: commohedge-daily
description: >-
  Produce CommoHedge daily commodity market work: a French analysis, an English
  LinkedIn post, and a branded 1600x900 image from live web research restricted
  to reliable sources. Use when the user asks for "l'analyse d'aujourd'hui", a
  deep analyse, a tour of commodities, a LinkedIn post (oil, gas, gold, metals,
  agriculture, FX, Fed, Hormuz, etc.), an image or chart for CommoHedge, or says
  "yes / go / l'image et le post" after an analysis. Trigger even if CommoHedge
  is not named, as long as the request is commodity commentary for publication.
---

# CommoHedge market posts (LinkedIn)

CommoHedge ([commohedge.com](https://www.commohedge.com)) is a commodity and FX hedging platform. This skill reproduces its daily LinkedIn content: researched analysis, English LinkedIn post, and branded image. Credibility is the product — every number must be verified and labeled.

## Language

- Talk to the user in **French**. Keep the analysis in French.
- LinkedIn posts and image text are in **English**.

## When this skill applies

- "fais l'analyse d'aujourd'hui" / deep analyse commodities
- LinkedIn post for CommoHedge
- Image / chart 1600×900 charte CommoHedge
- "oui / go / l'image et le post" after an analysis

## Modes (pick from user intent)

| Mode | Trigger | Output |
|------|---------|--------|
| **A — Full daily** | analyse + post (+ image) | Research log → FR analysis → LinkedIn EN → image (if asked) → verify list |
| **B — Post only** | post LinkedIn from existing analysis | LinkedIn EN (+ verify list); no new research if log exists |
| **C — Image only** | image / graphique | Reuse research log + LinkedIn; no new web search; PNG + data JSON |

Default for vague "fais l'analyse d'aujourd'hui": **Mode A** without image unless asked. If they say "oui l'image", run **C** next.

## Hard rules (never break)

1. **Never invent** a figure, quote, cause or forecast. One wrong number damages a finance account more than a gap. If missing → omit and say so.
2. **Label every number:** settlement vs intraday, spot vs futures, contract month, snapshot time. Mixed instruments are the most common silent error.
3. **Unconfirmed claims** (armed groups, governments, single outlet): write "claims", "reports", or "says" — never as fact — in posts and image captions.
4. Verify "highest since", "record", "first time", and official rules/targets (e.g. EU gas storage) before stating them. If unverifiable, drop or flag.
5. Show calculations for derived numbers and mark them **"own calculation"**.
6. **No investment advice.** Every post ends with the disclaimer in [references/post-style.md](references/post-style.md).
7. Ignore pages with stale ticker widgets, no visible date, or SEO "price today" content.
8. If you lack web search (research modes) or Python (image), **stop and say so** — do not fill gaps from memory.

## Workflow

### 1. Research (mandatory, never from memory)

Use web search for every price, level, date and event. If no web access, stop and ask for a sourced table (asset, value, contract, change, type, timestamp, source), then work only from that table.

- Find today's date from the latest dated sources before searching.
- Cover: energy (Brent, WTI, TTF, EU storage, Henry Hub, diesel if relevant), precious metals, base metals (LME + iron ore), agriculture (grains, softs, cattle, palm if moving), macro/FX (central banks, DXY, 10y, EUR/USD when material), news drivers (geopolitics, supply, policy, weather, company events).
- Identify biggest movers and most striking news.
- Follow [references/sources-and-verification.md](references/sources-and-verification.md) before the first search.

### 2. Research log (show before writing)

Table columns:

`Asset | Value | Unit/contract | Change | Type | Timestamp + TZ | Source(s) | Confidence | Conflicts`

Then: **3–5 biggest movers** and **3–5 striking news** (facts only, each with source). Reuse this log for analysis, LinkedIn post and image so all three tell the same story.

### 3. Analysis (French)

Structure: one-sentence summary; main news; one section per asset group (facts + mechanism); **Lecture d'ensemble** (how moves connect); **À suivre** (dated catalysts). Cite sources inline. When the user asks for "actualités frappantes" or "plus touchées", lead with those and skip quiet markets. If a number from an earlier answer was wrong or stale, say so explicitly. End by offering the image and LinkedIn post, with a single question.

### 4. LinkedIn post (EN)

Read [references/post-style.md](references/post-style.md).

1. **Hook** — one line, main tension of the day (≤15 words)
2. **3–5 short paragraphs** — one theme each, most important first: number → cause → why it matters
3. **Pattern sentence** — what links the moves
4. **For hedgers:** — practical, non-advisory exposure check
5. **CTA (verbatim):** `Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com`
6. **Sources line** + `For information only, not investment advice.` (add morning/previous-close caveats when relevant)
7. **6–10 hashtags**

Style: clear, direct, no jargon, no hype, no emojis. Short sentences. **200–280 words**. Round sensibly; keep exact headline levels.

### 5. Image (when requested)

Build with [scripts/make_image.py](scripts/make_image.py) (layouts `tour`, `headlines`, `weekly`). Read [references/image-spec.md](references/image-spec.md), write JSON from the research log, run the script, view the PNG and fix overlaps before presenting.

- Size: **1600×900 PNG**, matplotlib, **dpi=100**
- **Reuse only** research log + LinkedIn post. Do **not** web-search new figures for the chart.
- Mark intraday with hatched bars / hollow markers; note in subtitle/footer
- Escape `$` in matplotlib text as `\$`
- Present PNG + data JSON; never plot a value absent from the research log

### 6. Points à vérifier avant de publier

In French, list every figure that is: intraday, **derived** (show calculation), single-sourced, conflicting, or from Tier 3 aggregators — plus wording of unconfirmed claims. Reminder: if publishing later, refresh oil, gas and gold.

## Analysis voice

- Prefer **opposing forces** or **two regimes** when true (e.g. energy supply shock vs hawkish Fed; oil ≠ gas stickiness)
- Separate **what moved** from **what is unverified**
- Call out contract rolls (e.g. WTI front vs next)
- Prefer physical/storage asymmetries when they explain divergence (EU storage, Qatar FM, Hormuz)

## Files

- [references/sources-and-verification.md](references/sources-and-verification.md) — source tiers, labeling, conflicts, lessons learned, checklist
- [references/post-style.md](references/post-style.md) — LinkedIn template, tone, example
- [references/image-spec.md](references/image-spec.md) — brand, layouts, JSON schema, quality checks
- [scripts/make_image.py](scripts/make_image.py) — JSON → PNG (`python scripts/make_image.py --layout tour --data data.json --out out.png`)
