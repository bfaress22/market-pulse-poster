import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Palette, Type, Layout, Image as ImageIcon,
  X, Plus, Star, Save, ArrowRight, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type ImagePrefs, DEFAULT_PREFS, FAV_KEY,
  loadPrefs, savePrefs, loadPresets, savePresets, type Preset,
} from "@/lib/imagePrefs";

const STYLES = [
  { v: "modern editorial, clean composition, premium feel", label: "Éditorial" },
  { v: "minimalist flat design, generous whitespace, geometric", label: "Minimaliste" },
  { v: "3D render, soft lighting, glossy materials, depth", label: "3D" },
  { v: "professional photography, natural lighting, shallow depth of field", label: "Photo" },
  { v: "vibrant gradient illustration, abstract shapes, dynamic", label: "Gradient abstrait" },
  { v: "isometric illustration, technical, detailed line art", label: "Isométrique" },
  { v: "bold magazine cover, high contrast, strong typography", label: "Magazine" },
  { v: "hand-drawn sketch, organic lines, paper texture", label: "Sketch" },
];

const MOODS = [
  { v: "professional and confident", label: "Pro & confiant" },
  { v: "energetic and bold", label: "Énergique" },
  { v: "calm and minimalist", label: "Calme" },
  { v: "playful and friendly", label: "Friendly" },
  { v: "luxurious and premium", label: "Luxe" },
  { v: "innovative and futuristic", label: "Futuriste" },
];

const RATIOS = [
  { v: "1:1 square, perfect for LinkedIn feed", label: "1:1 Carré", css: "aspect-square" },
  { v: "16:9 landscape, banner format", label: "16:9 Bannière", css: "aspect-video" },
  { v: "4:5 portrait, mobile-optimized", label: "4:5 Portrait", css: "aspect-[4/5]" },
];

const POSITIONS = [
  ["top-left", "top-center", "top-right"],
  ["center-left", "center", "center-right"],
  ["bottom-left", "bottom-center", "bottom-right"],
];

const PRESET_PALETTES = [
  { name: "CommoHedge", colors: ["#0C1322", "#A6FF00", "#FFFFFF", "#8FA0B5"] },
  { name: "LinkedIn", colors: ["#0A66C2", "#FFFFFF", "#1D2226"] },
  { name: "Sunset", colors: ["#FF6B6B", "#FFD93D", "#1A1A2E"] },
  { name: "Forest", colors: ["#2D5016", "#A4C639", "#F4F4F4"] },
  { name: "Ocean", colors: ["#0077B6", "#90E0EF", "#03045E"] },
  { name: "Mono", colors: ["#000000", "#FFFFFF", "#888888"] },
];

const ImageStudio = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState<ImagePrefs>(DEFAULT_PREFS);
  const [textEnabled, setTextEnabled] = useState(false);
  const [wordmarkEnabled, setWordmarkEnabled] = useState(false);
  const [newColor, setNewColor] = useState("#3B82F6");
  const [favorites, setFavorites] = useState<{ name: string; colors: string[] }[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");

  // Load
  useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    setTextEnabled(!!p.textOverlay);
    setWordmarkEnabled(!!p.wordmark);
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch { /* noop */ }
    setPresets(loadPresets());
  }, []);

  // Auto-save on change
  useEffect(() => {
    const final: ImagePrefs = {
      ...prefs,
      textOverlay: textEnabled && prefs.textOverlay?.text ? prefs.textOverlay : undefined,
      wordmark: wordmarkEnabled && prefs.wordmark?.text ? prefs.wordmark : undefined,
    };
    savePrefs(final);
  }, [prefs, textEnabled, wordmarkEnabled]);

  const setField = <K extends keyof ImagePrefs>(k: K, v: ImagePrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const saveFavorites = (favs: typeof favorites) => {
    setFavorites(favs);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  };

  const addColor = () => {
    if (prefs.colors.length >= 5) { toast({ title: "Max 5 couleurs", variant: "destructive" }); return; }
    setField("colors", [...prefs.colors, newColor]);
  };

  const saveCurrentPalette = () => {
    const name = `Palette ${favorites.length + 1}`;
    saveFavorites([{ name, colors: [...prefs.colors] }, ...favorites].slice(0, 10));
    toast({ title: "Palette sauvegardée ⭐" });
  };

  const saveAsPreset = () => {
    const name = presetName.trim() || `Préréglage ${presets.length + 1}`;
    const next = [{ name, prefs }, ...presets].slice(0, 12);
    setPresets(next);
    savePresets(next);
    setPresetName("");
    toast({ title: "Préréglage sauvegardé 🎨" });
  };

  const applyPreset = (p: Preset) => {
    setPrefs(p.prefs);
    setTextEnabled(!!p.prefs.textOverlay);
    setWordmarkEnabled(!!p.prefs.wordmark);
    toast({ title: `« ${p.name} » chargé` });
  };

  const deletePreset = (i: number) => {
    const next = presets.filter((_, j) => j !== i);
    setPresets(next);
    savePresets(next);
  };

  const reset = () => {
    setPrefs(DEFAULT_PREFS);
    setTextEnabled(false);
    setWordmarkEnabled(false);
    toast({ title: "Préférences réinitialisées" });
  };

  const previewRatioCss = RATIOS.find((r) => r.v === prefs.aspectRatio)?.css || "aspect-square";

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Image Studio</div>
        <h1 className="text-4xl font-semibold tracking-tight">
          Tes <span className="text-gradient">préférences visuelles</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure ton style, palette, texte et marque. Le Composer utilisera ces réglages quand il génère ton image.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* LEFT: settings */}
        <div className="space-y-6">
          {/* FORMAT */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Format</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-3 gap-2">
                {RATIOS.map((r) => (
                  <button
                    key={r.v}
                    onClick={() => setField("aspectRatio", r.v)}
                    className={cn(
                      "px-3 py-3 rounded-md text-sm border transition",
                      prefs.aspectRatio === r.v ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 hover:bg-accent border-border/40"
                    )}
                  >{r.label}</button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* STYLE */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Style & ambiance</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Style visuel</Label>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.v}
                      onClick={() => setField("style", s.v)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm border transition",
                        prefs.style === s.v ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 hover:bg-accent border-border/40"
                      )}
                    >{s.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Mood</Label>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.v}
                      onClick={() => setField("mood", m.v)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm border transition",
                        prefs.mood === m.v ? "bg-primary text-primary-foreground border-primary" : "bg-background/40 hover:bg-accent border-border/40"
                      )}
                    >{m.label}</button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* COLORS */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> Palette</CardTitle>
              <Button size="sm" variant="ghost" onClick={saveCurrentPalette} title="Sauvegarder la palette actuelle">
                <Star className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Couleurs ({prefs.colors.length}/5)</Label>
                <div className="flex flex-wrap gap-2">
                  {prefs.colors.map((c, i) => (
                    <div key={i} className="relative group">
                      <input
                        type="color"
                        value={c}
                        onChange={(e) => setField("colors", prefs.colors.map((x, j) => j === i ? e.target.value : x))}
                        className="h-12 w-12 rounded-md border border-border/50 cursor-pointer"
                      />
                      <button
                        onClick={() => setField("colors", prefs.colors.filter((_, j) => j !== i))}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                      ><X className="h-3 w-3" /></button>
                      <span className="block text-[10px] font-mono text-center text-muted-foreground mt-1">{c}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-1">
                    <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-12 w-12 rounded-md border border-dashed border-border cursor-pointer" />
                    <Button size="sm" variant="ghost" onClick={addColor} className="h-6 text-xs"><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Palettes prédéfinies</Label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {PRESET_PALETTES.map((p) => (
                    <button key={p.name} onClick={() => setField("colors", p.colors)} className="border border-border/40 rounded-md p-2 hover:bg-accent transition text-left">
                      <div className="flex gap-1 mb-1">
                        {p.colors.map((c, i) => <div key={i} className="h-4 w-4 rounded" style={{ background: c }} />)}
                      </div>
                      <span className="text-xs">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {favorites.length > 0 && (
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Mes favoris</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {favorites.map((f, i) => (
                      <div key={i} className="relative group">
                        <button onClick={() => setField("colors", f.colors)} className="w-full border border-border/40 rounded-md p-2 hover:bg-accent transition text-left">
                          <div className="flex gap-1 mb-1">
                            {f.colors.map((c, j) => <div key={j} className="h-4 w-4 rounded" style={{ background: c }} />)}
                          </div>
                          <span className="text-xs truncate block">{f.name}</span>
                        </button>
                        <button
                          onClick={() => saveFavorites(favorites.filter((_, j) => j !== i))}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                        ><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TEXT OVERLAY */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4 text-primary" /> Texte intégré</CardTitle>
              <Switch checked={textEnabled} onCheckedChange={setTextEnabled} />
            </CardHeader>
            {textEnabled && (
              <CardContent className="p-5 space-y-4">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Texte par défaut</Label>
                  <Input
                    value={prefs.textOverlay?.text || ""}
                    onChange={(e) => setField("textOverlay", { ...(prefs.textOverlay || { position: "center", weight: "bold", color: "#FFFFFF" }), text: e.target.value })}
                    placeholder={`Ex: "L'IA change tout."`}
                    className="bg-background/40 mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Tu pourras le surcharger dans le Composer pour chaque post.</p>
                </div>

                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Position</Label>
                  <div className="inline-grid grid-cols-3 gap-1 p-2 rounded-md border border-border/40 bg-background/40">
                    {POSITIONS.flat().map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setField("textOverlay", { ...(prefs.textOverlay || { text: "", weight: "bold", color: "#FFFFFF" }), position: pos })}
                        className={cn(
                          "h-9 w-12 rounded transition",
                          prefs.textOverlay?.position === pos ? "bg-primary" : "bg-muted hover:bg-accent"
                        )}
                        title={pos}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Position : <span className="font-mono">{prefs.textOverlay?.position || "center"}</span></p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Style</Label>
                    <Select
                      value={prefs.textOverlay?.weight || "bold"}
                      onValueChange={(v) => setField("textOverlay", { ...(prefs.textOverlay || { text: "", position: "center", color: "#FFFFFF" }), weight: v })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bold">Gras</SelectItem>
                        <SelectItem value="extra-bold display">Display extra-gras</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="light italic serif">Serif italique léger</SelectItem>
                        <SelectItem value="handwritten script">Manuscrit</SelectItem>
                        <SelectItem value="condensed uppercase">Condensé MAJUSCULES</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Couleur</Label>
                    <input
                      type="color"
                      value={prefs.textOverlay?.color || "#FFFFFF"}
                      onChange={(e) => setField("textOverlay", { ...(prefs.textOverlay || { text: "", position: "center", weight: "bold" }), color: e.target.value })}
                      className="mt-1 h-10 w-full rounded-md border border-border/50 cursor-pointer"
                    />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

          {/* WORDMARK + LAYOUT */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2"><Layout className="h-4 w-4 text-primary" /> Marque & marges</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Wordmark / nom de marque</Label>
                <Switch checked={wordmarkEnabled} onCheckedChange={setWordmarkEnabled} />
              </div>
              {wordmarkEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={prefs.wordmark?.text || ""}
                    onChange={(e) => setField("wordmark", { ...(prefs.wordmark || { position: "bottom-center" }), text: e.target.value })}
                    placeholder="ex: TonNom"
                    className="bg-background/40"
                  />
                  <Select
                    value={prefs.wordmark?.position || "bottom-center"}
                    onValueChange={(v) => setField("wordmark", { ...(prefs.wordmark || { text: "" }), position: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITIONS.flat().map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2 pt-2 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Marge basse vide</Label>
                  <span className="text-sm font-mono text-muted-foreground">{prefs.bottomMarginPercent}%</span>
                </div>
                <Slider value={[prefs.bottomMarginPercent]} onValueChange={(v) => setField("bottomMarginPercent", v[0])} min={0} max={25} step={1} />
                <p className="text-[11px] text-muted-foreground">Réserve un espace en bas (utile si tu superposes du texte plus tard).</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: recap + presets */}
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-sm text-muted-foreground">Configuration active</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className={cn("w-full rounded-lg overflow-hidden bg-muted relative flex items-center justify-center", previewRatioCss)}
                style={{
                  background: `linear-gradient(135deg, ${prefs.colors.join(", ")})`,
                }}
              >
                {textEnabled && prefs.textOverlay?.text && (
                  <div
                    className={cn(
                      "absolute px-3 text-center font-bold",
                      prefs.textOverlay.position.includes("top") && "top-3",
                      prefs.textOverlay.position.includes("bottom") && "bottom-3",
                      !prefs.textOverlay.position.includes("top") && !prefs.textOverlay.position.includes("bottom") && "top-1/2 -translate-y-1/2",
                      prefs.textOverlay.position.includes("left") && "left-3 text-left",
                      prefs.textOverlay.position.includes("right") && "right-3 text-right",
                      prefs.textOverlay.position.includes("center") && "left-1/2 -translate-x-1/2",
                    )}
                    style={{ color: prefs.textOverlay.color }}
                  >
                    {prefs.textOverlay.text}
                  </div>
                )}
                {wordmarkEnabled && prefs.wordmark?.text && (
                  <div className="absolute bottom-2 right-3 text-xs opacity-70 text-white">© {prefs.wordmark.text}</div>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline">{RATIOS.find((r) => r.v === prefs.aspectRatio)?.label}</Badge>
                <Badge variant="outline">{STYLES.find((s) => s.v === prefs.style)?.label}</Badge>
                <Badge variant="outline">{MOODS.find((m) => m.v === prefs.mood)?.label}</Badge>
                {textEnabled && prefs.textOverlay?.text && <Badge variant="outline">Texte</Badge>}
                {wordmarkEnabled && prefs.wordmark?.text && <Badge variant="outline">© {prefs.wordmark.text}</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40">
                <Button onClick={() => navigate("/composer")} className="bg-gradient-to-r from-primary to-accent text-white">
                  Aller au Composer <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4" /> Réinitialiser
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                ✓ Préférences sauvegardées automatiquement. Le Composer les appliquera à chaque génération d'image.
              </p>
            </CardContent>
          </Card>

          {/* PRESETS */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-sm flex items-center gap-2"><Save className="h-4 w-4 text-primary" /> Préréglages</CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="ex: Style éditorial"
                  className="bg-background/40"
                />
                <Button onClick={saveAsPreset} variant="outline">
                  <Save className="h-4 w-4" />
                </Button>
              </div>
              {presets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sauvegarde tes configurations pour basculer entre styles.</p>
              ) : (
                <div className="space-y-1.5">
                  {presets.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border border-border/40 rounded-md p-2 hover:bg-accent transition">
                      <button onClick={() => applyPreset(p)} className="text-sm text-left flex-1 truncate">{p.name}</button>
                      <button onClick={() => deletePreset(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ImageStudio;
