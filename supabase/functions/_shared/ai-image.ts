/**
 * Image generation routing: BYOK Google Gemini (direct API).
 * xAI images are handled separately via xai-image.ts.
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
  if (err.status === 402 || err.status === 403 || /credit|billing/i.test(msg)) {
    return {
      status: 402,
      error: "Crédits ou accès Gemini insuffisants. Vérifie ta clé et la facturation Google AI Studio.",
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

/**
 * Route Gemini image requests via the user's BYOK key (or GEMINI_API_KEY fallback).
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

  if (!opts.settings.use_byok) {
    return {
      status: 400,
      message: "Active BYOK et ajoute une clé Google Gemini dans Réglages pour générer des images.",
    };
  }
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
