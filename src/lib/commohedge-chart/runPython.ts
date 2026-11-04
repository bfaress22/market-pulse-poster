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
 * Execute a self-contained matplotlib script.
 * Injected globals: OUT, NAVY, CARD, LIME, WHITE, GREY, DGREY, RED, CYAN, MID
 * The script must write a PNG to OUT (typically via plt.savefig(OUT, ...)).
 */
export async function renderCommoHedgePythonBlob(code: string): Promise<Blob> {
  const script = stripPythonFences(code);
  if (!looksLikeCommoHedgePython(script)) {
    throw new Error("Script Python CommoHedge invalide ou trop court");
  }

  const py = await getPyodide();
  const outPath = "/tmp/commohedge_out.png";

  // Reset FS output if a previous run left a file.
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
import traceback

OUT = OUT_PATH
NAVY, CARD, LIME, WHITE = "#0C1322", "#131D30", "#A6FF00", "#FFFFFF"
GREY, DGREY, RED, CYAN, MID = "#8FA0B5", "#3A4759", "#FF4D5E", "#4DD9E6", "#5C6B80"

plt.close("all")
ns = {
    "OUT": OUT, "NAVY": NAVY, "CARD": CARD, "LIME": LIME, "WHITE": WHITE,
    "GREY": GREY, "DGREY": DGREY, "RED": RED, "CYAN": CYAN, "MID": MID,
    "plt": plt, "matplotlib": matplotlib,
}
try:
    exec(compile(USER_SCRIPT, "<commohedge>", "exec"), ns, ns)
except Exception:
    raise RuntimeError(traceback.format_exc())

# If the script never called savefig(OUT), try saving the current figure.
import os
if not os.path.exists(OUT) or os.path.getsize(OUT) < 100:
    fig = plt.gcf()
    if fig is not None and len(fig.get_axes()) > 0:
        fig.set_size_inches(16, 9)
        fig.savefig(OUT, dpi=100, facecolor=NAVY, bbox_inches="tight", pad_inches=0.15)
if not os.path.exists(OUT) or os.path.getsize(OUT) < 100:
    raise RuntimeError("Script did not write a PNG to OUT. Call plt.savefig(OUT, dpi=100, facecolor=NAVY).")
plt.close("all")
`);
  } catch (e: any) {
    const msg = String(e?.message || e);
    throw new Error(msg.slice(0, 500) || "Échec exécution Python");
  }

  const bytes = py.FS.readFile(outPath) as Uint8Array;
  // Copy into a fresh buffer — Pyodide's view can be detached after GC.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "image/png" });
}
