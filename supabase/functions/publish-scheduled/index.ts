// Cron-triggered: publishes posts whose scheduled_at <= now()
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTargets, publishToTarget } from "../_shared/linkedin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function publishOne(supabase: any, post: any) {
  const { targets, error } = await resolveTargets(supabase, post.user_id, post.target_id ? [post.target_id] : null);
  if (error || !targets.length) {
    await supabase.from("posts").update({ status: "failed" }).eq("id", post.id);
    return { id: post.id, ok: false, error: error || "Aucune destination LinkedIn" };
  }
  const target = targets[0];
  const result = await publishToTarget(supabase, target, post.content, post.image_url);

  if (!result.ok) {
    // Token problems are recoverable by the user → keep the post publishable.
    await supabase.from("posts").update({
      status: result.code === "LINKEDIN_TOKEN_EXPIRED" ? "ready" : "failed",
      target_id: target.id,
    }).eq("id", post.id);
    return { id: post.id, ok: false, error: result.error, target: target.name };
  }

  await supabase.from("posts").update({
    status: "published",
    published_at: new Date().toISOString(),
    linkedin_post_id: result.linkedinId || null,
    target_id: target.id,
  }).eq("id", post.id);
  return { id: post.id, ok: true, target: target.name };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: due, error } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString())
      .limit(20);
    if (error) throw error;
    const results = [];
    for (const p of due ?? []) {
      // Mark as generating to avoid double-pick
      await supabase.from("posts").update({ status: "generating" }).eq("id", p.id);
      results.push(await publishOne(supabase, p));
    }
    return json(200, { success: true, processed: results.length, results });
  } catch (e) {
    console.error("publish-scheduled error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
