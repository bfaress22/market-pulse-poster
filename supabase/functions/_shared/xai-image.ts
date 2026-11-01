import { xaiErrorMessage } from "./ai-text.ts";

type XaiImageOptions = {
  settings: { use_byok?: boolean | null; xai_api_key?: string | null } | null;
  model: string;
  prompt: string;
  aspectRatio?: string;
  inputImageUrl?: string;
};

const XAI_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "1:2", "2:1"];

export function normalizeXaiAspectRatio(input?: string): string {
  const m = (input || "").match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!m) return "1:1";
  const exact = `${m[1]}:${m[2]}`;
  if (XAI_RATIOS.includes(exact)) return exact;
  const target = Number(m[1]) / Number(m[2]);
  let best = "1:1", diff = Infinity;
  for (const r of XAI_RATIOS) {
    const [a, b] = r.split(":").map(Number);
    const d = Math.abs(a / b - target);
    if (d < diff) { diff = d; best = r; }
  }
  return best;
}

export function buildXaiImageRequest(opts: XaiImageOptions) {
  if (!opts.settings?.use_byok) throw new Error("Active tes propres clés API pour utiliser les images Grok.");
  if (!opts.settings.xai_api_key?.trim()) throw new Error("Ajoute et enregistre ta clé API xAI dans les paramètres.");
  if (!/^xai\/[a-zA-Z0-9._-]+$/.test(opts.model)) throw new Error("Modèle d’image xAI invalide.");
  return {
    url: `https://api.x.ai/v1/images/${opts.inputImageUrl ? "edits" : "generations"}`,
    body: {
      model: opts.model.slice(4), prompt: opts.prompt.slice(0, 8000), n: 1,
      response_format: "b64_json", aspect_ratio: normalizeXaiAspectRatio(opts.aspectRatio),
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
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("xAI image error", response.status, detail.slice(0, 500));
    throw new Error(xaiErrorMessage(response.status));
  }
  const data = await response.json();
  const image = data.data?.[0];
  if (typeof image?.b64_json !== "string" || !image.b64_json) throw new Error("xAI n’a retourné aucune image.");
  // xAI image endpoints return JPEG data by default; retain PNG if detected.
  const mimeType = image.b64_json.startsWith("iVBORw0KGgo") ? "image/png" : "image/jpeg";
  return { base64: image.b64_json, mimeType };
}