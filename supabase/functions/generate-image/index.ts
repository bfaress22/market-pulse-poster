import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ALLOWED_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
];

const POSITION_LABELS: Record<string, string> = {
  "top-left": "top-left corner",
  "top-center": "top center",
  "top-right": "top-right corner",
  "center-left": "middle-left",
  "center": "exact center",
  "center-right": "middle-right",
  "bottom-left": "bottom-left corner",
  "bottom-center": "bottom center",
  "bottom-right": "bottom-right corner",
};

function buildPrompt(opts: { prompt: string }): string {
  const subject = (opts.prompt || "").trim();
  return `You are an award-winning Editorial Infographic Designer with over 20 years of experience creating visual reports for Bloomberg, Financial Times, Reuters, The Economist, McKinsey, BCG and Deloitte.

Your mission is to transform the following professional subject into a premium editorial infographic that looks like it was designed by an experienced graphic designer.

SUBJECT / ARTICLE:
${subject}

The infographic must NEVER look AI-generated.

==================================================
DESIGN OBJECTIVES
==================================================
Create a clean, premium, corporate editorial design.
The final result should resemble:
• Bloomberg Intelligence
• Financial Times Graphics
• Reuters Graphics
• Visual Capitalist
• McKinsey Reports
• Deloitte Insights
• World Bank publications
NOT a marketing poster. NOT an AI artwork. NOT a fantasy illustration. NOT a social media collage.

==================================================
VISUAL STYLE
==================================================
Minimalistic, elegant, corporate, editorial, professional, structured, high-end, balanced. Lots of whitespace. Perfect alignment. Strong visual hierarchy. Premium typography. Grid-based layout. Consistent spacing. Professional icons. Subtle shadows. Flat design mixed with realistic illustrations only when necessary.

==================================================
LAYOUT
==================================================
Always organize information into clearly separated sections. Possible structure: large title, subtitle, key takeaway, main illustration, 3–6 information cards, small charts, timeline, statistics, key figures, icons, footer. Everything perfectly aligned. Never overcrowd the page.

==================================================
TEXT
==================================================
The infographic may contain text only if provided above. NEVER invent statistics, percentages, dates, quotes, company names, institutions, economic figures, country names or political claims. If a value is unknown, replace it with a neutral placeholder or omit it entirely. Never fabricate information. Text must be perfectly readable, grammatically correct, professional, concise and consistent. No spelling mistakes, no broken words, no random characters, no gibberish.

==================================================
POLITICAL SAFETY
==================================================
Never generate political opinions. Never represent disputed territories. Never generate controversial maps. Never modify international borders. Never include geopolitical claims. If maps are needed, use abstract neutral maps or avoid maps completely. Avoid all sensitive political symbolism.

==================================================
NUMBERS
==================================================
Never invent numbers. Only display numbers explicitly supplied above. If none are supplied, replace charts with elegant abstract visualizations or generic placeholders.

==================================================
CHARTS
==================================================
Professional. Simple. Minimal. Business style. Thin lines. Neutral colors. No fake data.

==================================================
COLORS
==================================================
Dark navy, white, soft gray, gold accents, light blue accents. Maximum 4 primary colors. High contrast. Premium appearance.

==================================================
ILLUSTRATIONS
==================================================
Photorealistic when appropriate. High quality. Editorial. No surrealism, no fantasy, no cartoon, no exaggerated cinematic effects.

==================================================
ICONS
==================================================
Simple, corporate, monoline, consistent style, premium quality.

==================================================
QUALITY
==================================================
Looks like designed by a senior graphic designer. Suitable for LinkedIn, annual reports, consulting presentations, corporate publications, investor reports.

==================================================
NEGATIVE PROMPT
==================================================
Avoid: AI style, 3D render look, cartoon, anime, fantasy, oversaturated colors, messy layout, poor typography, watermarks, logos, fake statistics, fake charts, hallucinated numbers, political content, low resolution, text distortion, spelling mistakes, random characters, duplicated elements, visual clutter, poor alignment, bad spacing, cheap templates, Canva-looking layouts, social media aesthetics, clickbait.

==================================================
FINAL GOAL
==================================================
Produce an infographic that is visually indistinguishable from one created by a professional editorial designer for a leading international consulting firm or financial publication.`;
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const {
      prompt,
      bottomMarginPercent,
      model: requestedModel,
      inputImageUrl,
      style,
      mood,
      colors,
      aspectRatio,
      textOverlay,
      wordmark,
    } = body;
    if (!prompt) return json(400, { success: false, error: "prompt required" });
    const margin = Math.min(Math.max(Number(bottomMarginPercent) || 0, 0), 25);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("image_model").eq("user_id", userId).maybeSingle();

    let model = requestedModel || s?.image_model || "google/gemini-3.1-flash-image-preview";
    if (!ALLOWED_MODELS.includes(model)) model = "google/gemini-3.1-flash-image-preview";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json(500, { success: false, error: "LOVABLE_API_KEY not configured" });

    const fullPrompt = buildPrompt({ prompt });

    const userContent: unknown = inputImageUrl
      ? [
          { type: "text", text: `Edit this image following these instructions: ${fullPrompt}` },
          { type: "image_url", image_url: { url: inputImageUrl } },
        ]
      : fullPrompt;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return json(429, { success: false, error: "Rate limit exceeded." });
      if (response.status === 402) return json(402, { success: false, error: "Add credits to your workspace." });
      const t = await response.text();
      console.error("AI image error:", response.status, t);
      if (response.status === 403 && t.includes("credit_limit_reached")) {
        return json(403, { success: false, error: "Limite de crédits IA atteinte pour cet espace de travail. Le propriétaire doit augmenter la limite (Settings → Plans & credits)." });
      }
      return json(500, { success: false, error: `Image generation failed [${response.status}]: ${t.substring(0, 300)}` });
    }


    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) return json(500, { success: false, error: "No image generated" });

    const base64 = imageUrl.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const fileName = `${userId}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await supabase.storage.from("post-assets").upload(fileName, bytes, { contentType: "image/png" });
    if (upErr) {
      console.error("upload err", upErr);
      return json(500, { success: false, error: "IMAGE_NOT_PERSISTED: impossible d'enregistrer l'image dans le stockage." });
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from("post-assets")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);
    if (signErr || !signed?.signedUrl) {
      console.error("sign err", signErr);
      return json(500, { success: false, error: "IMAGE_NOT_PERSISTED: URL signée introuvable." });
    }
    if (signed.signedUrl.startsWith("data:")) {
      return json(500, { success: false, error: "IMAGE_NOT_PERSISTED: URL data: refusée." });
    }
    return json(200, { success: true, imageUrl: signed.signedUrl });
  } catch (e) {
    console.error("generate-image error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
