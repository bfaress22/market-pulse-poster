// On-demand LinkedIn text generator with free-form prompt + optional sources + market-brief research
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { gatherSourceContext, type SourceInput } from "../_shared/web-sources.ts";
import {
  detectLanguageOverride,
  detectMarketBrief,
  gatherMarketBriefContext,
  marketBriefSystemPrompt,
  wantsXPost,
} from "../_shared/market-research.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LANG_NAMES: Record<string, string> = {
  fr: "French (Français)", en: "English", es: "Spanish (Español)",
  de: "German (Deutsch)", ar: "Arabic (العربية)",
};

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

    const promptText = typeof prompt === "string" ? prompt.trim() : "";
    const includeX = wantsXPost(promptText);
    const langCode = detectLanguageOverride(promptText) || String(language || "fr");
    const langName = LANG_NAMES[langCode] || LANG_NAMES.fr;

    let sourceContext = "";
    let sourceProvider: "firecrawl" | "open" = "open";
    let queryCount = 0;
    let researchUrls: string[] = [];

    if (mode !== "improve" && (marketBrief || resolvedSources.length || promptText.length > 12)) {
      if (detectMarketBrief(promptText)) {
        const brief = await gatherMarketBriefContext({
          prompt: promptText,
          sources: resolvedSources,
          firecrawlKey: s?.firecrawl_api_key,
        });
        sourceContext = brief.context;
        sourceProvider = brief.provider;
        queryCount = brief.queryCount;
        researchUrls = brief.freshUrls;
      } else {
        const planned = resolvedSources.length
          ? resolvedSources
          : [{ type: "keyword" as const, value: promptText.slice(0, 180) }];
        const gathered = await gatherSourceContext(planned, { firecrawlKey: s?.firecrawl_api_key });
        sourceContext = gathered.context;
        sourceProvider = gathered.provider;
        researchUrls = gathered.freshUrls;
      }
    }

    const { model, url, key } = resolveTextProvider(s?.post_model || "google/gemini-3-flash-preview", s);

    const hasResearch = sourceContext.trim().length > 80;
    const sys = detectMarketBrief(promptText)
      ? `${marketBriefSystemPrompt(langName, hasResearch, includeX)}
${s?.tone_instructions ? `\nExtra brand voice from settings (do not override figure rules):\n${s.tone_instructions}` : ""}`
      : `You write engaging LinkedIn posts in the user's voice.
LANGUAGE: Write the entire post (title, body, hashtags, CTA) strictly in ${langName}.
Rules: 150-300 words, 5-7 hashtags, sparing emojis, end with a CTA/question.
${s?.tone_instructions ? `User tone:\n${s.tone_instructions}` : ""}
${hasResearch
  ? "You HAVE live web research. Ground claims in it. Do not invent figures."
  : "No live web research. Do not invent live prices."}
${includeX ? "Also fill x_post (≤280 chars)." : "Set x_post to empty string."}
Return JSON via the write_post tool.`;

    const sourceBlock = hasResearch
      ? `\n\n=== RESEARCH (Tier-1 preferred; use only these facts for numbers) ===\n${sourceContext.substring(0, 20000)}\n=== END RESEARCH ===`
      : "\n\n(No research snippets retrieved.)";

    let userMsg: unknown;
    if (mode === "improve" && currentText) {
      userMsg = `Rewrite and polish this draft into a great LinkedIn post:\n\n${currentText}\n\n${promptText ? `Extra instructions: ${promptText}` : ""}${sourceBlock}`;
    } else if (imageUrl) {
      userMsg = [
        { type: "text", text: `Write a LinkedIn post about this image. ${promptText || ""}${sourceBlock}` },
        { type: "image_url", image_url: { url: imageUrl } },
      ];
    } else {
      userMsg = `${promptText || "Write a thought-provoking LinkedIn post on a topic relevant to my industry."}${sourceBlock}

Deliver:
- LinkedIn post as specified
${includeX ? "- X/Twitter version ≤280 characters" : ""}
- verify_before_publish: checklist of items the human must confirm before publishing (sources, timestamps, settlement vs intraday)`;
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
            description: "Write a LinkedIn market post (and optional X post) grounded in research",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short internal title (≤80 chars)" },
                content: { type: "string", description: "Full LinkedIn post body with sources line and hashtags" },
                x_post: { type: "string", description: "Optional X/Twitter post ≤280 chars, or empty" },
                sources_line: { type: "string", description: "Compact sources attribution line" },
                verify_before_publish: {
                  type: "array",
                  items: { type: "string" },
                  description: "Checklist of facts/timestamps the human should verify before publishing",
                },
              },
              required: ["title", "content", "x_post", "sources_line", "verify_before_publish"],
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
      x_post: out.x_post || "",
      sources_line: out.sources_line || "",
      verify_before_publish: Array.isArray(out.verify_before_publish) ? out.verify_before_publish : [],
      usedSources: resolvedSources.length,
      sourceProvider,
      hadWebContext: hasResearch,
      queryCount,
      researchUrlCount: researchUrls.length,
      languageUsed: langCode,
      marketBrief: detectMarketBrief(promptText),
    });
  } catch (e) {
    console.error("compose-text error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
