import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTargets, publishLinkedInPost } from "../_shared/linkedin.ts";
import { upsertAndClaimJob, finalizeJob } from "../_shared/jobs.ts";
import { makeIdempotencyKey } from "../_shared/schedule-time.ts";
import { requireUser } from "../_shared/cron-auth.ts";
import { jobLog } from "../_shared/logger.ts";

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
    const userId = await requireUser(req, supabase);
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: post } = await supabase.from("posts").select("*").eq("id", postId).eq("user_id", userId).maybeSingle();
    if (!post) return json(404, { success: false, error: "Post not found" });

    if (post.status === "published" && post.linkedin_post_id) {
      return json(200, {
        success: true,
        alreadyPublished: true,
        linkedinPostId: post.linkedin_post_id,
        target: { id: post.target_id },
      });
    }

    const wanted = [post.target_id, targetId].filter(Boolean) as string[];
    const { targets, error: resolveError } = await resolveTargets(supabase, userId, wanted.length ? [wanted[0]] : null);
    if (resolveError || !targets.length) {
      return json(400, { success: false, code: "LINKEDIN_NOT_CONNECTED", error: resolveError || "Aucune destination LinkedIn." });
    }
    const target = targets[0];
    const idempotencyKey = makeIdempotencyKey({
      postId: post.id,
      targetId: target.id,
      executionId: post.scheduled_at || `manual:${post.id}`,
    });

    const claim = await upsertAndClaimJob(supabase, {
      userId,
      postId: post.id,
      targetId: target.id,
      idempotencyKey,
      scheduledFor: post.scheduled_at,
    });

    if (claim.action === "already_success") {
      await supabase.from("posts").update({
        status: "published",
        published_at: post.published_at || new Date().toISOString(),
        linkedin_post_id: claim.job.linkedin_post_urn,
        target_id: target.id,
      }).eq("id", postId);
      return json(200, {
        success: true,
        alreadyPublished: true,
        linkedinPostId: claim.job.linkedin_post_urn,
        target: { id: target.id, name: target.name },
      });
    }
    if (claim.action === "in_flight") {
      return json(409, { success: false, code: "IN_FLIGHT", error: "Une publication est déjà en cours pour ce post." });
    }
    if (claim.action === "terminal_failed") {
      return json(400, {
        success: false,
        code: claim.job.error_code,
        error: claim.job.error_message,
        target: { id: target.id, name: target.name },
      });
    }

    jobLog("JOB_STARTED", { job: claim.job.id, target: target.name, post: post.id });
    const result = await publishLinkedInPost({
      supabase,
      target,
      content: post.content,
      image: post.image_url,
      idempotencyKey,
    });

    await finalizeJob(supabase, {
      jobId: claim.job.id,
      ok: result.ok && result.confirmed,
      retryable: result.retryable,
      urn: result.linkedinId,
      errorCode: result.code,
      errorMessage: result.error,
      providerStatus: result.providerStatus,
      providerResponse: { confirmed: result.confirmed },
    });

    if (!result.ok || !result.confirmed) {
      const expired = result.code === "LINKEDIN_TOKEN_EXPIRED";
      await supabase.from("posts").update({
        status: expired ? "ready" : result.retryable ? "retrying" : "failed",
        target_id: target.id,
        error_code: result.code,
        error_message: result.error,
        last_attempt_at: new Date().toISOString(),
      }).eq("id", postId);
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
      error_code: null,
      error_message: null,
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
