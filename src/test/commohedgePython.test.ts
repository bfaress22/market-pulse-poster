import { describe, expect, it } from "vitest";
import { looksLikeCommoHedgePython, stripPythonFences } from "@/lib/commohedge-chart/runPython";

describe("CommoHedge Python helpers", () => {
  it("strips markdown fences", () => {
    const raw = "```python\nimport matplotlib.pyplot as plt\nplt.savefig(OUT)\n```";
    expect(stripPythonFences(raw)).toContain("import matplotlib");
    expect(stripPythonFences(raw)).not.toContain("```");
  });

  it("detects a plausible script", () => {
    expect(looksLikeCommoHedgePython("short")).toBe(false);
    expect(
      looksLikeCommoHedgePython(
        "import matplotlib.pyplot as plt\n" +
          "fig, ax = plt.subplots(figsize=(16, 9))\n" +
          "ax.set_facecolor(NAVY)\n" +
          "plt.savefig(OUT, dpi=100, facecolor=NAVY)\n",
      ),
    ).toBe(true);
  });
});
