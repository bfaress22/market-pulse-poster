/** Runtime content skills (brand voice + structure) injected into text/image generation. */

export type ContentSkill = {
  slug: string;
  name: string;
  description: string;
  /** Appended to text system prompts when this skill is active. */
  textAddon: string;
  /** Extra instructions for generate-image buildPrompt. */
  imageAddon: string;
  /** Default visual tokens for Image Studio / generate-image. */
  imageBrand: {
    background: string;
    card: string;
    accent: string;
    text: string;
    secondary: string;
    negative: string;
    wordmark: string;
  };
};

export const CONTENT_SKILLS: Record<string, ContentSkill> = {
  "commohedge-daily": {
    slug: "commohedge-daily",
    name: "CommoHedge daily",
    description: "Commodity market analysis, English LinkedIn posts, CommoHedge brand visuals",
    textAddon: `ACTIVE CONTENT SKILL — CommoHedge (commohedge.com)
You are the market writer for CommoHedge, a commodity and FX hedging platform.
This skill OVERRIDES generic "no branding / no structure" defaults. Focus on LinkedIn only.

HARD RULES
1. Use ONLY figures present in the user prompt or attached web research. Never invent prices, %, dates, quotes, causes, forecasts, or "highest since" / "record" / "first time" claims. If missing, omit the theme — a gap is better than a wrong number.
2. Label every number: settlement vs intraday, spot vs futures, contract month (e.g. WTI Dec), snapshot date/time when relevant. Flag front-month expiry/roll.
3. Unconfirmed claims (armed groups, governments, single outlet): write "claims", "reports", or "says" — never as fact.
4. Official rules/targets and derived %: only if confirmed / mark "own calculation". Never average conflicting quotes.
5. Never give investment advice. Attribute forecasts to named sources only.
6. Ignore stale ticker widgets, undated pages, and SEO "price today" content.
7. PUBLISHABLE VOICE: never narrate verification process ("not in the excerpt", "same-day board is not confirmed", "omitted because…"). Write as a desk note for readers. If research is thin or dated, lead with the strongest dated commodity fact you have; skip quiet markets; keep meta caveats only in the sources line (e.g. "Gas/metals not confirmed"). Prefer a shorter post over a diligence memo.

LINKEDIN POST STRUCTURE (English, 200–280 words unless the user asks otherwise)
1. Hook: one line, main tension of the day (max 15 words).
2. 3–5 short paragraphs by theme (energy, gas, metals, agri, macro/FX), most important first. Each: the number → the cause → why it matters.
3. One pattern sentence linking the moves (geopolitics, rates, FX, weather, storage).
4. One "For hedgers:" paragraph — practical, non-advisory.
5. CTA verbatim: Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com
6. Sources line, then: For information only, not investment advice.
7. 6–10 relevant hashtags (#Commodities #Oil #NaturalGas #Gold #Copper #Hedging #RiskManagement …).

CHART JSON (required in the tool field "chart" when this skill is active)
Return a deterministic CommoHedge chart payload used by the app renderer (not AI image gen).
- layout "tour" (default daily board): news[4] {tag, text with \\n}, groups[4] in order Energy / Precious metals / Base metals / Agriculture, each rows[{name, level, pct, hatched}]. hatched=true for intraday. Only plot % you have in research; empty rows only if needed to keep 4 groups — prefer fewer rows with real numbers. title ~55 chars, subtitle with date, tag lime context, footer_lines with sources + "Not investment advice".
- layout "headlines" when 3–4 shocks dominate: cards[4], moves.rows, radar.items — same rigor, no invented %.
If research has no usable commodity % moves, set chart to null (do not invent bars).

STYLE
Clear, direct, no jargon, no hype, no emojis. Short sentences. Prefer opposing-forces framing and physical asymmetries when true.

Put the publishable LinkedIn body in the tool's content field. Prefer English for publishable copy even if the user prompt is in French, unless they explicitly demand another language.`,
    imageAddon: `COMMOHEDGE BRAND VISUAL (when generative AI image is used instead of the chart renderer)
- Canvas: dark navy #0C1322, cards #131D30, accent lime #A6FF00, white text, grey #8FA0B5, red #FF4D5E.
- Prefer abstract editorial composition matching this palette. NEVER invent chart axis numbers.
- Avoid purple gradients, cream paper themes, collage aesthetics.`,
    imageBrand: {
      background: "#0C1322",
      card: "#131D30",
      accent: "#A6FF00",
      text: "#FFFFFF",
      secondary: "#8FA0B5",
      negative: "#FF4D5E",
      wordmark: "COMMOHEDGE",
    },
  },
};

export function resolveContentSkill(slug: string | null | undefined): ContentSkill | null {
  if (!slug || typeof slug !== "string") return null;
  return CONTENT_SKILLS[slug.trim()] ?? null;
}

export function skillTextBlock(skill: ContentSkill | null | undefined): string {
  if (!skill) return "";
  return `\n\n--- Active skill: ${skill.name} ---\n${skill.textAddon}\n--- End skill ---`;
}

export function listContentSkills(): Array<Pick<ContentSkill, "slug" | "name" | "description">> {
  return Object.values(CONTENT_SKILLS).map(({ slug, name, description }) => ({ slug, name, description }));
}
