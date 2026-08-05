export const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "es", label: "Espagnol" },
  { code: "de", label: "Allemand" },
  { code: "ar", label: "Arabe" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "fr";

export const languageLabel = (code?: string | null) =>
  LANGUAGES.find((l) => l.code === code)?.label ?? "Français";
