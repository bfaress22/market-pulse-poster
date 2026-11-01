// Available AI models for users to pick from in Settings.
// All providers require the user's own API keys (BYOK).

export type AiModel = {
  value: string;
  label: string;
  provider: "openai" | "gemini" | "xai";
  description?: string;
};

export const POST_MODELS: AiModel[] = [
  { value: "xai/grok-4.7", label: "Grok 4.7 (API xAI)", provider: "xai" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (default, fast)", provider: "gemini" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (best reasoning)", provider: "gemini" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (balanced)", provider: "gemini" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (cheapest)", provider: "gemini" },
  { value: "openai/gpt-5", label: "GPT-5 (powerful)", provider: "openai" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "openai" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano (fastest)", provider: "openai" },
  { value: "openai/gpt-5.2", label: "GPT-5.2 (latest)", provider: "openai" },
];

export const IMAGE_MODELS: AiModel[] = [
  { value: "xai/grok-imagine-image-2.0", label: "Grok Imagine Image 2.0 (API xAI)", provider: "xai" },
  { value: "google/gemini-3.1-flash-image-preview", label: "Nano Banana 2 (default, fast pro quality)", provider: "gemini" },
  { value: "google/gemini-2.5-flash-image", label: "Nano Banana (fast & cheap)", provider: "gemini" },
  { value: "google/gemini-3-pro-image-preview", label: "Gemini 3 Pro Image (max quality)", provider: "gemini" },
];
