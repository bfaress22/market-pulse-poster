import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const autoPublish = body.autoPublish ?? false;
    const language = body.language ?? "fr";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // Forward the user's JWT so downstream functions identify the user
    const fwdHeaders = { Authorization: auth, "Content-Type": "application/json" };

    // 1. scrape
    const scrapeRes = await fetch(`${supabaseUrl}/functions/v1/scrape-news`, {
      method: "POST", headers: fwdHeaders, body: JSON.stringify({}),
    });
    const scrape = await scrapeRes.json();
    if (!scrape.success) throw new Error(`Scraping failed: ${scrape.error}`);

    // 2. generate post
    const postRes = await fetch(`${supabaseUrl}/functions/v1/generate-post`, {
      method: "POST", headers: fwdHeaders, body: JSON.stringify({ newsMarkdown: scrape.markdown, language }),
    });
    const post = await postRes.json();
    if (!post.success) throw new Error(`Post gen failed: ${post.error}`);

    // 3. generate image
    let imageUrl: string | null = null;
    try {
      const imgRes = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
        method: "POST", headers: fwdHeaders,
        body: JSON.stringify({ prompt: post.imagePrompt, bottomMarginPercent: 0 }),
      });
      const img = await imgRes.json();
      if (img.success) imageUrl = img.imageUrl;
    } catch (e) { console.warn("img failed", e); }

    // 4. save
    const { data: saved, error: insErr } = await supabase.from("posts").insert({
      user_id: userId,
      title: post.title,
      content: post.content,
      news_summary: post.newsSummary,
      image_url: imageUrl,
      status: autoPublish ? "generating" : "ready",
    }).select().single();
    if (insErr) throw new Error(insErr.message);

    // 5. auto publish
    if (autoPublish && saved) {
      try {
        const pubRes = await fetch(`${supabaseUrl}/functions/v1/publish-linkedin`, {
          method: "POST", headers: fwdHeaders, body: JSON.stringify({ postId: saved.id }),
        });
        const pub = await pubRes.json();
        if (!pub.success) {
          await supabase.from("posts").update({ status: "ready" }).eq("id", saved.id);
        }
      } catch (e) {
        console.error("auto-publish failed", e);
        await supabase.from("posts").update({ status: "ready" }).eq("id", saved.id);
      }
    }

    return json(200, { success: true, post: saved });
  } catch (e) {
    console.error("workflow error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
