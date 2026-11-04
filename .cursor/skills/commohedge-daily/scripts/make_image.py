#!/usr/bin/env python3
"""CommoHedge branded image renderer (1600x900 PNG for LinkedIn).

Usage:
    python make_image.py --layout tour|headlines|weekly --data data.json --out out.png

The data file format is described in references/image-spec.md.
All text is escaped for matplotlib (dollar signs), and soft warnings are
printed when text is likely too long.
"""
import argparse
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from matplotlib.patches import FancyBboxPatch
from matplotlib.transforms import blended_transform_factory

NAVY, CARD, LIME, WHITE = "#0C1322", "#131D30", "#A6FF00", "#FFFFFF"
GREY, DGREY, RED, CYAN, MID = "#8FA0B5", "#3A4759", "#FF4D5E", "#4DD9E6", "#5C6B80"
COLORS = {"lime": LIME, "red": RED, "cyan": CYAN, "white": WHITE, "grey": GREY, "mid": MID}

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)


def E(s):
    """Escape dollar signs so matplotlib does not switch to math mode."""
    return str(s).replace("\\$", "$").replace("$", r"\$")


def setup_fonts():
    found = False
    for folder in ["/usr/share/fonts/truetype/google-fonts", os.path.expanduser("~/.fonts"),
                   os.path.join(os.path.dirname(__file__), "..", "assets")]:
        for f in ["Poppins-Bold.ttf", "Poppins-Medium.ttf", "Poppins-Regular.ttf", "Poppins-Light.ttf"]:
            p = os.path.join(folder, f)
            if os.path.exists(p):
                fm.fontManager.addfont(p)
                found = True
    plt.rcParams["font.family"] = "Poppins" if found else "DejaVu Sans"
    if not found:
        warn("Poppins not found: using DejaVu Sans (text may be wider).")


def card(fig, x, y, w, h):
    fig.patches.append(FancyBboxPatch((x, y), w, h, transform=fig.transFigure,
                                      boxstyle="round,pad=0.006,rounding_size=0.012",
                                      linewidth=1, edgecolor=DGREY, facecolor=CARD, zorder=-10))


def clean_axes(ax):
    ax.set_zorder(5)
    ax.patch.set_alpha(0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xticks([])
    ax.set_yticks([])


def header(fig, d):
    title = d.get("title", "")
    if len(title) > 60:
        warn(f"Title is {len(title)} characters; shorten it (about 55 max).")
    fig.text(0.035, 0.945, "COMMO", fontsize=21, color=WHITE, weight="bold", va="center")
    fig.text(0.1055, 0.945, "HEDGE", fontsize=21, color=LIME, weight="bold", va="center")
    size = 25.5 if len(title) <= 52 else 24 if len(title) <= 58 else 21
    fig.text(0.035, 0.888, E(title), fontsize=size, color=WHITE, weight="bold", va="center")
    fig.text(0.035, 0.845, E(d.get("subtitle", "")), fontsize=13, color=GREY, va="center")
    fig.text(0.965, 0.945, E(d.get("tag", "HORMUZ CRISIS  ·  MONTH 8")), fontsize=12, color=LIME,
             weight="medium", ha="right", va="center")
    fig.add_artist(plt.Line2D([0.035, 0.965], [0.815, 0.815], color=DGREY, lw=1))


def footer(fig, d, line_y=(0.057, 0.033), rule_y=0.085):
    fig.add_artist(plt.Line2D([0.035, 0.965], [rule_y, rule_y], color=DGREY, lw=1))
    for y, text in zip(line_y, d.get("footer_lines", [])[:2]):
        if len(text) > 165:
            warn(f"Footer line is {len(text)} characters and may overflow: {text[:50]}...")
        fig.text(0.035, y, E(text), fontsize=8.5, color=GREY)
    fig.text(0.965, 0.045, d.get("website", "WWW.COMMOHEDGE.COM"), fontsize=11.5, color=LIME,
             weight="bold", ha="right")


def pct_text(v):
    return f"{v:+.1f}%" if v >= 0 else f"{v:.1f}%"


def bar_color(v):
    return LIME if v > 0.05 else (RED if v < -0.05 else MID)


# --------------------------------------------------------------------------- TOUR
def layout_tour(fig, d):
    header(fig, d)
    news = d.get("news", [])[:4]
    w, gap = 0.2225, 0.013
    for i, n in enumerate(news):
        x = 0.035 + i * (w + gap)
        card(fig, x, 0.690, w, 0.100)
        for line in n["text"].split("\n"):
            if len(line) > 50:
                warn(f"News chip line is long ({len(line)}): {line[:40]}...")
        fig.text(x + 0.014, 0.765, E(n["tag"]), color=LIME, fontsize=10.5, weight="bold", va="center")
        fig.text(x + 0.014, 0.722, E(n["text"]), color=WHITE, fontsize=9.1, va="center", linespacing=1.4)

    groups = d["groups"]
    if len(groups) != 4:
        warn("tour layout expects exactly 4 groups.")
    vals = [r["pct"] for g in groups for r in g["rows"]]
    lo, hi = min(vals + [0]), max(vals + [0])
    xmin, xmax = d.get("xlim") or [lo * 1.35 - 0.6, hi * 1.35 + 0.8]
    LX, RX, CW = 0.035, 0.510, 0.455
    spots = [(LX, 0.415, 0.248), (RX, 0.415, 0.248), (LX, 0.115, 0.275), (RX, 0.115, 0.275)]
    for (x, y, h), g in zip(spots, groups):
        rows = g["rows"]
        if len(rows) > 7:
            warn(f"Group '{g['title']}' has {len(rows)} rows; 7 is the maximum that stays readable.")
        card(fig, x, y, CW, h)
        fig.text(x + 0.020, y + h - 0.036, E(g["title"]), color=WHITE, fontsize=14, weight="bold", va="center")
        sub = g.get("subtitle", "")
        if len(sub) > 95:
            warn(f"Group subtitle is long ({len(sub)}): {sub[:40]}...")
        fig.text(x + 0.020, y + h - 0.062, E(sub), color=GREY, fontsize=9, va="center")
        foot = g.get("footer")
        bot = 0.050 if foot else 0.018
        ax_y, ax_h = y + bot, h - 0.082 - bot
        ax = fig.add_axes([x + 0.215, ax_y, CW - 0.215 - 0.012, ax_h])
        clean_axes(ax)
        ax.set_xlim(xmin, xmax)
        n = len(rows)
        ax.set_ylim(-0.5, n - 0.5)
        ax.axvline(0, color=DGREY, lw=1.2, zorder=2)
        off = (xmax - xmin) * 0.018
        for i, r in enumerate(rows):
            yi = n - 1 - i
            v = r["pct"]
            col = bar_color(v)
            if r.get("hatched"):
                ax.barh(yi, v, height=0.62, facecolor=col, alpha=0.75, edgecolor=CARD, hatch="////", lw=0, zorder=3)
            else:
                ax.barh(yi, v, height=0.62, color=col, zorder=3)
            if v >= 0:
                ax.text(v + off, yi, pct_text(v), va="center", ha="left", color=WHITE, fontsize=11, weight="bold")
            else:
                ax.text(v - off, yi, pct_text(v), va="center", ha="right", color=WHITE, fontsize=11, weight="bold")
            fy = ax_y + ax_h * (yi + 0.5) / n
            fig.text(x + 0.020, fy, E(r["name"]), va="center", ha="left", color=WHITE, fontsize=10, weight="bold")
            fig.text(x + 0.112, fy, E(r.get("level", "")), va="center", ha="left", color=GREY, fontsize=8.8)
        if foot:
            fig.text(x + 0.020, y + 0.024, E(foot), color=GREY, fontsize=8.8, va="center")
    footer(fig, d)


# --------------------------------------------------------------------------- HEADLINES
def layout_headlines(fig, d):
    header(fig, d)
    GX, GW, GH, GAP = 0.035, 0.262, 0.3275, 0.013
    top_y, bot_y = 0.115 + GH + GAP, 0.115
    cards = d["cards"][:4]
    spots = [(GX, top_y), (GX + GW + GAP, top_y), (GX, bot_y), (GX + GW + GAP, bot_y)]
    for (x, y), c in zip(spots, cards):
        h = GH
        card(fig, x, y, GW, h)
        fig.text(x + 0.016, y + h - 0.036, E(c["tag"]), color=LIME, fontsize=11.5, weight="bold", va="center")
        col = COLORS.get(c.get("big_color", "white"), WHITE)
        fig.text(x + 0.016, y + h - 0.098, E(c["big"]), color=col, fontsize=33, weight="bold", va="center")
        fig.text(x + 0.016, y + h - 0.150, E(c.get("sub", "")), color=GREY, fontsize=9.6, va="center")
        txt = c.get("text", "")
        for line in txt.split("\n"):
            if len(line) > 42:
                warn(f"Card text line is long ({len(line)}): {line[:40]}...")
        fig.text(x + 0.016, y + h - 0.200, E(txt), color=WHITE, fontsize=10, va="top", linespacing=1.45)
        fig.text(x + 0.016, y + 0.024, E(c.get("foot", "")), color=GREY, fontsize=8.8, va="center")

    RX, RW = 0.585, 0.380
    mv = d["moves"]
    rows = mv["rows"]
    card(fig, RX, 0.455, RW, 0.330)
    fig.text(RX + 0.020, 0.750, E(mv["title"]), color=WHITE, fontsize=15, weight="bold", va="center")
    fig.text(RX + 0.020, 0.724, E(mv.get("subtitle", "")), color=GREY, fontsize=9.6, va="center")
    n = len(rows)
    ax = fig.add_axes([RX + 0.150, 0.480, RW - 0.150 - 0.025, 0.215])
    clean_axes(ax)
    vals = [r["pct"] for r in rows]
    lo, hi = min(vals + [0]), max(vals + [0])
    ax.set_xlim(lo * 1.45 - 0.7, hi * 1.45 + 0.9)
    ax.set_ylim(-0.5, n - 0.5)
    ax.axvline(0, color=DGREY, lw=1.2, zorder=2)
    off = (hi - lo) * 0.03 + 0.05
    for i, r in enumerate(rows):
        yi = n - 1 - i
        v = r["pct"]
        col = bar_color(v)
        if r.get("hatched"):
            ax.barh(yi, v, height=0.6, facecolor=col, alpha=0.75, edgecolor=CARD, hatch="////", lw=0, zorder=3)
        else:
            ax.barh(yi, v, height=0.6, color=col, zorder=3)
        if v >= 0:
            ax.text(v + off, yi, pct_text(v), va="center", ha="left", color=WHITE, fontsize=11.5, weight="bold")
        else:
            ax.text(v - off, yi, pct_text(v), va="center", ha="right", color=WHITE, fontsize=11.5, weight="bold")
        fig.text(RX + 0.020, 0.480 + 0.215 * (yi + 0.5) / n, E(r["name"]), va="center", ha="left",
                 color=WHITE, fontsize=10, weight="bold")

    rd = d["radar"]
    card(fig, RX, 0.115, RW, 0.325)
    fig.text(RX + 0.020, 0.405, E(rd["title"]), color=WHITE, fontsize=15, weight="bold", va="center")
    yy = 0.358
    for it in rd["items"][:4]:
        fig.text(RX + 0.020, yy, E(it["tag"]), color=LIME, fontsize=9.8, weight="bold", va="top")
        fig.text(RX + 0.105, yy, E(it["text"]), color=WHITE, fontsize=9.4, va="top", linespacing=1.4)
        yy -= 0.063
    footer(fig, d)


# --------------------------------------------------------------------------- WEEKLY
def draw_weekly_chart(fig, spec, x_card, color):
    card(fig, x_card, 0.305, 0.455, 0.47)
    ax = fig.add_axes([x_card + 0.045, 0.475, 0.385, 0.225])
    clean_axes(ax)
    pts = spec["points"]
    n = len(pts)
    solid = [(i, p) for i, p in enumerate(pts) if not p.get("hollow")]
    allv = [p["value"] for p in pts]
    lo, hi = min(allv), max(allv)
    r = max(hi - lo, abs(hi) * 0.01, 1e-6)
    ylo, yhi = lo - 0.55 * r, hi + 0.45 * r
    ax.set_xlim(-0.4, n - 1 + 0.95)
    ax.set_ylim(ylo, yhi)
    ax.set_title(E(spec["title"]), color=WHITE, fontsize=15, weight="bold", loc="left", pad=22)
    ax.text(0, 1.055, E(spec.get("subtitle", "")), transform=ax.transAxes, color=GREY, fontsize=10)
    xs = [i for i, _ in solid]
    ys = [p["value"] for _, p in solid]
    ax.fill_between(xs, ys, ylo, color=color, alpha=0.08, lw=0, zorder=2)
    ax.plot(xs, ys, color=color, lw=3, zorder=4, solid_capstyle="round")
    ax.plot(xs, ys, ls="none", marker="o", ms=8, mfc=NAVY, mec=color, mew=2.4, zorder=5)
    last_solid = xs[-1] if xs else None
    for i, p in enumerate(pts):
        txt = E(p.get("value_text") or f"{p['value']:,.2f}")
        below = p.get("pos") == "below"
        dy = -0.30 * r if below else 0.10 * r
        if p.get("hollow"):
            ax.plot([i], [p["value"]], marker="o", ms=13, mfc=NAVY, mec=color, mew=2.6, zorder=6)
            ax.text(i, p["value"] + 0.10 * r, txt, ha="center", color=color, fontsize=16, weight="bold", zorder=6)
        elif i == last_solid and i == n - 1:
            ax.plot([i], [p["value"]], marker="o", ms=13, mfc=color, mec=color, zorder=6)
            ax.text(i, p["value"] + 0.12 * r, txt, ha="center", color=color, fontsize=16, weight="bold", zorder=6)
        else:
            ax.text(i, p["value"] + dy, txt, ha="center", color=WHITE, fontsize=11.5, weight="bold", zorder=6)
    first = pts[0]["value"]
    last = pts[-1]["value"] if not pts[-1].get("hollow") else None
    if spec.get("bracket") and last is not None:
        ax.plot([-0.4, n - 1 + 0.55], [first, first], color=GREY, lw=1, ls=(0, (3, 3)), zorder=3)
        ax.annotate("", xy=(n - 1 + 0.62, last), xytext=(n - 1 + 0.62, first),
                    arrowprops=dict(arrowstyle="<->", color=color, lw=1.6), zorder=6)
        ax.text(n - 1 + 0.72, (first + last) / 2, E(spec["bracket"]), color=color, fontsize=10.5,
                weight="bold", va="center", ha="left")
    tr = blended_transform_factory(ax.transData, ax.transAxes)
    for i, p in enumerate(pts):
        ax.text(i, -0.10, E(p["label"]), transform=tr, ha="center", va="top", color=GREY, fontsize=10, weight="bold")
        pc = COLORS.get(p.get("pct_color", "grey"), GREY)
        if p.get("pct"):
            ax.text(i, -0.25, E(p["pct"]), transform=tr, ha="center", va="top", color=pc, fontsize=11.5, weight="bold")
        if p.get("event"):
            ax.text(i, -0.42, E(p["event"]), transform=tr, ha="center", va="top", color=GREY, fontsize=8.8,
                    linespacing=1.35)


def layout_weekly(fig, d):
    header(fig, d)
    charts = d["charts"][:2]
    for x_card, spec in zip([0.035, 0.510], charts):
        draw_weekly_chart(fig, spec, x_card, COLORS.get(spec.get("color", "lime"), LIME))
    sb = d["scoreboard"]
    card(fig, 0.035, 0.115, 0.930, 0.165)
    fig.text(0.060, 0.248, E(sb.get("title", "THE WEEK IN ONE LINE")), color=WHITE, fontsize=13, weight="bold")
    ax = fig.add_axes([0.150, 0.138, 0.300, 0.090])
    clean_axes(ax)
    bars = sb["bars"]
    names = [b["name"] for b in bars][::-1]
    vals = [b["pct"] for b in bars][::-1]
    cols = [bar_color(v) for v in vals]
    bb = ax.barh(names, vals, color=cols, height=0.55, zorder=3)
    lo, hi = min(vals + [0]), max(vals + [0])
    ax.set_xlim(lo * 1.8 - 0.8, hi * 1.5 + 1.0)
    off = (hi - lo) * 0.04 + 0.1
    for b, v in zip(bb, vals):
        ax.text(v + (off if v > 0 else -off), b.get_y() + b.get_height() / 2, pct_text(v), va="center",
                ha="left" if v > 0 else "right", color=WHITE, fontsize=12.5, weight="bold")
    ax.axvline(0, color=DGREY, lw=1.2, zorder=2)
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels([E(n) for n in names])
    ax.tick_params(axis="y", labelsize=10, colors=GREY, length=0)
    fig.add_artist(plt.Line2D([0.500, 0.500], [0.135, 0.255], color=DGREY, lw=1))
    yy = 0.228
    for i, t in enumerate(sb.get("lines", [])[:3], 1):
        if len(t) > 95:
            warn(f"Scoreboard line is long ({len(t)}): {t[:40]}...")
        fig.text(0.520, yy, str(i), color=LIME, fontsize=12, weight="bold")
        fig.text(0.538, yy, E(t), color=WHITE, fontsize=10.5)
        yy -= 0.040
    footer(fig, d)


LAYOUTS = {"tour": layout_tour, "headlines": layout_headlines, "weekly": layout_weekly}


def main():
    ap = argparse.ArgumentParser(description="Render a CommoHedge image from JSON data.")
    ap.add_argument("--layout", required=True, choices=sorted(LAYOUTS))
    ap.add_argument("--data", required=True, help="path to the JSON data file")
    ap.add_argument("--out", required=True, help="output PNG path")
    a = ap.parse_args()
    with open(a.data, encoding="utf-8") as f:
        data = json.load(f)
    setup_fonts()
    fig = plt.figure(figsize=(16, 9), dpi=100, facecolor=NAVY)
    LAYOUTS[a.layout](fig, data)
    fig.savefig(a.out, facecolor=NAVY, dpi=100)
    print("saved", a.out)
    for w in WARNINGS:
        print("WARNING:", w)


if __name__ == "__main__":
    sys.exit(main())
