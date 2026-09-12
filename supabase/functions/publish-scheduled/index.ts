// Cron-triggered: publishes due one-off posts via publication_jobs.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTargets, publishLinkedInPost } from "../_shared/linkedin.ts";
import { authorizeCronOrUser } from "../_shared/cron-auth.ts";
import { claimDueScheduledPosts, upsertAndClaimJob, finalizeJob } from "../_shared/jobs.ts";
import { makeIdempotencyKey } from "../_shared/schedule-time.ts";
import { jobLog } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function publishOne(supabase: any, post: any) {
  const { targets, error } = await resolveTargets(supabase, post.user_id, post.target_id ? [post.target_id] : null);
  if (error || !targets.length) {
    await supabase.from("posts").update({
      status: "failed", error_code: "LINKEDIN_NOT_CONNECTED", error_message: error || "Aucune destination LinkedIn",
    }).eq("id", post.id);
    return { id: post.id, ok: false, error: error || "Aucune destination LinkedIn" };
  }
  const target = targets[0];
  const idempotencyKey = makeIdempotencyKey({
    postId: post.id,
    targetId: target.id,
    executionId: post.scheduled_at || post.id,
  });

  const claim = await upsertAndClaimJob(supabase, {
    userId: post.user_id,
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
    }).eq("id", post.id);
    return { id: post.id, ok: true, alreadyPublished: true, target: target.name };
  }
  if (claim.action === "in_flight") {
    return { id: post.id, ok: false, skipped: true, error: "in_flight" };
  }
  if (claim.action === "terminal_failed") {
    await supabase.from("posts").update({
      status: "failed", error_code: claim.job.error_code, error_message: claim.job.error_message, target_id: target.id,
    }).eq("id", post.id);
    return { id: post.id, ok: false, error: claim.job.error_message, target: target.name };
  }

  jobLog("JOB_STARTED", { job: claim.job.id, target: target.name, post: post.id });
  const result = await publishLinkedInPost({
    supabase, target, content: post.content, image: post.image_url, idempotencyKey,
  });

  await finalizeJob(supabase, {
    jobId: claim.job.id,
    ok: result.ok && result.confirmed,
    retryable: result.retryable,
    urn: result.linkedinId,
    errorCode: result.code,
    errorMessage: result.error,
    providerStatus: result.providerStatus,
  });

  if (!result.ok || !result.confirmed) {
    await supabase.from("posts").update({
      status: result.code === "LINKEDIN_TOKEN_EXPIRED" ? "ready" : result.retryable ? "retrying" : "failed",
      target_id: target.id,
      error_code: result.code,
      error_message: result.error,
      last_attempt_at: new Date().toISOString(),
    }).eq("id", post.id);
    return { id: post.id, ok: false, error: result.error, target: target.name };
  }

  await supabase.from("posts").update({
    status: "published",
    published_at: new Date().toISOString(),
    linkedin_post_id: result.linkedinId || null,
    target_id: target.id,
    error_code: null,
    error_message: null,
  }).eq("id", post.id);
  return { id: post.id, ok: true, target: target.name, urn: result.linkedinId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = await authorizeCronOrUser(req, supabase);
    if (!caller) return json(401, { success: false, error: "Unauthorized" });

    const due = await claimDueScheduledPosts(supabase, 10);
    const results = [];
    for (const p of due) {
      results.push(await publishOne(supabase, p));
    }

    const { data: retrying } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "retrying")
      .lte("last_attempt_at", new Date(Date.now() - 60_000).toISOString())
      .limit(5);
    for (const p of retrying ?? []) {
      if ((p.attempt_count ?? 0) >= 3) {
        await supabase.from("posts").update({ status: "failed" }).eq("id", p.id);
        continue;
      }
      results.push(await publishOne(supabase, p));
    }

    return json(200, { success: true, processed: results.length, results });
  } catch (e) {
    console.error("publish-scheduled error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
