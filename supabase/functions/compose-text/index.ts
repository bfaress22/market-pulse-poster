// On-demand LinkedIn text: follow the user prompt directly.
// Memory / saved sources / tone are used only when useMemory=true (automation).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";
import { gatherSourceContext, type SourceInput } from "../_shared/web-sources.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      prompt,
      currentText,
      imageUrl,
      mode,
      sources,
      savedSourceIds,
      useMemory = false,
    } = body;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, firecrawl_api_key, tone_instructions")
      .eq("user_id", userId).maybeSingle();

    const automated = useMemory === true;
    let resolvedSources: SourceInput[] = Array.isArray(sources) ? sources : [];

    if (Array.isArray(savedSourceIds) && savedSourceIds.length) {
      // Explicit picks are intentional context; automated runs use the same lookup.
      const { data: saved } = await supabase
        .from("content_sources")
        .select("id, source_type, value")
        .eq("user_id", userId)
        .in("id", savedSourceIds);
      for (const r of saved || []) {
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          resolvedSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    if (automated && !resolvedSources.length) {
      const { data: enabled } = await supabase
        .from("content_sources")
        .select("source_type, value")
        .eq("user_id", userId)
        .eq("enabled", true)
        .limit(8);
      for (const r of enabled || []) {
        if (r.source_type === "url" || r.source_type === "keyword" || r.source_type === "idea") {
          resolvedSources.push({ type: r.source_type as SourceInput["type"], value: r.value });
        }
      }
    }

    const promptText = typeof prompt === "string" ? prompt.trim() : "";
    let sourceContext = "";
    let sourceProvider: "firecrawl" | "open" = "open";
    let researchUrls: string[] = [];

    if (mode !== "improve" && resolvedSources.length) {
      const gathered = await gatherSourceContext(resolvedSources, { firecrawlKey: s?.firecrawl_api_key });
      sourceContext = gathered.context;
      sourceProvider = gathered.provider;
      researchUrls = gathered.freshUrls;
    }

    const { model, url, key } = resolveTextProvider(s?.post_model || "google/gemini-3-flash-preview", s);
    const hasResearch = sourceContext.trim().length > 40;
    const tone = automated && s?.tone_instructions?.trim() ? s.tone_instructions.trim() : "";

    const sys = `Follow the user's instructions exactly. Write the LinkedIn post they asked for.
Do not add branding, CTAs, hashtags, emojis, length rules, or structure unless the user requested them.
Return JSON via the write_post tool (title + content).
${tone ? `\nAutomation voice/memory from settings:\n${tone}` : ""}
${hasResearch ? "Optional reference material is provided below — use it only if it helps satisfy the user request." : ""}`;

    const sourceBlock = hasResearch
      ? `\n\n--- Reference material ---\n${sourceContext.substring(0, 20000)}\n--- End ---`
      : "";

    let userMsg: unknown;
    if (mode === "improve" && currentText) {
      userMsg = `Improve this LinkedIn draft according to the instructions.\n\nDraft:\n${currentText}\n\nInstructions: ${promptText || "Polish clarity and flow."}${sourceBlock}`;
    } else if (imageUrl) {
      userMsg = [
        { type: "text", text: `${promptText || "Write a LinkedIn post about this image."}${sourceBlock}` },
        { type: "image_url", image_url: { url: imageUrl } },
      ];
    } else {
      userMsg = `${promptText || "Write a LinkedIn post."}${sourceBlock}`;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
        tools: [{
          type: "function",
          function: {
            name: "write_post",
            description: "Return the LinkedIn post",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "Short internal title" },
                content: { type: "string", description: "Full LinkedIn post body as requested" },
              },
              required: ["title", "content"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "write_post" } },
      }),
    });
    if (!res.ok) {
      if (url.startsWith("https://api.x.ai/")) return json(res.status, { success: false, error: xaiErrorMessage(res.status) });
      if (res.status === 429) return json(429, { success: false, error: "Rate limit exceeded." });
      if (res.status === 402) return json(402, { success: false, error: "Add credits to your workspace." });
      const t = await res.text();
      return json(500, { success: false, error: `AI error [${res.status}]: ${t}` });
    }

    const data = await res.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return json(500, { success: false, error: "AI returned no structured data" });
    const out = JSON.parse(tc.function.arguments);
    return json(200, {
      success: true,
      title: out.title,
      content: out.content,
      usedSources: resolvedSources.length,
      sourceProvider,
      hadWebContext: hasResearch,
      researchUrlCount: researchUrls.length,
      usedMemory: automated,
    });
  } catch (e) {
    console.error("compose-text error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
