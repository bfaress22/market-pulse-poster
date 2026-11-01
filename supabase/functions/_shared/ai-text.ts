export type TextSettings = {
  use_byok?: boolean;
  openai_api_key?: string | null;
  xai_api_key?: string | null;
  gemini_api_key?: string | null;
};

function requireByok(settings: TextSettings | null) {
  if (!settings?.use_byok) {
    throw new Error("Active tes propres clés API (BYOK) dans les paramètres pour générer du contenu.");
  }
}

/** Route text generation to the user's BYOK provider (xAI / OpenAI / Gemini). No shared gateway. */
export function resolveTextProvider(model: string, settings: TextSettings | null) {
  if (model.startsWith("xai/")) {
    requireByok(settings);
    if (!settings?.xai_api_key?.trim()) {
      throw new Error("Ajoute et enregistre ta clé API xAI dans les paramètres pour utiliser Grok.");
    }
    return {
      model: model.slice(4),
      url: "https://api.x.ai/v1/chat/completions",
      key: settings.xai_api_key.trim(),
    };
  }

  if (model.startsWith("openai/")) {
    requireByok(settings);
    if (!settings?.openai_api_key?.trim()) {
      throw new Error("Ajoute et enregistre ta clé API OpenAI dans les paramètres.");
    }
    return {
      model: model.slice(7),
      url: "https://api.openai.com/v1/chat/completions",
      key: settings.openai_api_key.trim(),
    };
  }

  if (model.startsWith("google/")) {
    requireByok(settings);
    if (!settings?.gemini_api_key?.trim()) {
      throw new Error("Ajoute et enregistre ta clé API Google Gemini dans les paramètres.");
    }
    return {
      model: model.replace(/^google\//, ""),
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: settings.gemini_api_key.trim(),
    };
  }

  throw new Error(
    `Modèle non supporté: ${model}. Choisis un modèle Gemini, OpenAI ou Grok dans les réglages (BYOK).`,
  );
}

export function normalizeGrokModels(models: unknown, modality: "text" | "image" = "text"): { value: string; label: string }[] {
  if (!Array.isArray(models)) return [];
  const ids = new Set<string>();
  for (const model of models) {
    if (!model || typeof model !== "object") continue;
    const { id, aliases, output_modalities } = model as {
      id?: unknown;
      aliases?: unknown;
      output_modalities?: unknown;
    };
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
