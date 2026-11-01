// Cron-triggered: runs due schedules — scrapes sources, generates post + optional image, publishes to LinkedIn
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
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

type Source = { type: "url" | "keyword" | "idea"; value: string };

// Time helpers live in _shared/schedule-time.ts

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ===== Source gathering with used-URL filter =====
async function gatherSources(sources: Source[], usedUrls: Set<string>): Promise<{ context: string; freshUrls: string[] }> {
  const fc = Deno.env.get("FIRECRAWL_API_KEY");
  const chunks: string[] = [];
  const freshUrls: string[] = [];

  const ideas = sources.filter((s) => s.type === "idea").map((s) => s.value).filter(Boolean);
  if (ideas.length) chunks.push(`# Ideas / notes\n${ideas.map((i) => `- ${i}`).join("\n")}`);

  const urls = sources.filter((s) => s.type === "url").map((s) => s.value).filter(Boolean).slice(0, 4);
  const keywords = sources.filter((s) => s.type === "keyword").map((s) => s.value).filter(Boolean).slice(0, 4);

  if (!fc) {
    if (urls.length || keywords.length) chunks.push(`# References (raw)\n${[...urls, ...keywords.map((k) => `keyword:${k}`)].map((x) => `- ${x}`).join("\n")}`);
    return { context: chunks.join("\n\n---\n\n"), freshUrls };
  }

  await Promise.all(urls.map(async (url) => {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST", headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
      });
      const d = await r.json();
      const md = d.data?.markdown || d.markdown;
      if (md) { chunks.push(`# Source: ${url}\n${String(md).substring(0, 2500)}`); freshUrls.push(url); }
    } catch (e) { console.warn("scrape fail", url, e); }
  }));

  // For keywords, search and filter out URLs we've already used to keep it fresh
  await Promise.all(keywords.map(async (kw) => {
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST", headers: { Authorization: `Bearer ${fc}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: kw, limit: 5, tbs: "qdr:w" }),
      });
      const d = await r.json();
      const results: any[] = d.data || d.web?.results || [];
      const fresh = results.filter((x: any) => x.url && !usedUrls.has(x.url)).slice(0, 3);
      if (fresh.length) {
        const summary = fresh.map((x) => `- ${x.title || ""}: ${x.description || ""} (${x.url})`).join("\n");
        chunks.push(`# Search: ${kw}\n${summary}`);
        for (const x of fresh) freshUrls.push(x.url);
      }
    } catch (e) { console.warn("search fail", kw, e); }
  }));

  return { context: chunks.join("\n\n---\n\n"), freshUrls };
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
  const sys = `You write engaging LinkedIn posts.
LANGUAGE: Write the entire post (title, body, hashtags, CTA) strictly in ${langName}. Never use another language, whatever the language of the sources.
Rules: 150-300 words, 5-7 hashtags, sparing emojis, end with a CTA/question.
${opts.tone ? `Tone:\n${opts.tone}` : ""}
Return JSON via the write_post tool.`;
  const sourceBlock = opts.sourceCtx ? `\n\nReferences (synthesize, don't copy):\n${opts.sourceCtx.substring(0, 12000)}` : "";
  const userMsg = `${opts.prompt || "Write a thought-provoking LinkedIn post."}${sourceBlock}`;

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
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "google/gemini-3.1-flash-image-preview",
      messages: [{ role: "user", content: `Create a professional LinkedIn post image. Subject: ${prompt}. Style: modern editorial, clean composition, premium feel.` }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) { console.warn("img gen fail", res.status); return null; }
  const data = await res.json();
  const dataUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl) return null;
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fileName = `${userId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage.from("post-assets").upload(fileName, bytes, { contentType: "image/png" });
  if (error) {
    console.warn("img storage fail", error.message);
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

  const { context: sourceCtx, freshUrls } = await gatherSources(sources, usedUrlSet);

  // AI key/model
  const { data: us } = await supabase.from("user_settings")
    .select("post_model, use_byok, openai_api_key, xai_api_key, tone_instructions, image_model")
    .eq("user_id", userId).maybeSingle();
  const { model, url, key } = resolveTextProvider(sched.ai_model || us?.post_model || "google/gemini-3-flash-preview", us, Deno.env.get("LOVABLE_API_KEY"));

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
