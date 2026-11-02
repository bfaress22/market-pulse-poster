// Available AI models for users to pick from in Settings.
// All providers require the user's own API keys (BYOK).

export type AiProviderId = "openai" | "gemini" | "xai";

export type AiModel = {
  value: string;
  label: string;
  provider: AiProviderId;
  description?: string;
};

export const AI_PROVIDERS: {
  id: AiProviderId;
  label: string;
  keyField: "openai_api_key" | "gemini_api_key" | "xai_api_key";
  hasField: "has_openai_api_key" | "has_gemini_api_key" | "has_xai_api_key";
  placeholder: string;
  url: string;
  hint: string;
}[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyField: "openai_api_key",
    hasField: "has_openai_api_key",
    placeholder: "sk-...",
    url: "https://platform.openai.com/api-keys",
    hint: "GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-5.2.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    keyField: "gemini_api_key",
    hasField: "has_gemini_api_key",
    placeholder: "AIza...",
    url: "https://aistudio.google.com/app/apikey",
    hint: "Gemini texte + image (2.5 / 3.x).",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keyField: "xai_api_key",
    hasField: "has_xai_api_key",
    placeholder: "xai-...",
    url: "https://console.x.ai/",
    hint: "Modèles Grok texte et image. Facturation sur ton compte xAI.",
  },
];

export const POST_MODELS: AiModel[] = [
  { value: "xai/grok-4.7", label: "Grok 4.7", provider: "xai" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (rapide)", provider: "gemini" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro", provider: "gemini" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "gemini" },
  { value: "openai/gpt-5", label: "GPT-5", provider: "openai" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "openai" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "openai" },
  { value: "openai/gpt-5.2", label: "GPT-5.2", provider: "openai" },
];

export const IMAGE_MODELS: AiModel[] = [
  { value: "xai/grok-imagine-image-2.0", label: "Grok Imagine Image 2.0", provider: "xai" },
  { value: "google/gemini-3.1-flash-image-preview", label: "Nano Banana 2 (rapide)", provider: "gemini" },
  { value: "google/gemini-2.5-flash-image", label: "Nano Banana", provider: "gemini" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", provider: "gemini" },
];

export function providerFromModel(model: string | null | undefined): AiProviderId {
  if (!model) return "gemini";
  if (model.startsWith("xai/")) return "xai";
  if (model.startsWith("openai/")) return "openai";
  return "gemini";
}

export function modelsForProvider(models: AiModel[], provider: AiProviderId): AiModel[] {
  return models.filter((m) => m.provider === provider);
}

export function defaultPostModel(provider: AiProviderId): string {
  return modelsForProvider(POST_MODELS, provider)[0]?.value || POST_MODELS[0].value;
}

export function defaultImageModel(provider: AiProviderId): string | null {
  return modelsForProvider(IMAGE_MODELS, provider)[0]?.value ?? null;
}
