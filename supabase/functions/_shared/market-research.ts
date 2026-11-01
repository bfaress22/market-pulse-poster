/**
 * Turn a free-form user brief into concrete web research queries + writing mode.
 * Goal: feed the model enough Tier-1 snippets to write a CommoHedge-style market post.
 */

import { gatherSourceContext, scrapeUrl, searchKeyword, type SourceInput } from "./web-sources.ts";

const TIER1_SITES = [
  "reuters.com",
  "bloomberg.com",
  "cnbc.com",
  "ft.com",
  "wsj.com",
  "eia.gov",
  "investing.com",
  "tradingeconomics.com",
];

const COMMODITY_QUERIES = [
  "Brent crude oil price today",
  "WTI crude oil price today",
  "TTF natural gas Europe price EUR/MWh",
  "Henry Hub natural gas price",
  "gold price USD/oz today",
  "silver platinum price today",
  "copper LME price today",
  "CBOT wheat corn soybean price",
  "US dollar index DXY yields today",
  "commodity market movers today energy metals agriculture",
];

export function detectMarketBrief(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return /commodit|marché|market|reuters|bloomberg|cnbc|eia|brent|wti|ttf|hedge|commohedge|settlement|intraday|oil|gas|gold|copper|wheat|fed\b|prix|clôture|bourse/.test(p);
}

/** Prefer language asked inside the prompt over the UI selector. */
export function detectLanguageOverride(prompt: string): string | null {
  const p = prompt.toLowerCase();
  if (/en anglais|in english|linkedin (post )?in english|english (post|version)/.test(p)) return "en";
  if (/en français|in french|linkedin (post )?in french|français/.test(p)) return "fr";
  if (/en español|in spanish|espagnol/.test(p)) return "es";
  if (/auf deutsch|in german|allemand/.test(p)) return "de";
  if (/بالعربية|in arabic|arabe/.test(p)) return "ar";
  return null;
}

export function wantsXPost(prompt: string): boolean {
  return /\b(x|twitter|tweet)\b|280\s*caract|280\s*char/i.test(prompt);
}

function siteFilter(): string {
  return TIER1_SITES.map((s) => `site:${s}`).join(" OR ");
}

/** Build focused keyword searches from the user brief (never dump the whole prompt as one query). */
export function buildResearchKeywords(prompt: string, extra: SourceInput[] = []): string[] {
  const out: string[] = [];
  const filter = `(${siteFilter()})`;

  // Always include commodity desk coverage when this is a market brief
  if (detectMarketBrief(prompt)) {
    for (const q of COMMODITY_QUERIES) {
      out.push(`${q} ${filter}`);
    }
  }

  // User-provided keywords stay as-is (and get a Tier-1 variant)
  for (const s of extra) {
    if (s.type === "keyword" && s.value.trim()) {
      const v = s.value.trim().slice(0, 160);
      out.push(v);
      if (!/site:/i.test(v)) out.push(`${v} ${filter}`);
    }
  }

  // Light extraction of asset names mentioned in the prompt
  const mentioned = prompt.match(
    /\b(Brent|WTI|TTF|Henry Hub|gold|silver|platinum|copper|wheat|corn|soy|soybean|Fed|ECB|DXY|LME|CBOT|MATIF|natgas|natural gas|crude)\b/gi,
  );
  if (mentioned) {
    for (const m of [...new Set(mentioned.map((x) => x.toLowerCase()))].slice(0, 6)) {
      out.push(`${m} price today OR settlement ${filter}`);
    }
  }

  // Deduplicate, cap
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const q of out) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(q);
    if (unique.length >= 12) break;
  }
  return unique;
}

/**
 * Deep research for market briefs:
 * 1) multi-query search on Tier-1 domains
 * 2) scrape the best article URLs so the model sees actual figures, not titles only
 */
export async function gatherMarketBriefContext(opts: {
  prompt: string;
  sources: SourceInput[];
  firecrawlKey?: string | null;
}): Promise<{ context: string; freshUrls: string[]; provider: "firecrawl" | "open"; queryCount: number }> {
  const keywords = buildResearchKeywords(opts.prompt, opts.sources);
  const urlSources = opts.sources.filter((s) => s.type === "url");
  const ideaSources = opts.sources.filter((s) => s.type === "idea");

  const planned: SourceInput[] = [
    ...ideaSources,
    ...urlSources,
    ...keywords.map((value) => ({ type: "keyword" as const, value })),
  ];

  // First pass: search + user URLs
  const first = await gatherSourceContext(planned, {
    firecrawlKey: opts.firecrawlKey,
    maxUrls: 6,
    maxKeywords: 10,
    urlSnippetChars: 2200,
  });

  // Second pass: scrape top unique article URLs from search hits for real numbers
  const articleUrls = first.freshUrls
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .filter((u) => !/google\.com\/search|duckduckgo\.com/i.test(u))
    .slice(0, 6);

  const articleChunks: string[] = [];
  await Promise.all(articleUrls.map(async (url) => {
    const md = await scrapeUrl(url, opts.firecrawlKey);
    if (md && md.length > 120) {
      articleChunks.push(`# Article extract: ${url}\n\n${md.substring(0, 2800)}`);
    }
  }));

  // Also run a few high-signal searches and attach hit lists explicitly labeled
  const hitBlocks: string[] = [];
  for (const q of keywords.slice(0, 8)) {
    const hits = await searchKeyword(q, opts.firecrawlKey, 4);
    if (!hits.length) continue;
    hitBlocks.push(
      `# Headlines for query: ${q}\n\n` +
        hits.map((h) => `- ${h.title} — ${h.description} (${h.url})`).join("\n"),
    );
  }

  const context = [
    first.context,
    hitBlocks.join("\n\n---\n\n"),
    articleChunks.join("\n\n---\n\n"),
  ].filter(Boolean).join("\n\n---\n\n");

  return {
    context: context.substring(0, 28000),
    freshUrls: [...new Set([...first.freshUrls, ...articleUrls])],
    provider: first.provider,
    queryCount: keywords.length,
  };
}

export function marketBriefSystemPrompt(langName: string, hasResearch: boolean, includeX: boolean): string {
  return `You are the markets desk writer for CommoHedge (commohedge.com).
You write factual commodity / macro LinkedIn posts for professional hedgers — NOT motivational fluff, NOT process lectures.

LANGUAGE: Write LinkedIn (and X if requested) in ${langName}.

TARGET LINKEDIN STRUCTURE (follow closely):
1. Hook (1–2 lines) — what moved and why it matters
2. Themed paragraphs with REAL figures when present in research: Energy / Metals / Agriculture / Macro (Fed, USD, yields)
3. Pattern / takeaway for hedgers (short)
4. Soft CTA → commohedge.com
5. Sources line with outlets + date context (e.g. "Sources: Reuters, Bloomberg… Morning readings; … closes.")
6. 5–8 relevant hashtags
7. Disclaimer if needed: "For information only, not investment advice."

HARD RULES ON FIGURES:
- Use ONLY numbers, % moves, contract levels, storage %, vote counts, etc. that appear in the RESEARCH block.
- For every price, prefer saying whether it is a settlement/close or an intraday/last print when the research allows it.
- If research is thin for an asset, OMIT that asset or say data was not available — never invent.
- Prefer Tier-1 names: Reuters, Bloomberg, CNBC, EIA, exchange settlements (CME/CBOT/LME/ICE), official agencies.
${hasResearch
    ? "RESEARCH IS ATTACHED below the user request. Ground the post in it. Prefer the densest, most recent snippets with explicit prices."
    : "NO usable research was retrieved. Do NOT invent a market wrap. Return a short post explaining that live Tier-1 figures were unavailable, plus a verify_before_publish checklist."}

STYLE: Concise, desk-like English (or requested language). Like a morning note, not a thought-leadership essay.
Avoid generic lines such as "Commodity desks do not need another hot take" or pure methodology without numbers.
${includeX ? "Also produce x_post: max 280 characters, one punchy market line + key figure if available + CommoHedge mention optional." : "Set x_post to empty string."}

Return JSON via the write_post tool only.`;
}
