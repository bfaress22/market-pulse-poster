import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTargets, publishToTarget } from "../_shared/linkedin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { postId, targetId } = await req.json();
    if (!postId) return json(400, { success: false, error: "postId required" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: post } = await supabase.from("posts").select("*").eq("id", postId).eq("user_id", userId).maybeSingle();
    if (!post) return json(404, { success: false, error: "Post not found" });

    const wanted = [post.target_id, targetId].filter(Boolean) as string[];
    const { targets, error: resolveError } = await resolveTargets(supabase, userId, wanted.length ? [wanted[0]] : null);
    if (resolveError || !targets.length) {
      return json(400, { success: false, code: "LINKEDIN_NOT_CONNECTED", error: resolveError || "Aucune destination LinkedIn." });
    }
    const target = targets[0];

    const result = await publishToTarget(supabase, target, post.content, post.image_url);

    if (!result.ok) {
      const expired = result.code === "LINKEDIN_TOKEN_EXPIRED";
      await supabase.from("posts").update({ status: expired ? "ready" : "failed", target_id: target.id }).eq("id", postId);
      return json(expired ? 200 : 500, {
        success: false,
        code: result.code,
        requiresReconnect: expired,
        target: { id: target.id, name: target.name },
        error: result.error,
      });
    }

    await supabase.from("posts").update({
      status: "published",
      published_at: new Date().toISOString(),
      linkedin_post_id: result.linkedinId || null,
      target_id: target.id,
    }).eq("id", postId);

    return json(200, {
      success: true,
      linkedinPostId: result.linkedinId,
      target: { id: target.id, name: target.name },
    });
  } catch (e) {
    console.error("publish error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
