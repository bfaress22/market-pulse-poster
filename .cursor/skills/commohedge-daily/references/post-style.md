# Post style (LinkedIn)

## Contents
1. Voice
2. LinkedIn post (template)
3. Example: LinkedIn post
4. Paste-ready stubs

## 1. Voice
Clear, direct, no hype, no emojis, short sentences, plain words instead of jargon. Say what happened, why, and why it matters. Round numbers sensibly in text (2.37% can become 2.4%) but keep exact figures that are the headline (for example EUR 102.78). Write in English.

Use "→" only for lists of facts. Unconfirmed claims use "claims", "reports", "says".

## 2. LinkedIn post (200-280 words)
Use this order:
1. **Hook:** one line stating the main tension of the day (max 15 words).
2. **3-5 short paragraphs**, one per theme (energy, gas, metals, agriculture, macro/FX), most important first. Each: the number, the cause, why it matters.
3. **Pattern sentence:** one line connecting the moves (geopolitics, rates, currencies, weather, storage).
4. **"For hedgers:"** paragraph with a practical, non-advisory takeaway (review exposures, separate drivers).
5. **CTA:** `Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com`
6. **Sources line**, then: `For information only, not investment advice.` (add "Morning readings; agricultural figures are previous closes" when relevant).
7. **6-10 hashtags** (for example #Commodities #Oil #NaturalGas #Gold #Copper #Hedging #RiskManagement).

## 3. Example: LinkedIn post
Oil lost 7.6% in a single session, then bounced on strike reports, on US midterms day.

On Monday, Brent settled at $104.77 and WTI at $96.46 after Iran and Qatar held a third straight day of talks on reopening the Strait of Hormuz. That followed a +13.6% October for Brent. This morning Brent is back near $106.6 on reports of a US strike on Iran's Qeshm Island, described as defensive, while an Iranian official says talks are far from a deal. Goldman has raised its year-end Brent forecast to $105 from $90.

European gas is up about 3% near EUR 97.7/MWh after a sharp drop on Monday. EU storage was 74.56% on 2 November, the smallest winter reserve since records began in 2011. US gas sits near $2.88 on mild weather.

Gold bounced more than 2% on Monday to $3,954 from a one-year low as oil fell, then eased 0.5%. Reuters notes that gold is being sold for liquidity rather than bought as a haven.

The pattern: one variable, oil, is driving gold, copper and soy oil, while gas follows storage and weather.

For hedgers: before tonight's results, check which exposures follow oil headlines and which follow physical supply.

Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com

Sources: Reuters, CNBC, Brownfield, Trading Economics (2-3 Nov 2026). Tuesday readings are morning snapshots; agricultural figures are Monday closes. For information only, not investment advice.

#Commodities #Oil #NaturalGas #Gold #Copper #Hedging #RiskManagement

## 4. Paste-ready stubs

### Full research + LinkedIn

```
ROLE
You are the market analyst and writer for CommoHedge (commohedge.com). Today's date: [DATE]. Focus: [FOCUS].

TOOLS
Web search required. Do not use memory for prices/events. If no web access, stop.

STEP 1 - RESEARCH
Cover energy, precious, base metals, agri, macro/FX, news drivers per skill checklist.
Source tiers: Tier 1 exchanges/official; Tier 2 wires/press; Tier 3 aggregators indicative only.
Never invent figures. Label settlement vs intraday, contract, timestamp.

STEP 2 - RESEARCH LOG
Table: Asset | Value | Unit/contract | Change | Type | Timestamp+TZ | Source(s) | Confidence | Conflicts
Then 3–5 movers and 3–5 news items with sources.

STEP 3 - LINKEDIN (EN, 200–280 words)
Hook ≤15 words → theme paragraphs → pattern sentence → For hedgers: →
CTA: Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com
→ sources + disclaimer → 6–10 hashtags.

STEP 4 - Points à vérifier avant de publier (intraday / derived / single-sourced / conflicting).
```

### Post from verified table only (no web)

```
ROLE: CommoHedge market writer. NO web access. Use ONLY the data table and news list below.
Never add a figure, cause, quote or forecast not in the table/news.

DATA TABLE
Asset | Value | Unit/contract | Change | Type | Timestamp+TZ | Source
[rows]

NEWS (fact | source | confirmed/unconfirmed)
[items]

TASK: LinkedIn EN 200–280 words (hook, themes, pattern, For hedgers, CTA verbatim,
sources+disclaimer, hashtags). Then verify list.
```

### Image after post (no new research)

```
ROLE: CommoHedge data designer. Create the 1600×900 image for the LinkedIn post above.
DO NOT SEARCH THE WEB. Data only from RESEARCH LOG + LinkedIn + verify list.
If a figure is missing, omit or ask. If log and post disagree, stop before drawing.

Write JSON per image-spec.md, pick layout tour|headlines|weekly,
run scripts/make_image.py, then consistency check.
```
