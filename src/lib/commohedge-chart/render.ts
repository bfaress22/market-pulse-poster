/**
 * Deterministic 1600×900 CommoHedge chart renderer (Canvas).
 * Port of .cursor/skills/commohedge-daily/scripts/make_image.py layouts tour + headlines.
 */
import type {
  ChartBarRow,
  ChartLayout,
  CommoHedgeChartPayload,
  HeadlinesChartData,
  TourChartData,
} from "./types";

const W = 1600;
const H = 900;
const NAVY = "#0C1322";
const CARD = "#131D30";
const LIME = "#A6FF00";
const WHITE = "#FFFFFF";
const GREY = "#8FA0B5";
const DGREY = "#3A4759";
const RED = "#FF4D5E";
const MID = "#5C6B80";
const COLORS: Record<string, string> = {
  lime: LIME,
  red: RED,
  cyan: "#4DD9E6",
  white: WHITE,
  grey: GREY,
  mid: MID,
};

function px(frac: number, size: number) {
  return frac * size;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.strokeStyle = DGREY;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function pctText(v: number) {
  return v >= 0 ? `+${v.toFixed(1)}%` : `${v.toFixed(1)}%`;
}

function barColor(v: number) {
  return v > 0.05 ? LIME : v < -0.05 ? RED : MID;
}

function drawHatchedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = CARD;
  ctx.lineWidth = 1.5;
  const step = 7;
  for (let i = -h; i < w + h; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  d: { title?: string; subtitle?: string; tag?: string },
) {
  ctx.fillStyle = WHITE;
  ctx.font = "bold 42px system-ui, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("COMMO", px(0.035, W), px(0.945, H));
  const commoW = ctx.measureText("COMMO").width;
  ctx.fillStyle = LIME;
  ctx.fillText("HEDGE", px(0.035, W) + commoW + 8, px(0.945, H));

  const title = d.title || "";
  const size = title.length <= 52 ? 51 : title.length <= 58 ? 48 : 42;
  ctx.fillStyle = WHITE;
  ctx.font = `bold ${size}px system-ui, Segoe UI, sans-serif`;
  ctx.fillText(title, px(0.035, W), px(0.888, H));

  ctx.fillStyle = GREY;
  ctx.font = "26px system-ui, Segoe UI, sans-serif";
  ctx.fillText(d.subtitle || "", px(0.035, W), px(0.845, H));

  ctx.fillStyle = LIME;
  ctx.font = "600 24px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(d.tag || "DAILY TOUR", px(0.965, W), px(0.945, H));
  ctx.textAlign = "left";

  ctx.strokeStyle = DGREY;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(0.035, W), px(0.815, H));
  ctx.lineTo(px(0.965, W), px(0.815, H));
  ctx.stroke();
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  d: { footer_lines?: string[]; website?: string },
) {
  ctx.strokeStyle = DGREY;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px(0.035, W), px(0.085, H));
  ctx.lineTo(px(0.965, W), px(0.085, H));
  ctx.stroke();

  ctx.fillStyle = GREY;
  ctx.font = "17px system-ui, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  const lines = (d.footer_lines || []).slice(0, 2);
  const ys = [px(0.057, H), px(0.033, H)];
  lines.forEach((t, i) => ctx.fillText(t, px(0.035, W), ys[i]));

  ctx.fillStyle = LIME;
  ctx.font = "bold 23px system-ui, Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(d.website || "WWW.COMMOHEDGE.COM", px(0.965, W), px(0.045, H));
  ctx.textAlign = "left";
}

function drawHBars(
  ctx: CanvasRenderingContext2D,
  rows: ChartBarRow[],
  barBox: { x: number; y: number; w: number; h: number },
  xlim: [number, number],
  labelX: number,
  levelX: number,
) {
  const [xmin, xmax] = xlim;
  const n = Math.max(rows.length, 1);
  const rowH = barBox.h / n;
  const zeroX = barBox.x + ((0 - xmin) / (xmax - xmin)) * barBox.w;

  ctx.strokeStyle = DGREY;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(zeroX, barBox.y);
  ctx.lineTo(zeroX, barBox.y + barBox.h);
  ctx.stroke();

  rows.forEach((r, i) => {
    const yi = n - 1 - i;
    const cy = barBox.y + rowH * (yi + 0.5);
    const barH = rowH * 0.62;
    const v = Number(r.pct) || 0;
    const endX = barBox.x + ((v - xmin) / (xmax - xmin)) * barBox.w;
    const left = Math.min(zeroX, endX);
    const width = Math.abs(endX - zeroX);
    const color = barColor(v);
    const top = cy - barH / 2;
    if (r.hatched) drawHatchedBar(ctx, left, top, Math.max(width, 1), barH, color);
    else {
      ctx.fillStyle = color;
      ctx.fillRect(left, top, Math.max(width, 1), barH);
    }

    ctx.fillStyle = WHITE;
    ctx.font = "bold 20px system-ui, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    const label = pctText(v);
    if (v >= 0) {
      ctx.textAlign = "left";
      ctx.fillText(label, endX + 8, cy);
    } else {
      ctx.textAlign = "right";
      ctx.fillText(label, endX - 8, cy);
    }
    ctx.textAlign = "left";

    ctx.fillStyle = WHITE;
    ctx.font = "bold 20px system-ui, Segoe UI, sans-serif";
    ctx.fillText(r.name || "", labelX, cy);
    ctx.fillStyle = GREY;
    ctx.font = "18px system-ui, Segoe UI, sans-serif";
    ctx.fillText(r.level || "", levelX, cy);
  });
}

function renderTour(ctx: CanvasRenderingContext2D, d: TourChartData) {
  drawHeader(ctx, d);

  const news = (d.news || []).slice(0, 4);
  const chipW = px(0.2225, W);
  const gap = px(0.013, W);
  news.forEach((n, i) => {
    const x = px(0.035, W) + i * (chipW + gap);
    const y = px(0.690, H);
    drawCard(ctx, x, y, chipW, px(0.100, H));
    ctx.fillStyle = LIME;
    ctx.font = "bold 21px system-ui, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(n.tag || "", x + 22, px(0.765, H));
    ctx.fillStyle = WHITE;
    ctx.font = "18px system-ui, Segoe UI, sans-serif";
    const lines = String(n.text || "").split("\n");
    lines.forEach((line, li) => {
      ctx.fillText(line, x + 22, px(0.722, H) + li * 20 - (lines.length > 1 ? 10 : 0));
    });
  });

  const groups = (d.groups || []).slice(0, 4);
  if (!groups.length) {
    ctx.fillStyle = GREY;
    ctx.font = "24px system-ui, Segoe UI, sans-serif";
    ctx.fillText("No commodity groups in chart JSON", px(0.035, W), px(0.5, H));
    drawFooter(ctx, d);
    return;
  }
  const vals = groups.flatMap((g) => (g.rows || []).map((r) => Number(r.pct) || 0));
  const lo = Math.min(0, ...(vals.length ? vals : [0]));
  const hi = Math.max(0, ...(vals.length ? vals : [0]));
  const xlim: [number, number] = d.xlim || [lo * 1.35 - 0.6, hi * 1.35 + 0.8];
  const CW = px(0.455, W);
  const spots: [number, number, number][] = [
    [px(0.035, W), px(0.415, H), px(0.248, H)],
    [px(0.510, W), px(0.415, H), px(0.248, H)],
    [px(0.035, W), px(0.115, H), px(0.275, H)],
    [px(0.510, W), px(0.115, H), px(0.275, H)],
  ];

  groups.forEach((g, gi) => {
    const [x, y, h] = spots[gi];
    const rows = (g.rows || []).slice(0, 7);
    drawCard(ctx, x, y, CW, h);
    ctx.fillStyle = WHITE;
    ctx.font = "bold 28px system-ui, Segoe UI, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(g.title || "", x + 32, y + h - px(0.036, H));
    ctx.fillStyle = GREY;
    ctx.font = "18px system-ui, Segoe UI, sans-serif";
    ctx.fillText(g.subtitle || "", x + 32, y + h - px(0.062, H));

    const foot = g.footer;
    const bot = foot ? px(0.050, H) : px(0.018, H);
    const axY = y + bot;
    const axH = h - px(0.082, H) - bot;
    drawHBars(
      ctx,
      rows,
      { x: x + px(0.215, W), y: axY, w: CW - px(0.215, W) - 19, h: axH },
      xlim,
      x + 32,
      x + px(0.112, W),
    );
    if (foot) {
      ctx.fillStyle = GREY;
      ctx.font = "18px system-ui, Segoe UI, sans-serif";
      ctx.fillText(foot, x + 32, y + px(0.024, H));
    }
  });

  drawFooter(ctx, d);
}

function renderHeadlines(ctx: CanvasRenderingContext2D, d: HeadlinesChartData) {
  drawHeader(ctx, d);

  const GW = px(0.262, W);
  const GH = px(0.3275, H);
  const GAP = px(0.013, W);
  const GX = px(0.035, W);
  const topY = px(0.115, H) + GH + GAP;
  const botY = px(0.115, H);
  const cards = (d.cards || []).slice(0, 4);
  const spots: [number, number][] = [
    [GX, topY],
    [GX + GW + GAP, topY],
    [GX, botY],
    [GX + GW + GAP, botY],
  ];

  cards.forEach((c, i) => {
    const [x, y] = spots[i];
    drawCard(ctx, x, y, GW, GH);
    ctx.textBaseline = "middle";
    ctx.fillStyle = LIME;
    ctx.font = "bold 23px system-ui, Segoe UI, sans-serif";
    ctx.fillText(c.tag || "", x + 26, y + GH - px(0.036, H));
    ctx.fillStyle = COLORS[c.big_color || "white"] || WHITE;
    ctx.font = "bold 66px system-ui, Segoe UI, sans-serif";
    ctx.fillText(c.big || "", x + 26, y + GH - px(0.098, H));
    ctx.fillStyle = GREY;
    ctx.font = "19px system-ui, Segoe UI, sans-serif";
    ctx.fillText(c.sub || "", x + 26, y + GH - px(0.150, H));
    ctx.fillStyle = WHITE;
    ctx.font = "20px system-ui, Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    String(c.text || "")
      .split("\n")
      .forEach((line, li) => {
        ctx.fillText(line, x + 26, y + GH - px(0.200, H) + li * 24);
      });
    ctx.textBaseline = "middle";
    ctx.fillStyle = GREY;
    ctx.font = "18px system-ui, Segoe UI, sans-serif";
    ctx.fillText(c.foot || "", x + 26, y + px(0.024, H));
  });

  const RX = px(0.585, W);
  const RW = px(0.380, W);
  const mv = d.moves || { title: "Today's moves", rows: [] };
  const rows = (mv.rows || []).slice(0, 7);
  drawCard(ctx, RX, px(0.455, H), RW, px(0.330, H));
  ctx.fillStyle = WHITE;
  ctx.font = "bold 30px system-ui, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(mv.title || "", RX + 32, px(0.750, H));
  ctx.fillStyle = GREY;
  ctx.font = "19px system-ui, Segoe UI, sans-serif";
  ctx.fillText(mv.subtitle || "", RX + 32, px(0.724, H));

  const vals = rows.map((r) => Number(r.pct) || 0);
  const lo = Math.min(0, ...vals, 0);
  const hi = Math.max(0, ...vals, 0);
  drawHBars(
    ctx,
    rows,
    {
      x: RX + px(0.150, W),
      y: px(0.480, H),
      w: RW - px(0.150, W) - 40,
      h: px(0.215, H),
    },
    [lo * 1.45 - 0.7, hi * 1.45 + 0.9],
    RX + 32,
    RX + 32,
  );

  const rd = d.radar || { title: "Also on the radar", items: [] };
  drawCard(ctx, RX, px(0.115, H), RW, px(0.325, H));
  ctx.fillStyle = WHITE;
  ctx.font = "bold 30px system-ui, Segoe UI, sans-serif";
  ctx.fillText(rd.title || "", RX + 32, px(0.405, H));
  let yy = px(0.358, H);
  (rd.items || []).slice(0, 4).forEach((it) => {
    ctx.fillStyle = LIME;
    ctx.font = "bold 20px system-ui, Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillText(it.tag || "", RX + 32, yy);
    ctx.fillStyle = WHITE;
    ctx.font = "19px system-ui, Segoe UI, sans-serif";
    String(it.text || "")
      .split("\n")
      .forEach((line, li) => ctx.fillText(line, RX + 168, yy + li * 20));
    yy -= px(0.063, H);
  });

  drawFooter(ctx, d);
}

export function renderCommoHedgeChartToCanvas(payload: CommoHedgeChartPayload): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);

  const layout: ChartLayout = payload.layout;
  if (layout === "headlines") renderHeadlines(ctx, payload.data as HeadlinesChartData);
  else renderTour(ctx, payload.data as TourChartData);

  return canvas;
}

export async function renderCommoHedgeChartBlob(payload: CommoHedgeChartPayload): Promise<Blob> {
  const canvas = renderCommoHedgeChartToCanvas(payload);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))),
      "image/png",
    );
  });
}
