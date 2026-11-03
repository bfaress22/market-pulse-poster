/**
 * Web source gathering: Firecrawl when a key is available, otherwise free open fallbacks
 * (Jina Reader for URLs, Google News RSS + DuckDuckGo HTML for keyword search).
 */

export type SourceInput = { type: "url" | "keyword" | "idea"; value: string };

export type GatherOptions = {
  /** Prefer user's BYOK Firecrawl key, then env FIRECRAWL_API_KEY. */
  firecrawlKey?: string | null;
  maxUrls?: number;
  maxKeywords?: number;
  /** Skip search results whose URL is in this set (schedules dedupe). */
  usedUrls?: Set<string>;
  urlSnippetChars?: number;
};

function resolveFirecrawlKey(explicit?: string | null): string {
  return (explicit ?? "").trim() || (Deno.env.get("FIRECRAWL_API_KEY") ?? "").trim();
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
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
      });
      if (r.ok) {
        const d = await r.json();
        const md = d.data?.markdown || d.markdown;
        if (md) return String(md);
      } else {
        console.warn("firecrawl scrape status", r.status, (await r.text()).slice(0, 200));
      }
    } catch (e) {
      console.warn("firecrawl scrape fail", url, e);
    }
  }

  // Free: Jina Reader (no API key required for basic use)
  try {
    const r = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "User-Agent": "market-pulse-poster/1.0" },
    });
    if (r.ok) {
      const text = await r.text();
      if (text.trim().length > 80) return text;
    }
  } catch (e) {
    console.warn("jina scrape fail", url, e);
  }

  // Last resort: raw HTML → text
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const html = await r.text();
    const text = stripTags(html);
    return text.length > 80 ? text : null;
  } catch (e) {
    console.warn("raw scrape fail", url, e);
    return null;
  }
}

export type SearchHit = { title: string; description: string; url: string };

/** Keyword web search → list of hits. Always tries Firecrawl then free fallbacks. */
export async function searchKeyword(query: string, firecrawlKey?: string | null, limit = 3): Promise<SearchHit[]> {
  const fc = resolveFirecrawlKey(firecrawlKey);
  if (fc) {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: Math.max(limit, 5), tbs: "qdr:w" }),
      });
      const text = await r.text();
      if (r.ok) {
        let d: Record<string, unknown> = {};
        try { d = JSON.parse(text); } catch { /* ignore */ }
        const data = d.data;
        let raw: unknown[] = [];
        if (Array.isArray(data)) raw = data;
        else if (data && typeof data === "object") {
          const obj = data as Record<string, unknown>;
          if (Array.isArray(obj.web)) raw = obj.web;
          else if (Array.isArray(obj.results)) raw = obj.results;
        }
        if (!raw.length && Array.isArray((d as { web?: { results?: unknown[] } }).web?.results)) {
          raw = (d as { web: { results: unknown[] } }).web.results;
        }
        const hits = normalizeHits(raw);
        console.log("firecrawl search ok", { query: query.slice(0, 80), hits: hits.length });
        if (hits.length) return hits.slice(0, limit);
      } else {
        console.warn("firecrawl search status", r.status, text.slice(0, 300));
      }
    } catch (e) {
      console.warn("firecrawl search fail", query, e);
    }
  }

  // Free: Google News RSS
  try {
    const rssUrl =
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const r = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0)", Accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (r.ok) {
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
      if (hits.length) {
        console.log("google news rss ok", { query: query.slice(0, 80), hits: hits.length });
        return hits.slice(0, limit);
      }
    }
  } catch (e) {
    console.warn("google news rss fail", query, e);
  }

  // Free: DuckDuckGo HTML
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MarketPulseBot/1.0)",
        Accept: "text/html",
      },
    });
    if (r.ok) {
      const html = await r.text();
      const hits: SearchHit[] = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)>)?/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && hits.length < limit) {
        let href = m[1];
        const uddg = href.match(/[?&]uddg=([^&]+)/);
        if (uddg) href = decodeURIComponent(uddg[1]);
        hits.push({
          title: stripTags(m[2]),
          description: stripTags(m[3] || "").slice(0, 400),
          url: href,
        });
      }
      if (hits.length) {
        console.log("duckduckgo ok", { query: query.slice(0, 80), hits: hits.length });
        return hits;
      }
    }
  } catch (e) {
    console.warn("duckduckgo search fail", query, e);
  }

  console.warn("searchKeyword empty", { query: query.slice(0, 80), hadFirecrawl: !!fc });
  return [];
}

/** Build markdown context from mixed sources (ideas + urls + keywords). */
export async function gatherSourceContext(
  sources: SourceInput[],
  opts: GatherOptions = {},
): Promise<{ context: string; freshUrls: string[]; provider: "firecrawl" | "open"; hitCount: number }> {
  const firecrawlKey = resolveFirecrawlKey(opts.firecrawlKey);
  const provider = firecrawlKey ? "firecrawl" : "open";
  const maxUrls = opts.maxUrls ?? 4;
  const maxKeywords = opts.maxKeywords ?? 4;
  const snippet = opts.urlSnippetChars ?? 2500;
  const used = opts.usedUrls ?? new Set<string>();
  const chunks: string[] = [];
  const freshUrls: string[] = [];
  let hitCount = 0;

  const ideas = sources.filter((s) => s.type === "idea").map((s) => s.value).filter(Boolean);
  if (ideas.length) chunks.push(`# Ideas / notes from the user\n\n${ideas.map((i) => `- ${i}`).join("\n")}`);

  const urls = sources.filter((s) => s.type === "url").map((s) => s.value).filter(Boolean).slice(0, maxUrls);
  const keywords = sources.filter((s) => s.type === "keyword").map((s) => s.value).filter(Boolean).slice(0, maxKeywords);

  await Promise.all(urls.map(async (url) => {
    const md = await scrapeUrl(url, firecrawlKey);
    if (md) {
      chunks.push(`# Source: ${url}\n\n${md.substring(0, snippet)}`);
      freshUrls.push(url);
      hitCount++;
    }
  }));

  await Promise.all(keywords.map(async (kw) => {
    const results = await searchKeyword(kw, firecrawlKey, used.size ? 5 : 4);
    const fresh = results.filter((x) => x.url && !used.has(x.url)).slice(0, 4);
    if (!fresh.length) return;
    hitCount += fresh.length;
    const summary = fresh.map((x) => `- ${x.title}: ${x.description} (${x.url})`).join("\n");
    chunks.push(`# Search: ${kw}\n\n${summary}`);
    for (const x of fresh) freshUrls.push(x.url);
  }));

  return { context: chunks.join("\n\n---\n\n"), freshUrls, provider, hitCount };
}
