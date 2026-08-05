// On-demand LinkedIn text generator with free-form prompt + optional sources (URLs/keywords/ideas) + image context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type SourceInput = { type: "url" | "keyword" | "idea"; value: string };

async function gatherSourceContext(sources: SourceInput[]): Promise<string> {
  const fc = Deno.env.get("FIRECRAWL_API_KEY");
  const chunks: string[] = [];

  const ideas = sources.filter((s) => s.type === "idea").map((s) => s.value).filter(Boolean);
  if (ideas.length) chunks.push(`# Ideas / notes from the user\n\n${ideas.map((i) => `- ${i}`).join("\n")}`);

  const urls = sources.filter((s) => s.type === "url").map((s) => s.value).filter(Boolean).slice(0, 4);
  const keywords = sources.filter((s) => s.type === "keyword").map((s) => s.value).filter(Boolean).slice(0, 4);

  if (!fc) {
    if (urls.length || keywords.length) {
      chunks.push(`# References (raw)\n\n${[...urls, ...keywords.map((k) => `keyword: ${k}`)].map((x) => `- ${x}`).join("\n")}`);
    }
    return chunks.join("\n\n---\n\n");
  }

  await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
      });
      const d = await r.json();
      const md = d.data?.markdown || d.markdown;
      if (md) chunks.push(`# Source: ${url}\n\n${String(md).substring(0, 2500)}`);
    } catch (e) { console.warn("scrape failed", url, e); }
  }));

  await Promise.all(keywords.map(async (kw) => {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: kw, limit: 3, tbs: "qdr:w" }),
      });
      const d = await r.json();
      const results = d.data || d.web?.results || [];
      const summary = results.map((x: any) => `- ${x.title || ""}: ${x.description || ""} (${x.url || ""})`).join("\n");
      if (summary) chunks.push(`# Search: ${kw}\n\n${summary}`);
    } catch (e) { console.warn("search failed", kw, e); }
  }));

  return chunks.join("\n\n---\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { prompt, currentText, imageUrl, mode, sources, savedSourceIds, language } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("post_model, use_byok, openai_api_key, tone_instructions")
      .eq("user_id", userId).maybeSingle();

    // Resolve saved sources by id
    let resolvedSources: SourceInput[] = Array.isArray(sources) ? sources : [];
    if (Array.isArray(savedSourceIds) && savedSourceIds.length) {
      const { data: saved } = await supabase
        .from("content_sources")
        .select("id, source_type, value")
        .eq("user_id", userId)
        .in("id", savedSourceIds);
      for (const r of saved || []) {
        if (r.source_type === "url" || r.source_type === "keyword") {
          resolvedSources.push({ type: r.source_type as any, value: r.value });
        }
      }
    }

    const sourceContext = resolvedSources.length ? await gatherSourceContext(resolvedSources) : "";

    let model = s?.post_model || "google/gemini-3-flash-preview";
    let url = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let key = Deno.env.get("LOVABLE_API_KEY");
    if (s?.use_byok && model.startsWith("openai/") && s.openai_api_key) {
      url = "https://api.openai.com/v1/chat/completions";
      key = s.openai_api_key;
      model = model.replace("openai/", "");
    }
    if (!key) return json(500, { success: false, error: "No API key" });

    const LANG_NAMES: Record<string, string> = {
      fr: "French (Français)", en: "English", es: "Spanish (Español)",
      de: "German (Deutsch)", ar: "Arabic (العربية)",
    };
    const langName = LANG_NAMES[String(language || "fr")] || LANG_NAMES.fr;

    const sys = `You write engaging LinkedIn posts in the user's voice.
LANGUAGE: Write the entire post (title, body, hashtags, CTA) strictly in ${langName}. Never use another language, whatever the language of the sources or instructions.
Rules: 150-300 words, 5-7 hashtags, sparing emojis, end with a CTA/question.
${s?.tone_instructions ? `User tone:\n${s.tone_instructions}` : ""}
Return JSON via the write_post tool.`;

    const sourceBlock = sourceContext
      ? `\n\nUse the following references / inspiration to ground the post (do not copy verbatim, synthesize):\n\n${sourceContext.substring(0, 12000)}`
      : "";

    let userMsg: any;
    if (mode === "improve" && currentText) {
      userMsg = `Rewrite and polish this draft into a great LinkedIn post:\n\n${currentText}\n\n${prompt ? `Extra instructions: ${prompt}` : ""}${sourceBlock}`;
    } else if (imageUrl) {
      userMsg = [
        { type: "text", text: `Write a LinkedIn post about this image. ${prompt || ""}${sourceBlock}` },
        { type: "image_url", image_url: { url: imageUrl } },
      ];
    } else {
      userMsg = `${prompt || "Write a thought-provoking LinkedIn post on a topic relevant to my industry."}${sourceBlock}`;
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
            description: "Write a LinkedIn post",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short internal title (≤80 chars)" },
                content: { type: "string", description: "Full post body with hashtags" },
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
      if (res.status === 429) return json(429, { success: false, error: "Rate limit exceeded." });
      if (res.status === 402) return json(402, { success: false, error: "Add credits to your workspace." });
      const t = await res.text();
      if (res.status === 403 && t.includes("credit_limit_reached")) {
        return json(403, { success: false, error: "Limite de crédits IA atteinte pour cet espace de travail. Le propriétaire doit augmenter la limite (Settings → Plans & credits)." });
      }
      return json(500, { success: false, error: `AI error [${res.status}]: ${t}` });
    }

    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return json(500, { success: false, error: "AI returned no structured data" });
    const out = JSON.parse(tc.function.arguments);
    return json(200, { success: true, ...out, usedSources: resolvedSources.length });
  } catch (e) {
    console.error("compose-text error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
