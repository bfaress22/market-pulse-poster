/** Frontend catalog mirroring supabase/functions/_shared/content-skills.ts */

export type ContentSkillMeta = {
  slug: string;
  name: string;
  description: string;
  imageBrand: {
    background: string;
    card: string;
    accent: string;
    text: string;
    secondary: string;
    negative: string;
    wordmark: string;
  };
};

export const CONTENT_SKILLS: ContentSkillMeta[] = [
  {
    slug: "commohedge-daily",
    name: "CommoHedge daily",
    description:
      "Analyse commodities, posts LinkedIn EN, image matplotlib générée à neuf (charte CommoHedge en référence).",
    imageBrand: {
      background: "#0C1322",
      card: "#131D30",
      accent: "#A6FF00",
      text: "#FFFFFF",
      secondary: "#8FA0B5",
      negative: "#FF4D5E",
      wordmark: "COMMOHEDGE",
    },
  },
];

export function getContentSkill(slug: string | null | undefined): ContentSkillMeta | null {
  if (!slug) return null;
  return CONTENT_SKILLS.find((s) => s.slug === slug) ?? null;
}
