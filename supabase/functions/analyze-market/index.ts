// Step 1 of the CommoHedge pipeline: deep research -> research log -> English analysis.
// The post + chart step (compose-text) then works from this output only.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider } from "../_shared/ai-text.ts";
import { resolveProjectFirecrawlKey } from "../_shared/firecrawl.ts";
import type { SourceInput } from "../_shared/web-sources.ts";
import { runMarketAnalysis } from "../_shared/market-analysis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const { prompt, sources, savedSourceIds } = await req.json();

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, firecrawl_api_key")
      .eq("user_id", userId).maybeSingle();

    const extraSources: SourceInput[] = Array.isArray(sources) ? [...sources] : [];
    if (Array.isArray(savedSourceIds) && savedSourceIds.length) {
      const { data: saved } = await supabase
        .from("content_sources")
        .select("source_type, value")
        .eq("user_id", userId)
        .in("id", savedSourceIds);
      for (const r of saved || []) {
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          extraSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    const provider = resolveTextProvider(s?.post_model || "google/gemini-3-flash-preview", s);
    const firecrawlKey = await resolveProjectFirecrawlKey(supabase, s?.firecrawl_api_key);

    const result = await runMarketAnalysis({
      focus: typeof prompt === "string" ? prompt.trim() : "",
      provider,
      firecrawlKey,
      extraSources,
    });

    console.log("analyze-market done", {
      rows: result.researchLog.length,
      hits: result.hitCount,
      articles: result.articleCount,
      hadWebContext: result.hadWebContext,
    });

    return json(200, {
      success: true,
      title: result.title,
      analysis: result.analysis,
      researchLog: result.researchLog,
      news: result.news,
      hadWebContext: result.hadWebContext,
      queryCount: result.queryCount,
      hitCount: result.hitCount,
      articleCount: result.articleCount,
      usedFirecrawl: !!firecrawlKey,
    });
  } catch (e) {
    console.error("analyze-market error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
