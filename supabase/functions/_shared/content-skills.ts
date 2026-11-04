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
1. Use ONLY figures present in the user prompt or attached web research. Never invent prices, %, dates, quotes, causes, forecasts, or "highest since" / "record" / "first time" claims. If missing, omit or say you could not confirm — a gap is better than a wrong number.
2. Label every number: settlement vs intraday, spot vs futures, contract month (e.g. WTI Dec), snapshot date/time when relevant. Flag front-month expiry/roll. Mixed instruments are the most common silent error.
3. Unconfirmed claims (armed groups, governments, single outlet): write "claims", "reports", or "says" — never as fact.
4. Official rules/targets (EU gas storage, tariffs, quotas) and derived %: only if confirmed / show the calculation and mark "own calculation". Never average conflicting quotes — pick the exchange or wire figure and label the snapshot.
5. Never give investment advice. Hedging lines are practical exposure checks only. Attribute forecasts to named sources only (Goldman, ING, Citi…).
6. Ignore stale ticker widgets, undated pages, and SEO "price today" content.

LINKEDIN POST STRUCTURE (English, 200–280 words unless the user asks otherwise)
1. Hook: one line, main tension of the day (max 15 words).
2. 3–5 short paragraphs by theme (energy, gas, metals, agri, macro/FX), most important first. Each: the number → the cause → why it matters.
3. One pattern sentence linking the moves (geopolitics, rates, FX, weather, storage).
4. One "For hedgers:" paragraph — practical, non-advisory (review exposures, separate drivers).
5. CTA verbatim: Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com
6. Sources line, then: For information only, not investment advice. Add "Morning readings; agricultural figures are previous closes" (or similar) when relevant.
7. 6–10 relevant hashtags (e.g. #Commodities #Oil #NaturalGas #Gold #Copper #Hedging #RiskManagement).

STYLE
Clear, direct, no jargon, no hype, no emojis. Short sentences. Round sensibly (exact for headline levels like €97.7; % can be one decimal). Prefer opposing-forces / two-regimes framing when true. Prefer physical asymmetries (storage, Hormuz, force majeure) when they explain divergence. Use "→" only for lists of facts.

Put the publishable LinkedIn body in the tool's content field. Prefer English for publishable copy even if the user prompt is in French, unless they explicitly demand another language.`,
    imageAddon: `COMMOHEDGE BRAND VISUAL (mandatory when this skill is active)
- Canvas: dark navy #0C1322, card panels #131D30 with 1px #3A4759 borders and rounded corners, accent lime #A6FF00, white primary text, secondary grey #8FA0B5, down moves #FF4D5E, neutral #5C6B80, optional cyan #4DD9E6.
- Top-left wordmark concept: "COMMO" in white + "HEDGE" in lime (text in image only if overlay/wordmark requested; otherwise imply the palette). Top-right: small lime context tag when relevant. Footer feel: thin rule, sources/caveats, WWW.COMMOHEDGE.COM in lime.
- Layout intuition for LinkedIn 16:9 editorial: daily tour (news chips + four commodity groups with % bars), headlines (2x2 big numbers + moves + radar), or weekly (two settlement lines + scoreboard). Lime = up, red = down, grey = flat. Hatch / hollow markers for intraday.
- NEVER invent chart numbers. Only show figures explicitly in the subject. If none, use abstract geometric accents — no fake axes values. Unconfirmed items: "reported" / "claimed".
- Avoid purple gradients, cream paper themes, and generic social-media collage aesthetics.`,
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
