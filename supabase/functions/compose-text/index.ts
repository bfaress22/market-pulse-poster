// On-demand LinkedIn text: follow the user prompt directly.
// Memory (tone + enabled sources) only when useMemory=true (automation).
// Web research runs when the user attaches sources OR the prompt asks to search the web.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { gatherSourceContext, scrapeUrl, type SourceInput } from "../_shared/web-sources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SITE_ALIASES: Record<string, string> = {
  reuters: "reuters.com",
  bloomberg: "bloomberg.com",
  cnbc: "cnbc.com",
  "financial times": "ft.com",
  ft: "ft.com",
  wsj: "wsj.com",
  "wall street journal": "wsj.com",
  eia: "eia.gov",
  investing: "investing.com",
  "trading economics": "tradingeconomics.com",
};

/** True when the prompt explicitly asks for live web / figures / news lookup. */
function wantsWebResearch(prompt: string): boolean {
  return /cherche|search|web|look\s*up|research|reuters|bloomberg|cnbc|eia|chiffres?|figures?|prix|prices?|latest|aujourd.?hui|today|actualité|news|sources?\s+fiables|reliable\s+sources|bourses?|exchange|settlement|clôture|market\s+movers?/i.test(prompt);
}

function extractPreferredSites(prompt: string): string[] {
  const lower = prompt.toLowerCase();
  const sites = new Set<string>();
  for (const [alias, host] of Object.entries(SITE_ALIASES)) {
    if (lower.includes(alias)) sites.add(host);
  }
  if (/sources?\s+fiables|reliable\s+sources|tier[- ]?1|bourses?/i.test(prompt)) {
    for (const host of ["reuters.com", "bloomberg.com", "cnbc.com", "ft.com", "eia.gov"]) sites.add(host);
  }
  return [...sites];
}

/** Build focused keyword searches from the user prompt (never dump the whole brief as one query). */
function buildResearchKeywords(prompt: string): SourceInput[] {
  const sites = extractPreferredSites(prompt);
  const siteFilter = sites.length ? `(${sites.map((s) => `site:${s}`).join(" OR ")})` : "";

  // Strip writing instructions so the search query stays topical.
  let topic = prompt
    .replace(/n['']invente[\s\S]*$/i, "")
    .replace(/(puis|then)\s+(écris|write|rédige)[\s\S]*$/i, "")
    .replace(/écris\s+un\s+post[\s\S]*$/i, "")
    .replace(/write\s+a\s+(linkedin\s+)?post[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  if (!topic) topic = prompt.replace(/\s+/g, " ").trim().slice(0, 160);

  const queries: string[] = [];
  if (topic) {
    queries.push(siteFilter ? `${topic} ${siteFilter}` : topic);
  }

  // Extra focused queries when the brief is about markets/commodities (from the prompt itself).
  if (/commodit|marché|market|oil|brent|wti|gas|gold|copper|wheat|metals?/i.test(prompt)) {
    const movers = siteFilter
      ? `commodity market movers today prices ${siteFilter}`
      : "commodity market movers today oil gas gold copper wheat";
    queries.push(movers);
  }

  const seen = new Set<string>();
  const out: SourceInput[] = [];
  for (const q of queries) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: "keyword", value: q.slice(0, 220) });
    if (out.length >= 6) break;
  }
  return out;
}

async function scrapeTopArticles(
  urls: string[],
  firecrawlKey?: string | null,
  limit = 5,
): Promise<string> {
  const unique = [...new Set(urls)]
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((u) => !/google\.com\/search|duckduckgo\.com/i.test(u))
    .slice(0, limit);

  const chunks: string[] = [];
  await Promise.all(unique.map(async (url) => {
    const md = await scrapeUrl(url, firecrawlKey);
    if (md && md.length > 120) {
      chunks.push(`# Article extract: ${url}\n\n${md.substring(0, 2800)}`);
    }
  }));
  return chunks.join("\n\n---\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      prompt,
      currentText,
      imageUrl,
      mode,
      sources,
      savedSourceIds,
      useMemory = false,
    } = body;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, firecrawl_api_key, tone_instructions")
      .eq("user_id", userId).maybeSingle();

    const automated = useMemory === true;
    let resolvedSources: SourceInput[] = Array.isArray(sources) ? sources : [];

    if (Array.isArray(savedSourceIds) && savedSourceIds.length) {
      const { data: saved } = await supabase
        .from("content_sources")
        .select("id, source_type, value")
        .eq("user_id", userId)
        .in("id", savedSourceIds);
      for (const r of saved || []) {
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          resolvedSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    if (automated && !resolvedSources.length) {
      const { data: enabled } = await supabase
        .from("content_sources")
        .select("source_type, value")
        .eq("user_id", userId)
        .eq("enabled", true)
        .limit(8);
      for (const r of enabled || []) {
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          resolvedSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    const promptText = typeof prompt === "string" ? prompt.trim() : "";
    const researchRequested = mode !== "improve" && wantsWebResearch(promptText);

    // If the prompt asks to search the web and no explicit sources were given, derive keywords.
    if (researchRequested && !resolvedSources.some((x) => x.type === "url" || x.type === "keyword")) {
      resolvedSources = [...resolvedSources, ...buildResearchKeywords(promptText)];
    }

    let sourceContext = "";
    let sourceProvider: "firecrawl" | "open" = "open";
    let researchUrls: string[] = [];
    let queryCount = 0;

    if (mode !== "improve" && resolvedSources.length) {
      queryCount = resolvedSources.filter((x) => x.type === "keyword").length;
      const gathered = await gatherSourceContext(resolvedSources, {
        firecrawlKey: s?.firecrawl_api_key,
        maxUrls: 6,
        maxKeywords: 6,
        urlSnippetChars: 2500,
      });
      sourceContext = gathered.context;
      sourceProvider = gathered.provider;
      researchUrls = gathered.freshUrls;

      // Scrape top hit pages so the model sees figures, not only headlines.
      if (researchRequested && researchUrls.length) {
        const articles = await scrapeTopArticles(researchUrls, s?.firecrawl_api_key, 5);
        if (articles) {
          sourceContext = [sourceContext, articles].filter(Boolean).join("\n\n---\n\n").substring(0, 28000);
        }
      }
    }

    const { model, url, key } = resolveTextProvider(s?.post_model || "google/gemini-3-flash-preview", s);
    const hasResearch = sourceContext.trim().length > 80;
    const tone = automated && s?.tone_instructions?.trim() ? s.tone_instructions.trim() : "";

    const sys = `Follow the user's instructions exactly. Write the LinkedIn post they asked for.
Do not add branding, CTAs, hashtags, emojis, length rules, or structure unless the user requested them.
Return JSON via the write_post tool (title + content).
${tone ? `\nAutomation voice/memory from settings:\n${tone}` : ""}
${hasResearch
  ? "WEB RESEARCH IS ATTACHED below. Ground every figure, %, price, and factual claim ONLY in that research. Prefer outlets the user named. If a number is missing, omit it — never invent."
  : researchRequested
    ? "Web research was requested but no usable snippets were retrieved. Say briefly that live figures were unavailable. Do not invent prices or moves."
    : ""}`;

    const sourceBlock = hasResearch
      ? `\n\n--- Web research (use for facts/figures only) ---\n${sourceContext.substring(0, 22000)}\n--- End research ---`
      : "";

    let userMsg: unknown;
    if (mode === "improve" && currentText) {
      userMsg = `Improve this LinkedIn draft according to the instructions.\n\nDraft:\n${currentText}\n\nInstructions: ${promptText || "Polish clarity and flow."}${sourceBlock}`;
    } else if (imageUrl) {
      userMsg = [
        { type: "text", text: `${promptText || "Write a LinkedIn post about this image."}${sourceBlock}` },
        { type: "image_url", image_url: { url: imageUrl } },
      ];
    } else {
      userMsg = `${promptText || "Write a LinkedIn post."}${sourceBlock}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        tools: [{
          type: "function",
          function: {
            name: "write_post",
            description: "Return the LinkedIn post",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short internal title" },
                content: { type: "string", description: "Full LinkedIn post body as requested" },
              },
              required: ["title", "content"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_post" } },
      }),
    });
    if (!res.ok) {
      if (url.startsWith("https://api.x.ai/")) return json(res.status, { success: false, error: xaiErrorMessage(res.status) });
      if (res.status === 429) return json(429, { success: false, error: "Rate limit exceeded." });
      if (res.status === 402) return json(402, { success: false, error: "Add credits to your workspace." });
      const t = await res.text();
      return json(500, { success: false, error: `AI error [${res.status}]: ${t}` });
    }

    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return json(500, { success: false, error: "AI returned no structured data" });
    const out = JSON.parse(tc.function.arguments);
    return json(200, {
      success: true,
      title: out.title,
      content: out.content,
      usedSources: resolvedSources.length,
      sourceProvider,
      hadWebContext: hasResearch,
      researchRequested,
      queryCount,
      researchUrlCount: researchUrls.length,
      usedFirecrawl: sourceProvider === "firecrawl",
      usedMemory: automated,
    });
  } catch (e) {
    console.error("compose-text error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
