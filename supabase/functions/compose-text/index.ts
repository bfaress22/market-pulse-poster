// On-demand LinkedIn text generator with free-form prompt + optional sources (URLs/keywords/ideas) + image context
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { gatherSourceContext, type SourceInput } from "../_shared/web-sources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
      .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, firecrawl_api_key, tone_instructions")
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
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          resolvedSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    // If nothing selected, use all enabled saved sources so market briefs still get live context
    if (!resolvedSources.length) {
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

    // From a free-form prompt alone: derive a keyword search so BYOK models still get web context
    if (!resolvedSources.length && typeof prompt === "string" && prompt.trim().length > 12) {
      resolvedSources = [{ type: "keyword", value: prompt.trim().slice(0, 180) }];
    }

    const { context: sourceContext, provider: sourceProvider } = resolvedSources.length
      ? await gatherSourceContext(resolvedSources, { firecrawlKey: s?.firecrawl_api_key })
      : { context: "", provider: "open" as const };

    const { model, url, key } = resolveTextProvider(s?.post_model || "google/gemini-3-flash-preview", s);

    const LANG_NAMES: Record<string, string> = {
      fr: "French (Français)", en: "English", es: "Spanish (Español)",
      de: "German (Deutsch)", ar: "Arabic (العربية)",
    };
    const langName = LANG_NAMES[String(language || "fr")] || LANG_NAMES.fr;

    const sys = `You write engaging LinkedIn posts in the user's voice.
LANGUAGE: Write the entire post (title, body, hashtags, CTA) strictly in ${langName}. Never use another language, whatever the language of the sources or instructions.
Rules: 150-300 words, 5-7 hashtags, sparing emojis, end with a CTA/question.
${s?.tone_instructions ? `User tone:\n${s.tone_instructions}` : ""}
${sourceContext
  ? `You HAVE live web research below. Ground prices, news and claims ONLY in that research. Cite sources briefly when the tone requires it. Do not invent figures missing from the research.`
  : `No live web research was attached. Do not invent live prices or settlement figures. Write a high-level post or ask for sources.`}
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
      if (url.startsWith("https://api.x.ai/")) return json(res.status, { success: false, error: xaiErrorMessage(res.status) });
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
    return json(200, {
      success: true,
      ...out,
      usedSources: resolvedSources.length,
      sourceProvider,
      hadWebContext: !!sourceContext,
    });
  } catch (e) {
    console.error("compose-text error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
