export type TextSettings = {
  use_byok?: boolean;
  openai_api_key?: string | null;
  xai_api_key?: string | null;
};

export function resolveTextProvider(model: string, settings: TextSettings | null, lovableKey?: string) {
  if (model.startsWith("xai/")) {
    if (!settings?.use_byok) throw new Error("Active tes propres clés API dans les paramètres pour utiliser Grok.");
    if (!settings.xai_api_key?.trim()) throw new Error("Ajoute et enregistre ta clé API xAI dans les paramètres pour utiliser Grok.");
    return { model: model.slice(4), url: "https://api.x.ai/v1/chat/completions", key: settings.xai_api_key.trim() };
  }
  if (settings?.use_byok && model.startsWith("openai/") && settings.openai_api_key) {
    return { model: model.slice(7), url: "https://api.openai.com/v1/chat/completions", key: settings.openai_api_key };
  }
  if (!lovableKey) throw new Error("Aucune clé Lovable AI disponible.");
  return { model, url: "https://ai.gateway.lovable.dev/v1/chat/completions", key: lovableKey };
}

export function normalizeGrokModels(models: unknown, modality: "text" | "image" = "text"): { value: string; label: string }[] {
  if (!Array.isArray(models)) return [];
  const ids = new Set<string>();
  for (const model of models) {
    if (!model || typeof model !== "object") continue;
    const { id, aliases, output_modalities } = model;
    if (Array.isArray(output_modalities) && !output_modalities.includes(modality)) continue;
    for (const name of [id, ...(Array.isArray(aliases) ? aliases : [])]) {
      if (typeof name === "string" && /^[a-zA-Z0-9._-]+$/.test(name)) ids.add(name);
    }
  }
  return [...ids].sort().map((id) => ({ value: `xai/${id}`, label: `Grok · ${id} (API xAI)` }));
}

export function xaiErrorMessage(status: number) {
  if (status === 401) return "Clé API xAI invalide ou expirée. Remplace-la dans les paramètres.";
  if (status === 402) return "Crédits xAI insuffisants. Recharge ton compte xAI.";
  if (status === 403) return "Accès xAI refusé : vérifie les permissions de ta clé et l’accès au modèle.";
  if (status === 404) return "Ce modèle Grok n’est plus disponible. Actualise la liste dans les paramètres.";
  if (status === 429) return "Limite de requêtes xAI atteinte. Réessaie plus tard.";
  if (status === 503) return "Le modèle Grok est temporairement surchargé. Réessaie plus tard.";
  return `La requête xAI a échoué (${status}). Vérifie le modèle et réessaie.`;
}