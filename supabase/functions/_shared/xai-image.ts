import { xaiErrorMessage } from "./ai-text.ts";

type XaiImageOptions = {
  settings: { use_byok?: boolean | null; xai_api_key?: string | null } | null;
  model: string;
  prompt: string;
  aspectRatio?: string;
  inputImageUrl?: string;
};

export function buildXaiImageRequest(opts: XaiImageOptions) {
  if (!opts.settings?.use_byok) throw new Error("Active tes propres clés API pour utiliser les images Grok.");
  if (!opts.settings.xai_api_key?.trim()) throw new Error("Ajoute et enregistre ta clé API xAI dans les paramètres.");
  if (!/^xai\/[a-zA-Z0-9._-]+$/.test(opts.model)) throw new Error("Modèle d’image xAI invalide.");
  return {
    url: `https://api.x.ai/v1/images/${opts.inputImageUrl ? "edits" : "generations"}`,
    body: {
      model: opts.model.slice(4), prompt: opts.prompt, n: 1,
      response_format: "b64_json", aspect_ratio: opts.aspectRatio || "1:1",
      ...(opts.inputImageUrl ? { image: { type: "image_url", url: opts.inputImageUrl } } : {}),
    },
  };
}

export async function generateXaiImage(opts: XaiImageOptions): Promise<{ base64: string; mimeType: string }> {
  const request = buildXaiImageRequest(opts);
  const key = opts.settings?.xai_api_key?.trim();
  const response = await fetch(request.url, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(request.body),
  });
  if (!response.ok) throw new Error(xaiErrorMessage(response.status));
  const data = await response.json();
  const image = data.data?.[0];
  if (typeof image?.b64_json !== "string" || !image.b64_json) throw new Error("xAI n’a retourné aucune image.");
  // xAI image endpoints return JPEG data by default; retain PNG if detected.
  const mimeType = image.b64_json.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
  return { base64: image.b64_json, mimeType };
}