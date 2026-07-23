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

function buildPrompt(opts: {
  prompt: string;
  style?: string;
  mood?: string;
  colors?: string[];
  aspectRatio?: string;
  textOverlay?: { text: string; position: string; weight?: string; color?: string };
  wordmark?: { text: string; position: string };
  margin?: number;
}): string {
  const parts: string[] = [];
  parts.push(`Create a professional LinkedIn post image. Subject: ${opts.prompt}.`);
  if (opts.aspectRatio) parts.push(`Aspect ratio: ${opts.aspectRatio}.`);
  if (opts.style) parts.push(`Visual style: ${opts.style}.`);
  if (opts.mood) parts.push(`Mood and atmosphere: ${opts.mood}.`);
  if (opts.colors?.length) {
    parts.push(`Strict color palette to use as dominant colors: ${opts.colors.join(", ")}. Do not introduce other strong hues.`);
  }
  if (opts.textOverlay?.text) {
    const pos = POSITION_LABELS[opts.textOverlay.position] || "center";
    const weight = opts.textOverlay.weight || "bold";
    const color = opts.textOverlay.color ? ` in ${opts.textOverlay.color}` : "";
    parts.push(
      `Render this exact text on the image, perfectly legible, no typos, no extra words: "${opts.textOverlay.text}". ` +
      `Place it at the ${pos} of the image. Use a ${weight} sans-serif typography${color}, with clean kerning and high contrast against the background.`
    );
  }
  if (opts.wordmark?.text) {
    const pos = POSITION_LABELS[opts.wordmark.position] || "bottom-center";
    parts.push(`Add a small wordmark "${opts.wordmark.text}" at the ${pos}, discreet but readable.`);
  }
  if (opts.margin && opts.margin > 0) {
    parts.push(`Keep a clean empty band of approximately ${opts.margin}% of the image height free of any subject element at the bottom.`);
  }
  parts.push(`Premium editorial quality, sharp composition, balanced negative space.`);
  parts.push(`Strictly avoid: cartoonish artefacts, melting shapes, lens flares, garbled or distorted text, watermarks.`);
  return parts.join(" ");
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

    const fullPrompt = buildPrompt({ prompt, style, mood, colors, aspectRatio, textOverlay, wordmark, margin });

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
      return json(500, { success: false, error: "Image generation failed" });
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
      return json(200, { success: true, imageUrl });
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from("post-assets")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);
    if (signErr || !signed?.signedUrl) {
      console.error("sign err", signErr);
      return json(200, { success: true, imageUrl });
    }
    return json(200, { success: true, imageUrl: signed.signedUrl });
  } catch (e) {
    console.error("generate-image error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
