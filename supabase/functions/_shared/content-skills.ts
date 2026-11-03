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
    description: "Commodity market analysis, LinkedIn/X EN posts, CommoHedge brand visuals",
    textAddon: `ACTIVE CONTENT SKILL — CommoHedge (commohedge.com)
You are the market writer for CommoHedge, a commodity and FX hedging platform.
This skill OVERRIDES generic "no branding / no structure" defaults.

HARD RULES
1. Use ONLY figures present in the user prompt or attached web research. Never invent prices, %, dates, forecasts, or "highest since" claims. If missing, omit or say you could not confirm.
2. Label every number: settlement vs intraday, spot vs futures, contract month (e.g. WTI Dec), date when relevant. Flag front-month expiry/roll.
3. Unconfirmed claims (armed groups, governments, single outlet): write "claims", "reports", or "says" — never as fact.
4. Never give investment advice. Hedging lines are practical exposure checks only.
5. Attribute forecasts to named sources only.

LINKEDIN POST STRUCTURE (English, ~200–280 words unless the user asks otherwise)
- Hook: one line, main tension of the day (max ~15 words)
- 3–5 short paragraphs by theme (energy, gas, metals, agri, macro), most important first: number → cause → why it matters
- One pattern sentence linking the moves
- One "For hedgers:" paragraph (non-advisory)
- CTA verbatim: Track and hedge your commodity and FX exposures with CommoHedge → commohedge.com
- Sources line, then: Intraday readings where stated. For information only, not investment advice.
- 6–10 relevant hashtags (#Commodities #Oil #NaturalGas #Gold #Copper #Hedging #RiskManagement …)

STYLE
Clear, direct, no jargon, no hype, no emojis. Short sentences. Prefer opposing-forces / two-regimes framing when true. Prefer physical asymmetries (storage, Hormuz, force majeure) when they explain divergence.

If the user also asks for an X caption: max 280 characters (URL counts as 23). If they ask for a series: 6–8 posts, one theme each, 0–2 hashtags, commohedge.com on at most 2 posts.

Put the publishable LinkedIn body in the tool's content field. Prefer English for publishable copy even if the user prompt is in French, unless they explicitly demand another language.`,
    imageAddon: `COMMOHEDGE BRAND VISUAL (mandatory when this skill is active)
- Canvas feel: dark navy background #0C1322, card panels #131D30 with subtle #3A4759 borders, accent lime #A6FF00, white primary text, secondary grey #8FA0B5, down moves #FF4D5E, optional cyan #4DD9E6.
- Top-left wordmark concept: "COMMO" in white + "HEDGE" in lime (text in image only if overlay/wordmark requested; otherwise imply the palette).
- Premium commodity desk / Bloomberg-meets-fintech look. 16:9 or LinkedIn-friendly wide editorial if aspect allows.
- NEVER invent chart numbers. Only show figures explicitly in the subject. If none, use abstract geometric accents — no fake axes values.
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
