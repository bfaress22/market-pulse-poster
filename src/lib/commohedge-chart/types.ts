/** CommoHedge chart JSON — mirrors .cursor/skills/commohedge-daily/references/image-spec.md */

export type ChartLayout = "tour" | "headlines";

export type ChartNewsChip = { tag: string; text: string };

export type ChartBarRow = {
  name: string;
  level?: string;
  pct: number;
  hatched?: boolean;
};

export type ChartGroup = {
  title: string;
  subtitle?: string;
  footer?: string;
  rows: ChartBarRow[];
};

export type TourChartData = {
  title: string;
  subtitle?: string;
  tag?: string;
  footer_lines?: string[];
  website?: string;
  news: ChartNewsChip[];
  groups: ChartGroup[];
  xlim?: [number, number];
};

export type HeadlineCard = {
  tag: string;
  big: string;
  big_color?: "lime" | "red" | "white";
  sub?: string;
  text?: string;
  foot?: string;
};

export type HeadlinesChartData = {
  title: string;
  subtitle?: string;
  tag?: string;
  footer_lines?: string[];
  website?: string;
  cards: HeadlineCard[];
  moves: { title: string; subtitle?: string; rows: ChartBarRow[] };
  radar: { title: string; items: { tag: string; text: string }[] };
};

export type CommoHedgeChartPayload = {
  layout: ChartLayout;
  data: TourChartData | HeadlinesChartData;
};

export function isCommoHedgeChartPayload(v: unknown): v is CommoHedgeChartPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (o.layout === "tour" || o.layout === "headlines") && !!o.data && typeof o.data === "object";
}
