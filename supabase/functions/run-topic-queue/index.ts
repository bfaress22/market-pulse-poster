// Cron-triggered: processes queued topics (topic_queue) that are due —
// generates the post text in the requested language (+ optional image), then publishes to LinkedIn.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateXaiImage } from "../_shared/xai-image.ts";
import { generateImageRouted, mapImageError } from "../_shared/ai-image.ts";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { resolveTargets, publishLinkedInPost } from "../_shared/linkedin.ts";
import { authorizeCronOrUser } from "../_shared/cron-auth.ts";
import { claimDueTopics, upsertAndClaimJob, finalizeJob } from "../_shared/jobs.ts";
import { makeIdempotencyKey, isPersistableImageUrl } from "../_shared/schedule-time.ts";
import { jobLog } from "../_shared/logger.ts";
import { resolveContentSkill, skillTextBlock } from "../_shared/content-skills.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LANG_NAMES: Record<string, string> = {
  fr: "French (Français)", en: "English", es: "Spanish (Español)",
  de: "German (Deutsch)", ar: "Arabic (العربية)",
};

async function generatePostText(opts: {
  subject: string; language: string; tone: string | null; skillSlug: string | null; model: string; key: string; url: string;
}): Promise<{ title: string; content: string }> {
  const langName = LANG_NAMES[opts.language] || LANG_NAMES.fr;
  const skill = resolveContentSkill(opts.skillSlug);
  const skillBlock = skillTextBlock(skill);
  const sys = `Follow the topic exactly. Write a LinkedIn post that matches it.
Prefer ${langName} unless the topic or skill specifies another language.
${skill
  ? "An active content skill is attached below — follow its structure, branding, and hard rules (they override generic defaults)."
  : "Do not add branding, hashtags, CTAs, or structure unless asked."}
${opts.tone ? `Automation memory / voice:\n${opts.tone}` : ""}${skillBlock}
Return JSON via the write_post tool.`;

  const res = await fetch(opts.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: opts.subject },
      ],
      tools: [{
        type: "function",
        function: {
          name: "write_post",
          description: "Write a LinkedIn post",
          parameters: {
            type: "object",
            properties: { title: { type: "string" }, content: { type: "string" } },
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

async function generateImage(prompt: string, model: string | null, supabase: any, userId: string): Promise<string | null> {
  let base64: string;
  let mimeType = "image/png";
  const { data: settings, error } = await supabase
    .from("user_settings")
    .select("use_byok, xai_api_key, gemini_api_key, active_skill")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Impossible de charger les paramètres image.");

  const skill = resolveContentSkill(settings?.active_skill);
  const brandHint = skill
    ? ` Brand: ${skill.name}. Colors ${skill.imageBrand.background}, ${skill.imageBrand.accent}, ${skill.imageBrand.text}. ${skill.imageAddon}`
    : "";
  const fullPrompt = `Create a professional LinkedIn post image. Subject: ${prompt}. Style: modern editorial, clean composition, premium feel.${brandHint}`;

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
  if (upErr) return null;
  const { data: signed } = await supabase.storage.from("post-assets").createSignedUrl(fileName, 60 * 60 * 24 * 7);
  return signed?.signedUrl ?? null;
}

// Publishing is handled by the shared helper (multi-destination + retries).


async function processTopic(supabase: any, topic: any) {
  const userId = topic.user_id;
  const { data: us } = await supabase.from("user_settings")
    .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, tone_instructions, image_model, active_skill")
    .eq("user_id", userId).maybeSingle();

  const { model, url, key } = resolveTextProvider(us?.post_model || "google/gemini-3-flash-preview", us);

  const generated = await generatePostText({
    subject: topic.subject,
    language: topic.language || "fr",
    tone: us?.tone_instructions || null,
    skillSlug: us?.active_skill || null,
    model, key, url,
  });

  let imageUrl: string | null = null;
  if (topic.include_image) {
    imageUrl = await generateImage(topic.subject, us?.image_model ?? null, supabase, userId);
    if (!isPersistableImageUrl(imageUrl)) {
      throw new Error("IMAGE_NOT_PERSISTED: génération ou stockage image en échec.");
    }
  }

  const { targets, error: targetError } = await resolveTargets(supabase, userId, topic.target_ids);
  if (targetError || !targets.length) throw new Error(targetError || "Aucune destination LinkedIn");

  const executionId = topic.scheduled_at || topic.id;
  const results = [];
  let firstPostId: string | null = null;
  for (const target of targets) {
    const { data: insertedPost } = await supabase.from("posts").insert({
      user_id: userId,
      title: generated.title,
      content: generated.content,
      image_url: imageUrl,
      status: "processing",
      scheduled_at: topic.scheduled_at,
      target_id: target.id,
    }).select("id").single();
    const postId = insertedPost?.id ?? null;
    if (!firstPostId) firstPostId = postId;

    const idempotencyKey = makeIdempotencyKey({
      postId, targetId: target.id, executionId: `topic:${topic.id}:${executionId}`,
    });
    const claim = await upsertAndClaimJob(supabase, {
      userId, postId, targetId: target.id, topicId: topic.id, idempotencyKey, scheduledFor: topic.scheduled_at,
    });

    let r;
    if (claim.action === "already_success") {
      r = { ok: true, confirmed: true, targetId: target.id, targetName: target.name, linkedinId: claim.job.linkedin_post_urn, error: undefined };
    } else if (claim.action === "in_flight" || claim.action === "terminal_failed") {
      r = { ok: false, confirmed: false, targetId: target.id, targetName: target.name, linkedinId: undefined, error: claim.job.error_message || claim.action };
    } else {
      jobLog("JOB_STARTED", { job: claim.job.id, target: target.name, topic: topic.id });
      r = await publishLinkedInPost({
        supabase, target, content: generated.content, image: imageUrl, idempotencyKey, requireImage: !!topic.include_image,
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
        status: published ? "published" : "failed",
        published_at: published ? new Date().toISOString() : null,
        linkedin_post_id: r.linkedinId || null,
        error_code: published ? null : (r as any).code,
        error_message: published ? null : r.error,
      }).eq("id", postId);
    }
    results.push(r);
  }

  const okCount = results.filter((r) => r.ok && r.confirmed).length;
  const errors = results.filter((r) => !r.ok || !r.confirmed).map((r) => r.error).join(" | ");

  await supabase.from("topic_queue").update({
    status: okCount === results.length && results.length > 0 ? "published" : okCount > 0 ? "failed" : "failed",
    error: errors || null,
    post_id: firstPostId,
    processed_at: new Date().toISOString(),
  }).eq("id", topic.id);

  return { id: topic.id, ok: okCount === results.length, published: okCount, total: results.length, error: errors || undefined };

}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const caller = await authorizeCronOrUser(req, supabase);
    if (!caller) return json(401, { success: false, error: "Unauthorized" });

    let runOne: string | null = null;
    if (req.method === "POST") {
      try { const b = await req.json(); runOne = b?.topic_id || null; } catch { /* noop */ }
    }

    let due: any[] = [];
    if (runOne) {
      const q = supabase.from("topic_queue").select("*").eq("id", runOne);
      const { data } = caller.kind === "user" ? await q.eq("user_id", caller.userId).maybeSingle() : await q.maybeSingle();
      if (data) due = [data];
    } else if (caller.kind === "cron") {
      due = await claimDueTopics(supabase, 5);
    } else {
      return json(400, { success: false, error: "topic_id required for manual run" });
    }

    const results = [];
    for (const t of due) {
      if (runOne) {
        await supabase.from("topic_queue").update({ status: "generating" }).eq("id", t.id);
      }
      try {
        results.push(await processTopic(supabase, t));
      } catch (e: any) {
        console.error("topic failed", t.id, e);
        await supabase.from("topic_queue").update({
          status: "failed", error: e?.message || "Error", processed_at: new Date().toISOString(),
        }).eq("id", t.id);
        results.push({ id: t.id, ok: false, error: e?.message });
      }
    }
    return json(200, { success: true, processed: results.length, results });
  } catch (e) {
    console.error("run-topic-queue error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
