// Cron-triggered: processes queued topics (topic_queue) that are due —
// generates the post text in the requested language (+ optional image), then publishes to LinkedIn.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTargets, publishToTargets } from "../_shared/linkedin.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const LANG_NAMES: Record<string, string> = {
  fr: "French (Français)", en: "English", es: "Spanish (Español)",
  de: "German (Deutsch)", ar: "Arabic (العربية)",
};

async function generatePostText(opts: {
  subject: string; language: string; tone: string | null; model: string; key: string; url: string;
}): Promise<{ title: string; content: string }> {
  const langName = LANG_NAMES[opts.language] || LANG_NAMES.fr;
  const sys = `You write engaging LinkedIn posts.
LANGUAGE: Write the entire post (title, body, hashtags, CTA) strictly in ${langName}. Never use another language.
Rules: 150-300 words, 5-7 hashtags, sparing emojis, end with a CTA/question.
${opts.tone ? `Tone:\n${opts.tone}` : ""}
Return JSON via the write_post tool.`;

  const res = await fetch(opts.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Topic: ${opts.subject}` },
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
  if (!res.ok) throw new Error(`AI text [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const tc = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!tc) throw new Error("AI returned no structured data");
  return JSON.parse(tc.function.arguments);
}

async function generateImage(prompt: string, model: string | null, supabase: any, userId: string): Promise<string | null> {
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
  const { data: signed } = await supabase.storage.from("post-assets").createSignedUrl(fileName, 60 * 60 * 24 * 7);
  return signed?.signedUrl ?? null;
}

// Publishing is handled by the shared helper (multi-destination + retries).


async function processTopic(supabase: any, topic: any) {
  const userId = topic.user_id;
  const { data: us } = await supabase.from("user_settings")
    .select("post_model, use_byok, openai_api_key, tone_instructions, image_model")
    .eq("user_id", userId).maybeSingle();

  let model = us?.post_model || "google/gemini-3-flash-preview";
  let url = "https://ai.gateway.lovable.dev/v1/chat/completions";
  let key = Deno.env.get("LOVABLE_API_KEY");
  if (us?.use_byok && model.startsWith("openai/") && us.openai_api_key) {
    url = "https://api.openai.com/v1/chat/completions";
    key = us.openai_api_key;
    model = model.replace("openai/", "");
  }
  if (!key) throw new Error("No AI key");

  const generated = await generatePostText({
    subject: topic.subject,
    language: topic.language || "fr",
    tone: us?.tone_instructions || null,
    model, key, url,
  });

  const imageUrl = topic.include_image
    ? await generateImage(topic.subject, us?.image_model ?? null, supabase, userId)
    : null;

  const { targets, error: targetError } = await resolveTargets(supabase, userId, topic.target_ids);
  if (targetError || !targets.length) throw new Error(targetError || "Aucune destination LinkedIn");

  const results = await publishToTargets(supabase, targets, generated.content, imageUrl);

  let firstPostId: string | null = null;
  for (const r of results) {
    const { data: insertedPost } = await supabase.from("posts").insert({
      user_id: userId,
      title: generated.title,
      content: generated.content,
      image_url: imageUrl,
      status: r.ok ? "published" : "failed",
      published_at: r.ok ? new Date().toISOString() : null,
      linkedin_post_id: r.linkedinId || null,
      scheduled_at: topic.scheduled_at,
      target_id: r.targetId,
    }).select("id").single();
    if (!firstPostId) firstPostId = insertedPost?.id ?? null;
  }

  const okCount = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok).map((r) => r.error).join(" | ");

  await supabase.from("topic_queue").update({
    status: okCount > 0 ? "published" : "failed",
    error: errors || null,
    post_id: firstPostId,
    processed_at: new Date().toISOString(),
  }).eq("id", topic.id);

  return { id: topic.id, ok: okCount > 0, published: okCount, total: results.length, error: errors || undefined };

}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let runOne: string | null = null;
    if (req.method === "POST") {
      try { const b = await req.json(); runOne = b?.topic_id || null; } catch { /* noop */ }
    }

    let due: any[] = [];
    if (runOne) {
      const { data } = await supabase.from("topic_queue").select("*").eq("id", runOne).maybeSingle();
      if (data) due = [data];
    } else {
      const { data, error } = await supabase
        .from("topic_queue").select("*")
        .eq("status", "scheduled_topic")
        .lte("scheduled_at", new Date().toISOString())
        .limit(10);
      if (error) throw error;
      due = data || [];
    }

    const results = [];
    for (const t of due) {
      // Claim it first to avoid double-processing
      await supabase.from("topic_queue").update({ status: "generating" }).eq("id", t.id);
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
