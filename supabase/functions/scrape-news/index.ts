import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveProjectFirecrawlKey } from "../_shared/firecrawl.ts";
import { gatherSourceContext, type SourceInput } from "../_shared/web-sources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: settings } = await supabase
      .from("user_settings")
      .select("firecrawl_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    const { data: sources } = await supabase.from("content_sources")
      .select("source_type, value").eq("user_id", userId).eq("enabled", true);

    const resolved: SourceInput[] = (sources || [])
      .filter((s) => s.source_type === "url" || s.source_type === "keyword" || s.source_type === "idea")
      .map((s) => ({ type: s.source_type as SourceInput["type"], value: s.value }));

    if (!resolved.length) {
      return json(400, { success: false, error: "No enabled sources. Add URLs or keywords in Settings." });
    }

    const firecrawlKey = await resolveProjectFirecrawlKey(supabase, settings?.firecrawl_api_key);
    const { context, provider } = await gatherSourceContext(resolved, {
      firecrawlKey,
      maxUrls: 5,
      maxKeywords: 5,
      urlSnippetChars: 3000,
    });

    if (!context.trim()) {
      return json(400, {
        success: false,
        error: "All scrapes/searches failed. Retry later or add different sources.",
        provider,
      });
    }

    return json(200, { success: true, markdown: context, provider });
  } catch (e) {
    console.error("scrape-news error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
