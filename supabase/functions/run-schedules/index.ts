// Cron-triggered: runs due schedules — scrapes sources, generates post + optional image, publishes to LinkedIn
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateXaiImage } from "../_shared/xai-image.ts";
import { generateImageRouted, mapImageError } from "../_shared/ai-image.ts";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { gatherSourceContext, type SourceInput } from "../_shared/web-sources.ts";
import { resolveTargets, publishLinkedInPost } from "../_shared/linkedin.ts";
import { authorizeCronOrUser } from "../_shared/cron-auth.ts";
import { claimDueSchedules, upsertAndClaimJob, finalizeJob } from "../_shared/jobs.ts";
import { computeNextRun, makeIdempotencyKey, isPersistableImageUrl } from "../_shared/schedule-time.ts";
import { jobLog } from "../_shared/logger.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Source = SourceInput;

// Time helpers live in _shared/schedule-time.ts

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gatherSources(
  sources: Source[],
  usedUrls: Set<string>,
  firecrawlKey?: string | null,
): Promise<{ context: string; freshUrls: string[] }> {
  const { context, freshUrls } = await gatherSourceContext(sources, {
    firecrawlKey,
    usedUrls,
    maxUrls: 4,
    maxKeywords: 4,
  });
  return { context, freshUrls };
}

// ===== AI text generation =====
const LANG_NAMES: Record<string, string> = {
  fr: "French (Français)", en: "English", es: "Spanish (Español)",
  de: "German (Deutsch)", ar: "Arabic (العربية)",
};

async function generateText(opts: {
  prompt: string; tone: string | null; sourceCtx: string; model: string; key: string; url: string; language?: string | null;
}): Promise<{ title: string; content: string }> {
  const langName = LANG_NAMES[String(opts.language || "fr")] || LANG_NAMES.fr;
  const sys = `Follow the schedule prompt exactly. Write a LinkedIn post that matches it.
Prefer ${langName} unless the prompt specifies another language.
Do not add branding, hashtags, CTAs, or structure unless the prompt asks for them.
${opts.tone ? `Automation memory / voice:\n${opts.tone}` : ""}
${opts.sourceCtx ? "Reference material is provided — use it only to satisfy the prompt." : ""}
Return JSON via the write_post tool.`;
  const sourceBlock = opts.sourceCtx ? `\n\n--- Reference material ---\n${opts.sourceCtx.substring(0, 12000)}\n--- End ---` : "";
  const userMsg = `${opts.prompt || "Write a LinkedIn post."}${sourceBlock}`;

  const res = await fetch(opts.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      tools: [{
        type: "function",
        function: {
          name: "write_post",
          description: "Write a LinkedIn post",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["title", "content"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "write_post" } },
    }),
  });
  if (!res.ok) throw new Error(opts.url.startsWith("https://api.x.ai/") ? xaiErrorMessage(res.status) : `AI text [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("AI returned no structured data");
  return JSON.parse(tc.function.arguments);
}

// ===== AI image =====
async function generateImage(prompt: string, model: string, supabase: any, userId: string): Promise<string | null> {
  const fullPrompt = `Create a professional LinkedIn post image. Subject: ${prompt}. Style: modern editorial, clean composition, premium feel.`;
  let base64: string;
  let mimeType = "image/png";
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("use_byok, xai_api_key, gemini_api_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Impossible de charger les paramètres image.");

  if (model?.startsWith("xai/")) {
    const image = await generateXaiImage({ settings, model, prompt: fullPrompt, aspectRatio: "1:1" });
    base64 = image.base64;
    mimeType = image.mimeType;
  } else {
    const image = await generateImageRouted({
      settings: settings ?? {},
      model: model || "google/gemini-3.1-flash-image-preview",
      prompt: fullPrompt,
      aspectRatio: "1:1",
    });
    if ("message" in image) {
      console.warn("img gen fail", mapImageError(image));
      return null;
    }
    base64 = image.base64;
    mimeType = image.mimeType;
  }
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `${userId}/${crypto.randomUUID()}.${mimeType === "image/jpeg" ? "jpg" : "png"}`;
  const { error: upErr } = await supabase.storage.from("post-assets").upload(fileName, bytes, { contentType: mimeType });
  if (upErr) {
    console.warn("img storage fail", upErr.message);
    return null;
  }
  const { data: signed } = await supabase.storage
    .from("post-assets")
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);
  return signed?.signedUrl && isPersistableImageUrl(signed.signedUrl) ? signed.signedUrl : null;
}

// ===== LinkedIn publish (shared, multi-destination) =====


// ===== Process one schedule =====
async function processSchedule(supabase: any, sched: any) {
  const userId = sched.user_id;
  // Resolve sources
  let sources: Source[] = Array.isArray(sched.adhoc_sources) ? sched.adhoc_sources : [];
  if (sched.saved_source_ids?.length) {
    const { data: saved } = await supabase
      .from("content_sources").select("source_type, value")
      .eq("user_id", userId).in("id", sched.saved_source_ids);
    for (const r of saved || []) {
      if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
        sources.push({ type: r.source_type, value: r.value });
      }
    }
  }

  const usedUrlSet = new Set<string>(sched.used_urls || []);
  const recentHashes = new Set<string>(sched.recent_hashes || []);

  // AI + scrape keys
  const { data: us } = await supabase.from("user_settings")
    .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, firecrawl_api_key, tone_instructions, image_model")
    .eq("user_id", userId).maybeSingle();

  const { context: sourceCtx, freshUrls } = await gatherSources(sources, usedUrlSet, us?.firecrawl_api_key);
  const { model, url, key } = resolveTextProvider(sched.ai_model || us?.post_model || "google/gemini-3-flash-preview", us);

  // Try up to 2 generations to avoid duplicate
  let attempt = 0; let generated: { title: string; content: string } | null = null; let hash = "";
  while (attempt < 2) {
    attempt++;
    const g = await generateText({
      prompt: sched.prompt, tone: sched.tone_instructions || us?.tone_instructions || null,
      sourceCtx, model, key, url, language: sched.language,
    });
    hash = await sha256Hex(g.content.replace(/\s+/g, " ").trim().toLowerCase().substring(0, 500));
    if (!recentHashes.has(hash)) { generated = g; break; }
    console.log(`schedule ${sched.id}: duplicate hash, retry ${attempt}`);
  }
  if (!generated) throw new Error("Generated content too similar to recent posts");

  // Image — never silently drop a requested image
  let imageUrl: string | null = null;
  if (sched.image_mode === "ai") {
    jobLog("CONTENT_GENERATED", { schedule: sched.id });
    imageUrl = await generateImage(sched.image_prompt || generated.title, us?.image_model, supabase, userId);
    if (!isPersistableImageUrl(imageUrl)) {
      throw new Error("IMAGE_NOT_PERSISTED: génération ou stockage image en échec. Publication annulée.");
    }
    jobLog("IMAGE_READY", { schedule: sched.id });
  } else {
    jobLog("CONTENT_GENERATED", { schedule: sched.id });
  }

  const { targets, error: targetError } = await resolveTargets(supabase, userId, sched.target_ids);
  if (targetError || !targets.length) throw new Error(targetError || "Aucune destination LinkedIn");

  const executionId = new Date().toISOString().slice(0, 16);
  const results = [];
  for (const target of targets) {
    const { data: insertedPost } = await supabase.from("posts").insert({
      user_id: userId,
      title: generated.title,
      content: generated.content,
      image_url: imageUrl,
      status: "processing",
      schedule_id: sched.id,
      content_hash: hash,
      target_id: target.id,
    }).select("id").single();

    const postId = insertedPost?.id ?? null;
    const idempotencyKey = makeIdempotencyKey({
      postId,
      targetId: target.id,
      scheduleId: sched.id,
      executionId,
    });

    const claim = await upsertAndClaimJob(supabase, {
      userId,
      postId,
      targetId: target.id,
      scheduleId: sched.id,
      idempotencyKey,
      scheduledFor: new Date().toISOString(),
    });

    let r;
    if (claim.action === "already_success") {
      r = { ok: true, confirmed: true, targetId: target.id, targetName: target.name, linkedinId: claim.job.linkedin_post_urn, attempts: claim.job.attempt_count, retryable: false };
    } else if (claim.action === "in_flight") {
      r = { ok: false, confirmed: false, targetId: target.id, targetName: target.name, error: "Publication déjà en cours", attempts: 0, retryable: true, code: "LINKEDIN_TRANSIENT" as const };
    } else if (claim.action === "terminal_failed") {
      r = { ok: false, confirmed: false, targetId: target.id, targetName: target.name, error: claim.job.error_message || "Échec définitif", attempts: claim.job.attempt_count, retryable: false, code: claim.job.error_code };
    } else {
      jobLog("JOB_STARTED", { job: claim.job.id, target: target.name, schedule: sched.id });
      r = await publishLinkedInPost({
        supabase, target, content: generated.content, image: imageUrl, idempotencyKey, requireImage: sched.image_mode === "ai",
      });
      await finalizeJob(supabase, {
        jobId: claim.job.id,
        ok: r.ok && r.confirmed,
        retryable: r.retryable,
        urn: r.linkedinId,
        errorCode: r.code,
        errorMessage: r.error,
        providerStatus: r.providerStatus,
      });
    }

    const published = !!(r.ok && r.confirmed && r.linkedinId);
    if (postId) {
      await supabase.from("posts").update({
        status: published ? "published" : r.retryable ? "retrying" : "failed",
        published_at: published ? new Date().toISOString() : null,
        linkedin_post_id: r.linkedinId || null,
        error_code: published ? null : r.code,
        error_message: published ? null : r.error,
      }).eq("id", postId);
    }

    await supabase.from("schedule_runs").insert({
      schedule_id: sched.id,
      user_id: userId,
      post_id: postId,
      target_id: target.id,
      attempt: r.attempts || 1,
      source: "schedule",
      status: published ? "success" : "failed",
      message: published ? `Publié sur ${target.name} (${r.linkedinId})` : r.error || "Échec",
    });
    results.push(r);
  }

  // Update schedule memory + next run
  const newUsedUrls = Array.from(new Set([...(sched.used_urls || []), ...freshUrls])).slice(-200);
  const newHashes = Array.from(new Set([...(sched.recent_hashes || []), hash])).slice(-50);
  const next = computeNextRun(sched.days_of_week, sched.hour, sched.minute, sched.timezone, new Date(Date.now() + 60_000));
  await supabase.from("schedules").update({
    last_run_at: new Date().toISOString(),
    next_run_at: next.toISOString(),
    used_urls: newUsedUrls,
    recent_hashes: newHashes,
    claimed_at: null,
    claimed_by: null,
  }).eq("id", sched.id);

  const okCount = results.filter((r) => r.ok && r.confirmed).length;
  return {
    id: sched.id,
    ok: okCount === results.length && results.length > 0,
    published: okCount,
    failed: results.length - okCount,
    total: results.length,
    perTarget: results.map((r) => ({
      targetId: r.targetId,
      targetName: r.targetName,
      ok: !!(r.ok && r.confirmed),
      urn: r.linkedinId,
      error: r.error,
    })),
    error: results.find((r) => !r.ok || !r.confirmed)?.error,
  };

}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = await authorizeCronOrUser(req, supabase);
    if (!caller) return json(401, { success: false, error: "Unauthorized" });

    let runOne: string | null = null;
    if (req.method === "POST") {
      try { const b = await req.json(); runOne = b?.schedule_id || null; } catch { /* noop */ }
    }

    let due: any[] = [];
    if (runOne) {
      if (caller.kind === "user") {
        const { data } = await supabase.from("schedules").select("*").eq("id", runOne).eq("user_id", caller.userId).maybeSingle();
        if (data) due = [data];
      } else {
        const { data } = await supabase.from("schedules").select("*").eq("id", runOne).maybeSingle();
        if (data) due = [data];
      }
    } else if (caller.kind === "cron") {
      due = await claimDueSchedules(supabase, 5);
    } else {
      return json(400, { success: false, error: "schedule_id required for manual run" });
    }

    const results = [];
    for (const s of due) {
      try { results.push(await processSchedule(supabase, s)); }
      catch (e: any) {
        console.error("schedule failed", s.id, e);
        const next = computeNextRun(s.days_of_week, s.hour, s.minute, s.timezone, new Date(Date.now() + 60_000));
        await supabase.from("schedules").update({ last_run_at: new Date().toISOString(), next_run_at: next.toISOString(), claimed_at: null }).eq("id", s.id);
        await supabase.from("schedule_runs").insert({
          schedule_id: s.id, user_id: s.user_id, status: "failed", message: e?.message || "Error",
        });
        results.push({ id: s.id, ok: false, error: e?.message });
      }
    }
    return json(200, { success: true, processed: results.length, results });
  } catch (e) {
    console.error("run-schedules error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
