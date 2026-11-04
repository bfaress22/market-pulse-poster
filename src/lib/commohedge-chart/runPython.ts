/**
 * Run AI-generated CommoHedge matplotlib scripts in the browser (Pyodide).
 * make_image.py is brand inspiration only — each analysis ships its own script.
 */

let pyodideReady: Promise<any> | null = null;

async function getPyodide() {
  if (!pyodideReady) {
    pyodideReady = (async () => {
      const { loadPyodide } = await import("pyodide");
      const py = await loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
      });
      await py.loadPackage("matplotlib");
      return py;
    })();
  }
  return pyodideReady;
}

/** Strip markdown fences the model sometimes wraps around the script. */
export function stripPythonFences(raw: string): string {
  let s = raw.trim();
  if (/^```/m.test(s)) {
    s = s.replace(/^```(?:python|py)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}

export function looksLikeCommoHedgePython(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.trim().length < 80) return false;
  const s = stripPythonFences(raw);
  return /matplotlib|pyplot|plt\.|savefig/i.test(s);
}

/**
 * Soft-normalize AI scripts that save to "out.png" / "chart.png" etc.
 * Prefer OUT; never invent plotting logic.
 */
export function normalizeCommoHedgePython(raw: string): string {
  let s = stripPythonFences(raw);
  // Common hardcoded paths → OUT
  s = s.replace(
    /savefig\s*\(\s*['"][^'"]+\.png['"]/gi,
    "savefig(OUT",
  );
  s = s.replace(
    /fig\.savefig\s*\(\s*['"][^'"]+\.png['"]/gi,
    "fig.savefig(OUT",
  );
  // Ensure a final save to OUT if the script never mentions it
  if (!/\bOUT\b/.test(s) || !/savefig\s*\(\s*OUT/i.test(s)) {
    s += "\n\n# enforced by app runner\nplt.savefig(OUT, dpi=100, facecolor=NAVY)\n";
  }
  return s;
}

/**
 * Execute a self-contained matplotlib script.
 * Injected globals: OUT, NAVY, CARD, LIME, WHITE, GREY, DGREY, RED, CYAN, MID
 * Any savefig call is redirected to OUT; open figures are force-saved as fallback.
 */
export async function renderCommoHedgePythonBlob(code: string): Promise<Blob> {
  const script = normalizeCommoHedgePython(code);
  if (!looksLikeCommoHedgePython(script)) {
    throw new Error("Script Python CommoHedge invalide ou trop court");
  }

  const py = await getPyodide();
  const outPath = "/tmp/commohedge_out.png";

  try {
    py.FS.mkdirTree("/tmp");
  } catch {
    /* exists */
  }
  try {
    py.FS.unlink(outPath);
  } catch {
    /* ignore */
  }

  py.globals.set("USER_SCRIPT", script);
  py.globals.set("OUT_PATH", outPath);

  try {
    await py.runPythonAsync(`
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
import os, glob, shutil, traceback

os.makedirs("/tmp", exist_ok=True)
OUT = OUT_PATH
NAVY, CARD, LIME, WHITE = "#0C1322", "#131D30", "#A6FF00", "#FFFFFF"
GREY, DGREY, RED, CYAN, MID = "#8FA0B5", "#3A4759", "#FF4D5E", "#4DD9E6", "#5C6B80"

# Redirect every savefig to OUT so AI scripts that use "out.png" still work.
_real_plt_savefig = plt.savefig
def _plt_savefig(*args, **kwargs):
    kwargs = dict(kwargs)
    kwargs.setdefault("dpi", 100)
    kwargs.setdefault("facecolor", kwargs.get("facecolor", NAVY))
    return _real_plt_savefig(OUT, **{k: v for k, v in kwargs.items()})
plt.savefig = _plt_savefig

_real_fig_savefig = Figure.savefig
def _fig_savefig(self, fname=None, *args, **kwargs):
    kwargs = dict(kwargs)
    kwargs.setdefault("dpi", 100)
    kwargs.setdefault("facecolor", kwargs.get("facecolor", NAVY))
    return _real_fig_savefig(self, OUT, *args, **kwargs)
Figure.savefig = _fig_savefig

plt.close("all")
ns = {
    "OUT": OUT, "NAVY": NAVY, "CARD": CARD, "LIME": LIME, "WHITE": WHITE,
    "GREY": GREY, "DGREY": DGREY, "RED": RED, "CYAN": CYAN, "MID": MID,
    "plt": plt, "matplotlib": matplotlib, "Figure": Figure,
}
try:
    exec(compile(USER_SCRIPT, "<commohedge>", "exec"), ns, ns)
except Exception:
    raise RuntimeError(traceback.format_exc())

def _ok(path):
    return os.path.exists(path) and os.path.getsize(path) >= 100

# 1) Force-save any still-open figures
if not _ok(OUT):
    for num in list(plt.get_fignums()):
        fig = plt.figure(num)
        try:
            fig.set_size_inches(16, 9)
        except Exception:
            pass
        _real_fig_savefig(fig, OUT, dpi=100, facecolor=NAVY)
        if _ok(OUT):
            break

# 2) Scoop any PNG the script wrote elsewhere
if not _ok(OUT):
    candidates = []
    for pattern in ("*.png", "/tmp/*.png", "/home/pyodide/*.png"):
        candidates.extend(glob.glob(pattern))
    candidates = sorted(
        [p for p in candidates if os.path.isfile(p) and os.path.getsize(p) >= 100],
        key=lambda p: os.path.getsize(p),
        reverse=True,
    )
    if candidates:
        shutil.copyfile(candidates[0], OUT)

if not _ok(OUT):
    raise RuntimeError(
        "Script did not produce a PNG. End with: plt.savefig(OUT, dpi=100, facecolor=NAVY)"
    )
plt.close("all")
`);
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Keep the toast readable — drop the long Pyodide stack when we have our RuntimeError.
    const short = msg.match(/RuntimeError: ([\s\S]+)$/)?.[1] || msg;
    throw new Error(short.slice(0, 400) || "Échec exécution Python");
  }

  const bytes = py.FS.readFile(outPath) as Uint8Array;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "image/png" });
}
