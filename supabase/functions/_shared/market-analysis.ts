/**
 * Step 1 of the CommoHedge pipeline: deep web research -> research log -> English analysis.
 * Step 2 (post + chart) consumes this output only, so every figure traces back to the log.
 */
import { searchKeyword, scrapeUrl, type SearchHit, type SourceInput } from "./web-sources.ts";
import { xaiErrorMessage } from "./ai-text.ts";

export type TextProvider = { model: string; url: string; key: string };

export type ResearchLogRow = {
  asset: string;
  value: string;
  unit_contract?: string;
  change: string;
  pct?: number;
  type: string;
  timestamp: string;
  source: string;
  confidence: string;
  conflicts?: string;
};

export type NewsItem = { fact: string; source: string; confirmed: boolean };

export type MarketAnalysis = {
  title: string;
  analysis: string;
  researchLog: ResearchLogRow[];
  news: NewsItem[];
  hadWebContext: boolean;
  queryCount: number;
  hitCount: number;
  articleCount: number;
};

const BLOCKED = /(reddit\.|twitter\.com|\/\/x\.com|facebook\.|instagram\.|youtube\.|youtu\.be|tiktok\.|medium\.com|substack\.|quora\.|t\.me\/|stocktwits)/i;
const TRUSTED =
  /(reuters|bloomberg|cnbc|ft\.com|financial times|wsj|wall street journal|apnews|associated press|afp|eia\.gov|iea\.org|opec|usda|cmegroup|theice|lme\.com|kitco|mining\.com|businessrecorder|business recorder|brownfield|argus|spglobal|platts|marketwatch|federalreserve|ecb\.europa|gie\.eu|nasdaq\.com|barchart)/i;
const TIER3 = /(tradingeconomics|investing\.com)/i;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export function todayLabel(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

function score(hit: SearchHit): number {
  const blob = `${hit.title} ${hit.url}`;
  if (BLOCKED.test(blob)) return -1;
  if (TRUSTED.test(blob)) return 3;
  if (TIER3.test(blob)) return 1;
  return 0;
}

function buildQueries(focus: string, extraKeywords: string[], dateText: string): string[] {
  const sites = "(site:reuters.com OR site:cnbc.com OR site:bloomberg.com OR site:ft.com)";
  const queries = [
    `Brent WTI oil prices settle ${dateText} ${sites}`,
    `TTF European gas EU storage Henry Hub natural gas ${dateText} ${sites}`,
    `gold silver platinum palladium prices ${dateText} ${sites}`,
    `LME copper aluminium zinc nickel prices ${dateText}`,
    `CBOT corn wheat soybeans close ${dateText} Brownfield OR Reuters`,
    `Fed dollar Treasury yields commodities markets ${dateText} ${sites}`,
  ];
  const cleanFocus = focus
    .replace(/\s+/g, " ")
    .replace(/(write|écris|rédige)[\s\S]*$/i, "")
    .trim()
    .slice(0, 110);
  if (cleanFocus.length >= 8) queries.push(`${cleanFocus} ${sites}`);
  for (const k of extraKeywords.slice(0, 1)) queries.push(k.slice(0, 160));
  // Cap at 5: leave most of the ~150s edge wall-clock for the analysis LLM call.
  return queries.slice(0, 5);
}

async function gatherMarketResearch(opts: {
  focus: string;
  extraSources: SourceInput[];
  firecrawlKey?: string | null;
  dateText: string;
}): Promise<{ context: string; queryCount: number; hitCount: number; articleCount: number }> {
  const extraKeywords = opts.extraSources.filter((s) => s.type === "keyword").map((s) => s.value);
  const extraUrls = opts.extraSources.filter((s) => s.type === "url").map((s) => s.value).slice(0, 3);
  const ideas = opts.extraSources.filter((s) => s.type === "idea").map((s) => s.value);
  const queries = buildQueries(opts.focus, extraKeywords, opts.dateText);

  const results = await Promise.all(
    queries.map((q) =>
      withTimeout(
        searchKeyword(q, opts.firecrawlKey, 3).catch(() => [] as SearchHit[]),
        12000,
        [] as SearchHit[],
      )
    ),
  );

  const seen = new Set<string>();
  const chunks: string[] = [];
  const ranked: SearchHit[] = [];
  let hitCount = 0;
  results.forEach((hits, i) => {
    const fresh = hits.filter((h) => h.url && !seen.has(h.url) && score(h) >= 0);
    if (!fresh.length) return;
    fresh.forEach((h) => {
      seen.add(h.url);
      ranked.push(h);
    });
    hitCount += fresh.length;
    chunks.push(
      `# Search ${i + 1}: ${queries[i].replace(/\(site:[^)]*\)/g, "").trim()}\n\n` +
        fresh.map((h) => `- ${h.title}: ${h.description} (${h.url})`).join("\n"),
    );
  });

  ranked.sort((a, b) => score(b) - score(a));
  const toScrape = [
    ...extraUrls,
    ...ranked
      .map((h) => h.url)
      .filter((u) => /^https?:\/\//i.test(u) && !/google\.com\/search|duckduckgo\.com/i.test(u))
      .slice(0, 3),
  ];
  const uniqueScrape = [...new Set(toScrape)].slice(0, 3);
  const articles: string[] = [];
  await withTimeout(
    Promise.all(uniqueScrape.map(async (url) => {
      try {
        const md = await withTimeout(scrapeUrl(url, opts.firecrawlKey), 8000, null);
        if (md && md.length > 150 && /\d/.test(md)) articles.push(`# Article: ${url}\n\n${md.substring(0, 1600)}`);
      } catch { /* ignore */ }
    })),
    12000,
    [],
  );

  const parts: string[] = [];
  if (ideas.length) parts.push(`# Notes from the user\n\n${ideas.map((i) => `- ${i}`).join("\n")}`);
  if (chunks.length) parts.push(chunks.join("\n\n---\n\n"));
  if (articles.length) parts.push(articles.join("\n\n---\n\n"));
  return {
    // Keep context compact so the analysis LLM answers before the edge wall-clock.
    context: parts.join("\n\n=====\n\n").substring(0, 14000),
    queryCount: queries.length,
    hitCount,
    articleCount: articles.length,
  };
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const name = (e as { name?: string }).name || "";
  const msg = String((e as { message?: string }).message || "");
  return name === "AbortError" || /aborted|AbortError/i.test(msg);
}

async function callTool(
  provider: TextProvider,
  system: string,
  user: string,
  tool: { name: string; description: string; parameters: Record<string, unknown> },
  timeoutMs = 110000,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        tools: [{ type: "function", function: tool }],
        tool_choice: { type: "function", function: { name: tool.name } },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if (provider.url.startsWith("https://api.x.ai/")) throw new Error(xaiErrorMessage(res.status));
      throw new Error(`AI call failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    }
    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) throw new Error("AI returned no structured data");
    return JSON.parse(tc.function.arguments);
  } catch (e) {
    if (isAbortError(e)) {
      throw new Error(`Market analysis timed out after ${Math.round(timeoutMs / 1000)}s (model too slow or research too heavy). Retry or switch model.`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const ANALYSIS_TOOL = {
  name: "record_market_analysis",
  description: "Return the research log, striking news and the English market analysis",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short title of the analysis (max 70 chars)" },
      research_log: {
        type: "array",
        description: "One row per sourced figure. Only values found in the research.",
        items: {
          type: "object",
          properties: {
            asset: { type: "string" },
            value: { type: "string", description: "Level with unit, e.g. $104.77/bbl" },
            unit_contract: { type: "string", description: "Contract / instrument, e.g. Brent Jan futures" },
            change: { type: "string", description: "Reported change, e.g. -7.63%" },
            pct: { type: "number", description: "Numeric % change if reported or computable from reported numbers" },
            type: {
              type: "string",
              enum: ["settlement", "intraday", "spot", "futures", "indicative", "unknown"],
            },
            timestamp: { type: "string", description: "Snapshot date/time with timezone" },
            source: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            conflicts: { type: "string", description: "Conflicting figures or caveats, else empty" },
          },
          required: ["asset", "value", "change", "type", "timestamp", "source", "confidence"],
          additionalProperties: false,
        },
      },
      news: {
        type: "array",
        description: "3-5 striking facts with their source",
        items: {
          type: "object",
          properties: {
            fact: { type: "string" },
            source: { type: "string" },
            confirmed: { type: "boolean", description: "false for single-source or unconfirmed claims" },
          },
          required: ["fact", "source", "confirmed"],
          additionalProperties: false,
        },
      },
      analysis: { type: "string", description: "The English market analysis, markdown" },
    },
    required: ["title", "research_log", "news", "analysis"],
    additionalProperties: false,
  },
};

function analysisSystemPrompt(dateText: string, hasResearch: boolean): string {
  return `You are the senior commodity market analyst for CommoHedge, a commodity and FX hedging platform. Today is ${dateText} (UTC).

Work in two parts, in this order, and return both through the tool:
1. research_log: one row per figure you can source in the research below (energy: Brent, WTI, TTF, EU storage, Henry Hub; precious metals; LME base metals; agriculture; macro/FX such as Fed, dollar, yields). Then news: 3-5 striking facts with their source.
2. analysis: an English market analysis written ONLY from that log and the research.

HARD RULES
- Never invent a figure, quote, cause, forecast or "highest since / record / first time" claim. Missing data stays missing.
- Label every number in the log: settlement vs intraday vs spot vs futures, contract month, snapshot time with timezone. Mark derived numbers as "own calculation" in conflicts.
- Two sources that differ: keep the exchange or wire figure (Reuters, Bloomberg, CNBC, exchanges), explain the difference in conflicts, never average.
- Figures older than about 24 hours are stale: drop them or label the date clearly.
- Unconfirmed claims (armed groups, governments, single outlets) are written as "claims", "reports" or "says", and confirmed=false in news.
- Attribute forecasts to the named source. No investment advice.
- Ignore social media, forums, blogs, SEO "price today" pages and anything without a visible date.
${hasResearch ? "" : "- Web research returned nothing usable: return an empty research_log and a one-paragraph analysis saying live data was unavailable."}

ANALYSIS STRUCTURE (250-400 words, plain English, short sentences, no hype, no emojis)
- One-sentence summary of the day's main tension.
- Main news (facts + source).
- Short sections only for asset groups with fresh data (oil, gas, precious, base metals, agri, macro/FX).
- One short big-picture paragraph on how the moves connect.
- What to watch: dated catalysts only if they appear in the research.
Cite the outlet and date inline in brackets. Skip empty groups. Be concise — prefer a complete short analysis over a long one.`;
}

export async function runMarketAnalysis(opts: {
  focus: string;
  provider: TextProvider;
  firecrawlKey?: string | null;
  extraSources?: SourceInput[];
}): Promise<MarketAnalysis> {
  const dateText = todayLabel();
  const started = Date.now();
  const research = await gatherMarketResearch({
    focus: opts.focus || "",
    extraSources: opts.extraSources || [],
    firecrawlKey: opts.firecrawlKey,
    dateText: dateText.replace(/^\w+,?\s*/, ""),
  });
  const hasResearch = research.context.trim().length > 200;

  const user = `${opts.focus ? `Focus requested by the user: ${opts.focus}\n\n` : ""}${
    hasResearch
      ? `--- Web research (the only allowed source of facts and figures) ---\n${research.context}\n--- End research ---`
      : "No usable web research was found."
  }`;

  // Dynamic LLM budget: keep ~10s safety under a 150s edge wall-clock.
  const elapsed = Date.now() - started;
  const llmBudget = Math.max(50000, Math.min(110000, 140000 - elapsed));
  const out = await callTool(
    opts.provider,
    analysisSystemPrompt(dateText, hasResearch),
    user,
    ANALYSIS_TOOL,
    llmBudget,
  );
  const log = Array.isArray(out.research_log) ? (out.research_log as ResearchLogRow[]) : [];
  const news = Array.isArray(out.news) ? (out.news as NewsItem[]) : [];
  return {
    title: String(out.title || "Market analysis"),
    analysis: String(out.analysis || ""),
    researchLog: log,
    news,
    hadWebContext: hasResearch,
    queryCount: research.queryCount,
    hitCount: research.hitCount,
    articleCount: research.articleCount,
  };
}

/** Material handed to the post/chart step: the analysis and the log are the only allowed facts. */
export function buildAnalysisMaterial(analysis: string, researchLog: unknown, news?: unknown): string {
  const log = Array.isArray(researchLog) ? researchLog : [];
  const logJson = JSON.stringify(log).substring(0, 7000);
  const newsJson = Array.isArray(news) && news.length ? `\n\n--- Striking news (JSON) ---\n${JSON.stringify(news).substring(0, 2000)}` : "";
  return `--- Approved market analysis (English) ---\n${String(analysis).substring(0, 6500)}\n--- Research log (JSON; the only source for chart numbers) ---\n${logJson}${newsJson}\n--- End ---`;
}
