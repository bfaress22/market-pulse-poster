/**
 * Web source gathering: Firecrawl when a key is available, otherwise free open fallbacks
 * (Jina Reader for URLs, Google News RSS + DuckDuckGo HTML for keyword search).
 * All network calls are hard-timeouted so edge functions never hang.
 */

export type SourceInput = { type: "url" | "keyword" | "idea"; value: string };

export type GatherOptions = {
  firecrawlKey?: string | null;
  maxUrls?: number;
  maxKeywords?: number;
  usedUrls?: Set<string>;
  urlSnippetChars?: number;
  /** Hard budget for the whole gather (ms). */
  budgetMs?: number;
};

function resolveFirecrawlKey(explicit?: string | null): string {
  return (explicit ?? "").trim() || (Deno.env.get("FIRECRAWL_API_KEY") ?? "").trim();
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type SearchHit = { title: string; description: string; url: string };

function normalizeHits(raw: unknown[]): SearchHit[] {
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const x = item as Record<string, unknown>;
      const url = String(x.url || x.link || x.sourceURL || "").trim();
      if (!url) return null;
      return {
        title: String(x.title || x.name || "").trim(),
        description: String(x.description || x.snippet || x.markdown || "").trim().slice(0, 500),
        url,
      };
    })
    .filter((x): x is SearchHit => !!x);
}

/** Scrape a single URL → markdown/text. */
export async function scrapeUrl(url: string, firecrawlKey?: string | null): Promise<string | null> {
  const fc = resolveFirecrawlKey(firecrawlKey);
  if (fc) {
    try {
      const r = await fetchWithTimeout("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 800 }),
      }, 10000);
      if (r.ok) {
        const d = await r.json();
        const md = d.data?.markdown || d.markdown;
        if (md) return String(md);
      } else {
        console.warn("firecrawl scrape status", r.status);
      }
    } catch (e) {
      console.warn("firecrawl scrape fail", url, String(e));
    }
  }

  try {
    const r = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "User-Agent": "market-pulse-poster/1.0" },
    }, 8000);
    if (r.ok) {
      const text = await r.text();
      if (text.trim().length > 80) return text;
    }
  } catch (e) {
    console.warn("jina scrape fail", url, String(e));
  }

  try {
    const r = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    }, 6000);
    if (!r.ok) return null;
    const html = await r.text();
    const text = stripTags(html);
    return text.length > 80 ? text : null;
  } catch (e) {
    console.warn("raw scrape fail", url, String(e));
    return null;
  }
}

async function searchGoogleNews(query: string, limit: number): Promise<SearchHit[]> {
  const rssUrl =
    `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const r = await fetchWithTimeout(rssUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0)", Accept: "application/rss+xml, application/xml, text/xml" },
  }, 7000);
  if (!r.ok) return [];
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, limit + 2);
  const hits: SearchHit[] = [];
  for (const m of items) {
    const block = m[1];
    const title = decodeXml((block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim());
    const link = decodeXml((block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim());
    const desc = stripTags(decodeXml((block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "").trim()));
    if (link) hits.push({ title, description: desc.slice(0, 400), url: link });
  }
  return hits.slice(0, limit);
}

async function searchFirecrawl(query: string, firecrawlKey: string, limit: number): Promise<SearchHit[]> {
  const r = await fetchWithTimeout("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${firecrawlKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: Math.max(limit, 5), tbs: "qdr:w" }),
  }, 10000);
  const text = await r.text();
  if (!r.ok) {
    console.warn("firecrawl search status", r.status, text.slice(0, 200));
    return [];
  }
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(text); } catch { return []; }
  const data = d.data;
  let raw: unknown[] = [];
  if (Array.isArray(data)) raw = data;
  else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.web)) raw = obj.web;
    else if (Array.isArray(obj.results)) raw = obj.results;
  }
  return normalizeHits(raw).slice(0, limit);
}

/** Keyword web search → Firecrawl first (if key), then Google News. */
export async function searchKeyword(query: string, firecrawlKey?: string | null, limit = 3): Promise<SearchHit[]> {
  const fc = resolveFirecrawlKey(firecrawlKey);
  if (fc) {
    try {
      const hits = await searchFirecrawl(query, fc, limit);
      if (hits.length) {
        console.log("firecrawl search ok", { q: query.slice(0, 60), hits: hits.length });
        return hits;
      }
    } catch (e) {
      console.warn("firecrawl search fail", String(e));
    }
  }

  try {
    const hits = await searchGoogleNews(query, limit);
    if (hits.length) {
      console.log("google news ok", { q: query.slice(0, 60), hits: hits.length });
      return hits;
    }
  } catch (e) {
    console.warn("google news fail", String(e));
  }

  console.warn("searchKeyword empty", { q: query.slice(0, 60), hadFirecrawl: !!fc });
  return [];
}

/** Build markdown context from mixed sources. Honors budgetMs. */
export async function gatherSourceContext(
  sources: SourceInput[],
  opts: GatherOptions = {},
): Promise<{ context: string; freshUrls: string[]; provider: "firecrawl" | "open"; hitCount: number }> {
  const firecrawlKey = resolveFirecrawlKey(opts.firecrawlKey);
  const provider = firecrawlKey ? "firecrawl" : "open";
  const maxUrls = opts.maxUrls ?? 3;
  const maxKeywords = opts.maxKeywords ?? 3;
  const snippet = opts.urlSnippetChars ?? 1800;
  const used = opts.usedUrls ?? new Set<string>();
  const budgetMs = opts.budgetMs ?? 15000;
  const deadline = Date.now() + budgetMs;

  const chunks: string[] = [];
  const freshUrls: string[] = [];
  let hitCount = 0;

  const ideas = sources.filter((s) => s.type === "idea").map((s) => s.value).filter(Boolean);
  if (ideas.length) chunks.push(`# Ideas / notes from the user\n\n${ideas.map((i) => `- ${i}`).join("\n")}`);

  const urls = sources.filter((s) => s.type === "url").map((s) => s.value).filter(Boolean).slice(0, maxUrls);
  const keywords = sources.filter((s) => s.type === "keyword").map((s) => s.value).filter(Boolean).slice(0, maxKeywords);

  // Keywords first (fast headlines), then optional URL scrapes if time remains.
  for (const kw of keywords) {
    if (Date.now() > deadline) break;
    try {
      const results = await searchKeyword(kw, firecrawlKey, used.size ? 4 : 3);
      const fresh = results.filter((x) => x.url && !used.has(x.url)).slice(0, 3);
      if (!fresh.length) continue;
      hitCount += fresh.length;
      chunks.push(`# Search: ${kw}\n\n${fresh.map((x) => `- ${x.title}: ${x.description} (${x.url})`).join("\n")}`);
      for (const x of fresh) freshUrls.push(x.url);
    } catch (e) {
      console.warn("keyword gather fail", String(e));
    }
  }

  await Promise.all(urls.map(async (url) => {
    if (Date.now() > deadline) return;
    try {
      const md = await scrapeUrl(url, firecrawlKey);
      if (md) {
        chunks.push(`# Source: ${url}\n\n${md.substring(0, snippet)}`);
        freshUrls.push(url);
        hitCount++;
      }
    } catch (e) {
      console.warn("url gather fail", String(e));
    }
  }));

  return { context: chunks.join("\n\n---\n\n"), freshUrls, provider, hitCount };
}
