/**
 * Image generation routing: BYOK Google Gemini (direct API) vs Lovable AI Gateway.
 * If the user enables BYOK and provides a Gemini key, we call Google directly
 * (no Lovable credits consumed). Otherwise we use the Lovable AI Gateway.
 */

export type AiImageSettings = {
  use_byok?: boolean | null;
  gemini_api_key?: string | null;
};

export type ImageOk = { base64: string; mimeType: string };
export type ImageErr = { status: number; message: string };
export type ImageResult = ImageOk | ImageErr;

export const ALLOWED_IMAGE_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
];

export const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

const GEMINI_IMAGE_ALIASES: Record<string, string> = {
  "google/gemini-2.5-flash-image": "gemini-2.5-flash-image",
  "google/gemini-2.5-flash-image-preview": "gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview": "gemini-3-pro-image",
  "google/gemini-3-pro-image": "gemini-3-pro-image",
  "google/gemini-3.1-flash-image-preview": "gemini-3.1-flash-image",
  "google/gemini-3.1-flash-image": "gemini-3.1-flash-image",
};

export function pickImageModel(requested?: string | null, stored?: string | null): string {
  const model = requested || stored || DEFAULT_IMAGE_MODEL;
  return ALLOWED_IMAGE_MODELS.includes(model) ? model : DEFAULT_IMAGE_MODEL;
}

export function normalizeGeminiImageModel(modelId: string): string {
  return GEMINI_IMAGE_ALIASES[modelId] ?? modelId.replace(/^google\//, "");
}

function scrub(msg: string): string {
  return msg.replace(/AIza[0-9A-Za-z_\-]{10,}/g, "AIza***");
}

/** Map upstream failures to a user-facing (French) message + HTTP status. */
export function mapImageError(err: ImageErr): { status: number; error: string } {
  const msg = err.message || "";
  if (err.status === 429 || /429|quota|rate|RESOURCE_EXHAUSTED/i.test(msg)) {
    return { status: 429, error: "Quota du fournisseur atteint. Réessaie dans un moment (ou vérifie ta facturation Google)." };
  }
  if (err.status === 402 || err.status === 403 || /credit/i.test(msg)) {
    return {
      status: 402,
      error: "Crédits IA Lovable épuisés. Active le BYOK avec ta clé Google Gemini dans Réglages, ou recharge des crédits.",
    };
  }
  if (err.status === 401 || /API_KEY|invalid.*key/i.test(msg)) {
    return { status: 401, error: "Clé API Google Gemini invalide. Vérifie-la dans Réglages → BYOK." };
  }
  return { status: 502, error: `Échec de la génération d'image: ${scrub(msg).slice(0, 200)}` };
}

async function fetchImageAsInline(url: string): Promise<{ mimeType: string; data: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
    if (!mimeType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 7 * 1024 * 1024) return null;
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { mimeType, data: btoa(binary) };
  } catch (_e) {
    return null;
  }
}

/** Direct Google Gemini REST call — uses the user's own key (BYOK). */
export async function generateImageWithGemini(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio?: string;
  inputImageUrl?: string;
}): Promise<ImageResult> {
  const bareModel = normalizeGeminiImageModel(opts.model);
  const parts: unknown[] = [{ text: opts.prompt }];
  if (opts.inputImageUrl) {
    const inline = await fetchImageAsInline(opts.inputImageUrl);
    if (inline) parts.push({ inlineData: inline });
  }

  const imageConfig: Record<string, string> = {};
  if (opts.aspectRatio) imageConfig.aspectRatio = opts.aspectRatio;
  if (bareModel === "gemini-3-pro-image") imageConfig.imageSize = "2K";

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${bareModel}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            ...(Object.keys(imageConfig).length ? { imageConfig } : {}),
          },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Gemini image error:", res.status, scrub(text).slice(0, 300));
      return { status: res.status, message: scrub(text) };
    }

    const data = await res.json();
    const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = responseParts.find((p: { inlineData?: { data?: string } }) => p?.inlineData?.data);
    const base64 = imagePart?.inlineData?.data;
    if (!base64) return { status: 502, message: "Gemini n'a retourné aucune image" };
    return { base64, mimeType: imagePart.inlineData.mimeType || "image/png" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 502, message: scrub(message) };
  }
}

/** Lovable AI Gateway (consumes Lovable credits) — used when BYOK is off. */
export async function generateImageWithLovable(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  inputImageUrl?: string;
}): Promise<ImageResult> {
  const userContent: unknown = opts.inputImageUrl
    ? [
        { type: "text", text: `Edit this image following these instructions: ${opts.prompt}` },
        { type: "image_url", image_url: { url: opts.inputImageUrl } },
      ]
    : opts.prompt;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: userContent }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Lovable image error:", response.status, text.slice(0, 300));
      return { status: response.status, message: text };
    }

    const data = await response.json();
    const imageUrl: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) return { status: 502, message: "Lovable n'a retourné aucune image" };

    const match = imageUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
    if (match) return { mimeType: match[1], base64: match[2] };

    const inline = await fetchImageAsInline(imageUrl);
    if (!inline) return { status: 502, message: "Impossible de télécharger l'image générée" };
    return { base64: inline.data, mimeType: inline.mimeType };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 502, message };
  }
}

/**
 * Route the request: BYOK Gemini direct when enabled + key present,
 * otherwise the Lovable AI Gateway.
 */
export async function generateImageRouted(opts: {
  settings: AiImageSettings;
  model: string;
  prompt: string;
  aspectRatio?: string;
  inputImageUrl?: string;
}): Promise<ImageResult> {
  const byokKey = opts.settings.use_byok ? (opts.settings.gemini_api_key ?? "").trim() : "";
  const envGeminiKey = (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
  const geminiKey = byokKey || (opts.settings.use_byok ? envGeminiKey : "");

  if (opts.settings.use_byok) {
    if (!geminiKey) {
      return {
        status: 400,
        message: "BYOK est activé mais aucune clé Google Gemini n'est configurée. Ajoute-la dans Réglages → BYOK.",
      };
    }
    return generateImageWithGemini({
      apiKey: geminiKey,
      model: opts.model,
      prompt: opts.prompt,
      aspectRatio: opts.aspectRatio,
      inputImageUrl: opts.inputImageUrl,
    });
  }

  const lovableKey = (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();
  if (!lovableKey) {
    return {
      status: 500,
      message: "LOVABLE_API_KEY non configurée. Active le BYOK avec une clé Gemini, ou configure le secret Lovable.",
    };
  }
  return generateImageWithLovable({
    apiKey: lovableKey,
    model: opts.model,
    prompt: opts.prompt,
    inputImageUrl: opts.inputImageUrl,
  });
}
