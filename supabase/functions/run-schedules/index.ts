// Cron-triggered: runs due schedules — scrapes sources, generates post + optional image, publishes to LinkedIn
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Source = { type: "url" | "keyword" | "idea"; value: string };

// ===== Time helpers =====
// Compute next run time given days_of_week (1=Mon..7=Sun), hour, minute, IANA tz
function computeNextRun(daysOfWeek: number[], hour: number, minute: number, tz: string, from: Date = new Date()): Date {
  if (!daysOfWeek?.length) return new Date(from.getTime() + 24 * 3600_000);
  const days = new Set(daysOfWeek);
  // walk minute by minute is overkill; iterate up to 14 days, check candidate per day
  for (let i = 0; i < 14; i++) {
    const candidate = new Date(from.getTime() + i * 24 * 3600_000);
    // Format candidate in tz to get its weekday + figure out the wall-time slot
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(candidate).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
    const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const wd = wdMap[parts.weekday];
    if (!days.has(wd)) continue;
    // Build the target instant: use Date constructor with locale-formatted string then adjust via tz offset
    // Simple approach: build an ISO-like string in tz and convert.
    const yyyy = parts.year, mm = parts.month, dd = parts.day;
    const hh = String(hour).padStart(2, "0");
    const mi = String(minute).padStart(2, "0");
    // Get tz offset for that local datetime
    const local = `${yyyy}-${mm}-${dd}T${hh}:${mi}:00`;
    const asUTC = new Date(local + "Z").getTime();
    // Determine offset between tz and UTC at that moment
    const tzString = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(asUTC));
    // tzString like "MM/DD/YYYY, HH:mm"
    const m = tzString.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
    let offsetMin = 0;
    if (m) {
      const tzAsUTC = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]);
      offsetMin = (asUTC - tzAsUTC) / 60000;
    }
    const target = new Date(asUTC + offsetMin * 60000);
    if (target.getTime() > from.getTime()) return target;
  }
  return new Date(from.getTime() + 24 * 3600_000);
}

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
  if (!res.ok) throw new Error(`AI text [${res.status}]: ${await res.text()}`);
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
  if (error) return null;
  const { data: signed } = await supabase.storage
    .from("post-assets")
    .createSignedUrl(fileName, 60 * 60 * 24 * 7);
  return signed?.signedUrl ?? null;
}

// ===== LinkedIn publish =====
async function publishToLinkedIn(supabase: any, userId: string, content: string, imageUrl: string | null): Promise<{ ok: boolean; linkedinId?: string; error?: string }> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("linkedin_access_token, linkedin_token_expires_at, linkedin_person_urn, linkedin_organization_id")
    .eq("user_id", userId).maybeSingle();
  const token = settings?.linkedin_access_token;
  const personUrn = settings?.linkedin_person_urn;
  const orgId = settings?.linkedin_organization_id;
  const expires = settings?.linkedin_token_expires_at;
  if (!token || !personUrn) return { ok: false, error: "LinkedIn not connected" };
  if (expires && Date.parse(expires) <= Date.now()) return { ok: false, error: "LinkedIn token expired" };
  const author = orgId ? `urn:li:organization:${orgId.replace(/^urn:li:organization:/, "")}` : personUrn;

  let imageAsset: string | null = null;
  if (imageUrl && !imageUrl.startsWith("data:")) {
    try {
      const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: author,
            serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
          },
        }),
      });
      if (reg.ok) {
        const rd = await reg.json();
        const upUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
        imageAsset = rd.value?.asset;
        if (upUrl) {
          const blob = await (await fetch(imageUrl)).blob();
          await fetch(upUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: blob });
        }
      }
    } catch (e) { console.warn("img upload fail", e); }
  }

  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
        ...(imageAsset ? { media: [{ status: "READY", media: imageAsset }] } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const liRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!liRes.ok) return { ok: false, error: `LinkedIn ${liRes.status}: ${await liRes.text()}` };
  const liData = await liRes.json();
  return { ok: true, linkedinId: liData.id };
}

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
    .select("post_model, use_byok, openai_api_key, tone_instructions, image_model")
    .eq("user_id", userId).maybeSingle();
  let model = sched.ai_model || us?.post_model || "google/gemini-3-flash-preview";
  let url = "https://ai.gateway.lovable.dev/v1/chat/completions";
  let key = Deno.env.get("LOVABLE_API_KEY");
  if (us?.use_byok && model.startsWith("openai/") && us.openai_api_key) {
    url = "https://api.openai.com/v1/chat/completions"; key = us.openai_api_key; model = model.replace("openai/", "");
  }
  if (!key) throw new Error("No AI key");

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

  // Image
  let imageUrl: string | null = null;
  if (sched.image_mode === "ai") {
    imageUrl = await generateImage(sched.image_prompt || generated.title, us?.image_model, supabase, userId);
  }

  // Publish
  const pub = await publishToLinkedIn(supabase, userId, generated.content, imageUrl);

  // Insert post record
  const postRow = {
    user_id: userId,
    title: generated.title,
    content: generated.content,
    image_url: imageUrl,
    status: pub.ok ? "published" : "failed",
    published_at: pub.ok ? new Date().toISOString() : null,
    linkedin_post_id: pub.linkedinId || null,
    schedule_id: sched.id,
    content_hash: hash,
  };
  const { data: insertedPost } = await supabase.from("posts").insert(postRow).select("id").single();

  // Update schedule memory + next run
  const newUsedUrls = Array.from(new Set([...(sched.used_urls || []), ...freshUrls])).slice(-200);
  const newHashes = Array.from(new Set([...(sched.recent_hashes || []), hash])).slice(-50);
  const next = computeNextRun(sched.days_of_week, sched.hour, sched.minute, sched.timezone, new Date(Date.now() + 60_000));
  await supabase.from("schedules").update({
    last_run_at: new Date().toISOString(),
    next_run_at: next.toISOString(),
    used_urls: newUsedUrls,
    recent_hashes: newHashes,
  }).eq("id", sched.id);

  // Run history
  await supabase.from("schedule_runs").insert({
    schedule_id: sched.id, user_id: userId, post_id: insertedPost?.id || null,
    status: pub.ok ? "success" : "failed",
    message: pub.ok ? "Published" : pub.error || "Failed",
  });

  return { id: sched.id, ok: pub.ok, error: pub.error };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Optional: a single schedule_id for "Run now"
    let runOne: string | null = null;
    if (req.method === "POST") {
      try { const b = await req.json(); runOne = b?.schedule_id || null; } catch { /* noop */ }
    }

    let due: any[] = [];
    if (runOne) {
      const { data } = await supabase.from("schedules").select("*").eq("id", runOne).maybeSingle();
      if (data) due = [data];
    } else {
      const { data, error } = await supabase
        .from("schedules").select("*")
        .eq("enabled", true)
        .lte("next_run_at", new Date().toISOString())
        .limit(10);
      if (error) throw error;
      due = data || [];
    }

    const results = [];
    for (const s of due) {
      try { results.push(await processSchedule(supabase, s)); }
      catch (e: any) {
        console.error("schedule failed", s.id, e);
        // Still bump next_run_at to avoid hammering the same broken schedule
        const next = computeNextRun(s.days_of_week, s.hour, s.minute, s.timezone, new Date(Date.now() + 60_000));
        await supabase.from("schedules").update({ last_run_at: new Date().toISOString(), next_run_at: next.toISOString() }).eq("id", s.id);
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
