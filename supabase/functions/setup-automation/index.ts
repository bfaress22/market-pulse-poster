import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/cron-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = await requireUser(req, supabase);
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const url = Deno.env.get("SUPABASE_URL");
    let secret = Deno.env.get("CRON_SECRET") || "";
    if (!secret) {
      const { data: existing } = await supabase.from("automation_config").select("cron_secret").eq("id", 1).maybeSingle();
      secret = existing?.cron_secret || crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    }
    if (!url) return json(500, { success: false, error: "SUPABASE_URL missing" });

    const { error: cfgErr } = await supabase.rpc("upsert_automation_config", { p_url: url, p_secret: secret });
    if (cfgErr) return json(500, { success: false, error: cfgErr.message });

    const { data: ensured, error: cronErr } = await supabase.rpc("ensure_automation_cron");
    if (cronErr) {
      return json(200, {
        success: false,
        configured: true,
        error: cronErr.message,
        hint: "pg_cron/pg_net must be enabled. Re-run this after enabling extensions.",
      });
    }

    const { data: jobs } = await supabase.rpc("list_automation_cron");
    return json(200, {
      success: !!ensured?.ok,
      configured: true,
      jobs: jobs ?? ensured?.jobs ?? [],
      supabaseUrl: url,
      hasCronSecret: true,
    });
  } catch (e) {
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
