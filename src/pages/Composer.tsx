import { useState, useRef, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Wand2, Image as ImageIcon, Upload, Send, Save, Loader2,
  CalendarIcon, X, Type, RefreshCw, Linkedin, Lightbulb, Globe, Hash, Plus, BookMarked,
  Repeat, Clock, Zap,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { loadPrefs } from "@/lib/imagePrefs";

type Mode = "ai" | "manual";

const DAYS = [
  { v: 1, label: "Lun" }, { v: 2, label: "Mar" }, { v: 3, label: "Mer" },
  { v: 4, label: "Jeu" }, { v: 5, label: "Ven" }, { v: 6, label: "Sam" }, { v: 7, label: "Dim" },
];

const Composer = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  // Text
  const [textMode, setTextMode] = useState<Mode>("ai");
  const [textPrompt, setTextPrompt] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");

  // Image
  const [imageMode, setImageMode] = useState<Mode>("ai");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [includeImage, setIncludeImage] = useState(true);

  // Schedule (one-shot)
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");

  // Automation (recurring)
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoName, setAutoName] = useState("");
  const [autoDays, setAutoDays] = useState<number[]>([1, 3, 5]);
  const [autoHour, setAutoHour] = useState(9);
  const [autoMinute, setAutoMinute] = useState(0);
  const [autoTz, setAutoTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris");

  // Eligibility for recurring schedule: must use AI text + (no image OR AI image). Manual text/image = static, can't re-run.
  const canAutomate = textMode === "ai" && textPrompt.trim().length > 0 && (!includeImage || imageMode === "ai");

  // Sources (per-post)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [adhocSources, setAdhocSources] = useState<{ id: string; type: "url" | "keyword" | "idea"; value: string }[]>([]);
  const [newSourceType, setNewSourceType] = useState<"url" | "keyword" | "idea">("idea");
  const [newSourceValue, setNewSourceValue] = useState("");

  const { data: savedSources } = useQuery({
    queryKey: ["content_sources", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_sources")
        .select("*")
        .eq("user_id", user!.id)
        .eq("enabled", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // (Image Studio is now a preferences editor — no image is sent over.)

  const addAdhoc = () => {
    const v = newSourceValue.trim();
    if (!v) return;
    setAdhocSources((p) => [...p, { id: crypto.randomUUID(), type: newSourceType, value: v }]);
    setNewSourceValue("");
  };

  const [busy, setBusy] = useState<string | null>(null);

  const charCount = content.length;
  const scheduledISO = useMemo(() => {
    if (!scheduleEnabled || !scheduleDate) return null;
    const [h, m] = scheduleTime.split(":").map(Number);
    const d = new Date(scheduleDate);
    d.setHours(h || 0, m || 0, 0, 0);
    return d.toISOString();
  }, [scheduleEnabled, scheduleDate, scheduleTime]);

  // ---- AI text ----
  const generateText = useMutation({
    mutationFn: async (mode: "create" | "improve") => {
      setBusy("text");
      const { data, error } = await supabase.functions.invoke("compose-text", {
        body: {
          prompt: textPrompt,
          currentText: mode === "improve" ? content : undefined,
          imageUrl: imageUrl && !imageUrl.startsWith("data:") ? imageUrl : undefined,
          mode,
          savedSourceIds: selectedSourceIds,
          sources: adhocSources.map(({ type, value }) => ({ type, value })),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      return data;
    },
    onSuccess: (d) => {
      setContent(d.content);
      if (!title) setTitle(d.title);
      toast({ title: "Texte généré ✨" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
    onSettled: () => setBusy(null),
  });

  // ---- AI image ----
  const generateImage = useMutation({
    mutationFn: async () => {
      setBusy("image");
      const prefs = loadPrefs();
      const { data, error } = await supabase.functions.invoke("generate-image", {
        body: {
          prompt: imagePrompt || content.substring(0, 300) || "professional LinkedIn illustration",
          inputImageUrl: imageUrl && !imageUrl.startsWith("data:") ? imageUrl : undefined,
          aspectRatio: prefs.aspectRatio,
          style: prefs.style,
          mood: prefs.mood,
          colors: prefs.colors,
          bottomMarginPercent: prefs.bottomMarginPercent,
          textOverlay: prefs.textOverlay,
          wordmark: prefs.wordmark,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed");
      return data.imageUrl as string;
    },
    onSuccess: (url) => {
      setImageUrl(url);
      toast({ title: "Image générée ✨" });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
    onSettled: () => setBusy(null),
  });

  // ---- Manual upload ----
  const uploadImage = async (file: File) => {
    if (!user) return;
    setBusy("upload");
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("post-assets").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("post-assets").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast({ title: "Image téléversée" });
    } catch (e: any) {
      toast({ title: "Erreur upload", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  // ---- Automate (create recurring schedule from current recipe) ----
  const createSchedule = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      if (!textPrompt.trim()) throw new Error("Le prompt IA est requis pour automatiser");
      if (!autoName.trim()) throw new Error("Donne un nom au schedule");
      if (!autoDays.length) throw new Error("Choisis au moins un jour");
      const { error } = await supabase.from("schedules").insert({
        user_id: user.id,
        name: autoName.trim(),
        prompt: textPrompt,
        saved_source_ids: selectedSourceIds,
        adhoc_sources: adhocSources.map(({ type, value }) => ({ type, value })),
        days_of_week: autoDays,
        hour: autoHour,
        minute: autoMinute,
        timezone: autoTz,
        image_mode: includeImage && imageMode === "ai" ? "ai" : "none",
        image_prompt: includeImage && imageMode === "ai" ? (imagePrompt || null) : null,
        enabled: true,
        next_run_at: computeNextRunISO(autoDays, autoHour, autoMinute, autoTz),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Automatisation créée 🎯", description: "Le post sera généré et publié automatiquement." });
      setAutoOpen(false);
      navigate("/schedules");
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ---- Save / Publish / Schedule ----
  const submit = async (action: "draft" | "publish" | "schedule") => {
    if (!user) return;
    if (!content.trim()) {
      toast({ title: "Le contenu est requis", variant: "destructive" });
      return;
    }
    if (action === "schedule" && !scheduledISO) {
      toast({ title: "Choisis une date et une heure", variant: "destructive" });
      return;
    }
    setBusy(action);
    try {
      const status = action === "publish" ? "ready" : action === "schedule" ? "scheduled" : "draft";
      const { data: saved, error } = await supabase.from("posts").insert({
        user_id: user.id,
        title: title || content.slice(0, 60),
        content,
        image_url: includeImage ? imageUrl : null,
        status,
        scheduled_at: action === "schedule" ? scheduledISO : null,
      }).select().single();
      if (error) throw error;

      if (action === "publish") {
        const { data: pub, error: pubErr } = await supabase.functions.invoke("publish-linkedin", {
          body: { postId: saved.id },
        });
        if (pubErr) throw pubErr;
        if (!pub?.success) throw new Error(pub?.error || "Publish failed");
        toast({ title: "Publié sur LinkedIn 🎉" });
      } else if (action === "schedule") {
        toast({ title: "Programmé", description: `Sera publié le ${format(new Date(scheduledISO!), "PPp")}` });
      } else {
        toast({ title: "Brouillon enregistré" });
      }

      queryClient.invalidateQueries({ queryKey: ["posts"] });
      // reset
      setContent(""); setTitle(""); setImageUrl(null); setTextPrompt(""); setImagePrompt("");
      setScheduleEnabled(false); setScheduleDate(undefined);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto animate-fade-in-up">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Composer</div>
        <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
          Crée ton <span className="text-gradient">prochain post</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Trois étapes : nourris l'IA avec des sources, rédige le texte, ajoute l'image. Puis publie ou automatise.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6">
        {/* LEFT: editors */}
        <div className="space-y-6">
          {/* SOURCES block */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">1</span>
                <Lightbulb className="h-4 w-4 text-primary" /> Sources & inspirations
                {(selectedSourceIds.length + adhocSources.length) > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedSourceIds.length + adhocSources.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">
                Ajoute des URLs (scrapées via Firecrawl), des mots-clés (recherche web récente) ou des idées en texte libre.
                L'IA s'en sert comme contexte pour rédiger le post.
              </p>

              {savedSources && savedSources.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <BookMarked className="h-3 w-3" /> Sources enregistrées
                  </Label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {savedSources.map((src: any) => {
                      const checked = selectedSourceIds.includes(src.id);
                      return (
                        <label
                          key={src.id}
                          className={cn(
                            "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition",
                            checked
                              ? "border-primary/60 bg-primary/5"
                              : "border-border/40 bg-background/30 hover:bg-background/50"
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) =>
                              setSelectedSourceIds((prev) =>
                                c ? [...prev, src.id] : prev.filter((id) => id !== src.id)
                              )
                            }
                          />
                          {src.source_type === "url" ? (
                            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="text-xs truncate">{src.label || src.value}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Ajout ponctuel (uniquement pour ce post)
                </Label>
                <div className="flex gap-2">
                  <Tabs value={newSourceType} onValueChange={(v) => setNewSourceType(v as any)}>
                    <TabsList className="h-9">
                      <TabsTrigger value="idea" className="text-xs gap-1"><Lightbulb className="h-3 w-3" />Idée</TabsTrigger>
                      <TabsTrigger value="url" className="text-xs gap-1"><Globe className="h-3 w-3" />URL</TabsTrigger>
                      <TabsTrigger value="keyword" className="text-xs gap-1"><Hash className="h-3 w-3" />Mot-clé</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newSourceValue}
                    onChange={(e) => setNewSourceValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAdhoc(); } }}
                    placeholder={
                      newSourceType === "url"
                        ? "https://exemple.com/article"
                        : newSourceType === "keyword"
                        ? "ex: AI agents 2026"
                        : "ex: parler du parallèle entre design et code…"
                    }
                    className="bg-background/40"
                  />
                  <Button type="button" variant="outline" onClick={addAdhoc} disabled={!newSourceValue.trim()}>
                    <Plus className="h-4 w-4" /> Ajouter
                  </Button>
                </div>

                {adhocSources.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {adhocSources.map((s) => (
                      <Badge
                        key={s.id}
                        variant="secondary"
                        className="gap-1.5 pl-2 pr-1 py-1 max-w-full"
                      >
                        {s.type === "url" ? <Globe className="h-3 w-3" /> : s.type === "keyword" ? <Hash className="h-3 w-3" /> : <Lightbulb className="h-3 w-3" />}
                        <span className="truncate max-w-[260px]">{s.value}</span>
                        <button
                          type="button"
                          onClick={() => setAdhocSources((p) => p.filter((x) => x.id !== s.id))}
                          className="hover:bg-background/60 rounded p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* TEXT block */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">2</span>
                <Type className="h-4 w-4 text-primary" /> Texte du post
              </CardTitle>
              <Tabs value={textMode} onValueChange={(v) => setTextMode(v as Mode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="ai" className="text-xs gap-1"><Sparkles className="h-3 w-3" />IA</TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs gap-1"><Type className="h-3 w-3" />Manuel</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {textMode === "ai" && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sujet / instructions</Label>
                  <Textarea
                    value={textPrompt}
                    onChange={(e) => setTextPrompt(e.target.value)}
                    placeholder="Ex : un retour d'expérience sur le launch d'un nouveau produit SaaS B2B…"
                    rows={3}
                    className="bg-background/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => generateText.mutate("create")}
                      disabled={busy === "text"}
                      className="bg-gradient-to-r from-primary to-accent text-white"
                    >
                      {busy === "text" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                      Générer
                    </Button>
                    {content && (
                      <Button
                        variant="outline"
                        onClick={() => generateText.mutate("improve")}
                        disabled={busy === "text"}
                      >
                        <RefreshCw className="h-4 w-4" /> Améliorer le brouillon
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Contenu</Label>
                  <span className={cn("text-xs", charCount > 3000 ? "text-destructive" : "text-muted-foreground")}>
                    {charCount} / 3000
                  </span>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Écris ton post ici, ou laisse l'IA générer…"
                  rows={12}
                  className="bg-background/40 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Titre interne (optionnel)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pour t'y retrouver dans l'historique" className="bg-background/40" />
              </div>
            </CardContent>
          </Card>

          {/* IMAGE block */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">3</span>
                <ImageIcon className="h-4 w-4 text-primary" /> Image
                <Switch checked={includeImage} onCheckedChange={setIncludeImage} className="ml-2" />
              </CardTitle>
              <Tabs value={imageMode} onValueChange={(v) => setImageMode(v as Mode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="ai" className="text-xs gap-1"><Sparkles className="h-3 w-3" />IA</TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs gap-1"><Upload className="h-3 w-3" />Upload</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            {includeImage && (
              <CardContent className="p-5 space-y-4">
                {imageMode === "ai" ? (
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Prompt image</Label>
                    <Textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="Ex : illustration éditoriale minimaliste, dégradé bleu-violet, abstrait…"
                      rows={2}
                      className="bg-background/40"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Style, palette, texte intégré → définis tes préférences dans{" "}
                      <button onClick={() => navigate("/image-studio")} className="text-primary hover:underline">Image Studio</button>.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => generateImage.mutate()}
                        disabled={busy === "image"}
                        className="bg-gradient-to-r from-primary to-accent text-white"
                      >
                        {busy === "image" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {imageUrl ? "Régénérer" : "Générer l'image"}
                      </Button>
                      {imageUrl && (
                        <Button variant="outline" onClick={() => setImageUrl(null)}>
                          <X className="h-4 w-4" /> Retirer
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy === "upload"}
                      className="w-full border-dashed h-32"
                    >
                      {busy === "upload" ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                        <div className="flex flex-col items-center gap-2">
                          <Upload className="h-5 w-5" />
                          <span className="text-sm">{imageUrl ? "Remplacer l'image" : "Téléverser une image"}</span>
                        </div>
                      )}
                    </Button>
                  </div>
                )}

                {imageUrl && (
                  <div className="rounded-xl overflow-hidden ring-1 ring-border/50 bg-background/30">
                    <img src={imageUrl} alt="preview" className="w-full max-h-80 object-contain" />
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        {/* RIGHT: preview + actions */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Linkedin className="h-4 w-4 text-[#0A66C2]" /> Aperçu LinkedIn
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 bg-white text-neutral-900">
              <div className="p-4 flex items-center gap-3 border-b border-neutral-200">
                <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-white font-semibold">
                  {user?.email?.[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{user?.email?.split("@")[0]}</p>
                  <p className="text-xs text-neutral-500">À l'instant · 🌐</p>
                </div>
              </div>
              <div className="px-4 py-3 text-sm whitespace-pre-wrap min-h-[80px]">
                {content || <span className="text-neutral-400">Ton post apparaîtra ici…</span>}
              </div>
              {includeImage && imageUrl && (
                <div className="border-t border-neutral-200">
                  <img src={imageUrl} alt="" className="w-full max-h-80 object-cover" />
                </div>
              )}
              <div className="px-4 py-2 border-t border-neutral-200 flex gap-6 text-xs text-neutral-500">
                <span>👍 J'aime</span><span>💬 Commenter</span><span>↗ Partager</span>
              </div>
            </CardContent>
          </Card>

          {/* Publish panel */}
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <Send className="h-4 w-4 text-primary" /> Publication
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Schedule toggle */}
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 text-sm">
                  <CalendarIcon className="h-4 w-4 text-primary" /> Programmer
                </Label>
                <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
              </div>
              {scheduleEnabled && (
                <div className="space-y-2 animate-fade-in-up">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start", !scheduleDate && "text-muted-foreground")}>
                        <CalendarIcon className="h-4 w-4" />
                        {scheduleDate ? format(scheduleDate, "PPP") : "Choisir une date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="bg-background/40" />
                </div>
              )}

              {/* Primary actions */}
              <div className="grid gap-2 pt-3 border-t border-border/40">
                {scheduleEnabled ? (
                  <Button
                    onClick={() => submit("schedule")}
                    disabled={!!busy || !content.trim() || !scheduledISO}
                    className="bg-gradient-to-r from-primary to-accent text-white glow-primary"
                    size="lg"
                  >
                    {busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarIcon className="h-4 w-4" />}
                    Programmer
                  </Button>
                ) : (
                  <Button
                    onClick={() => submit("publish")}
                    disabled={!!busy || !content.trim()}
                    className="bg-gradient-to-r from-primary to-accent text-white glow-primary"
                    size="lg"
                  >
                    {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Publier maintenant
                  </Button>
                )}
                <Button
                  onClick={() => submit("draft")}
                  disabled={!!busy || !content.trim()}
                  variant="outline"
                >
                  {busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer en brouillon
                </Button>
              </div>

              {/* Automate */}
              <div className="pt-3 border-t border-border/40">
                <Button
                  onClick={() => { setAutoName(title || textPrompt.slice(0, 40) || "Mon automatisation"); setAutoOpen(true); }}
                  disabled={!canAutomate}
                  variant="outline"
                  className="w-full border-dashed"
                  title={canAutomate ? "" : "Active le mode IA pour le texte (et l'image si activée) et renseigne un prompt"}
                >
                  <Repeat className="h-4 w-4" />
                  Automatiser (récurrent)
                </Button>
                {!canAutomate && (
                  <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                    Pour automatiser : texte en mode IA + prompt. Image (si activée) en mode IA aussi.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Automation dialog */}
      <Dialog open={autoOpen} onOpenChange={setAutoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Repeat className="h-5 w-5 text-primary" /> Automatiser cette recette</DialogTitle>
            <DialogDescription>
              Le système re-générera et publiera un nouveau post à chaque exécution, en utilisant le prompt et les sources actuels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nom</Label>
              <Input value={autoName} onChange={(e) => setAutoName(e.target.value)} placeholder="Ex: Veille IA hebdo" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">Jours</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map((d) => {
                  const active = autoDays.includes(d.v);
                  return (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => setAutoDays((cur) => active ? cur.filter((x) => x !== d.v) : [...cur, d.v].sort())}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm border transition",
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"
                      )}
                    >{d.label}</button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Heure</Label>
                <Input type="number" min={0} max={23} value={autoHour}
                  onChange={(e) => setAutoHour(Math.min(23, Math.max(0, +e.target.value || 0)))} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Minute</Label>
                <Input type="number" min={0} max={59} value={autoMinute}
                  onChange={(e) => setAutoMinute(Math.min(59, Math.max(0, +e.target.value || 0)))} />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Timezone</Label>
                <Select value={autoTz} onValueChange={setAutoTz}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Europe/Paris","Europe/London","Europe/Berlin","Europe/Madrid","America/New_York","America/Los_Angeles","Asia/Tokyo","Asia/Dubai","UTC"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md border border-border/50 bg-background/40 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-3 w-3" /> Récapitulatif</div>
              <p>• Texte : IA — prompt actuel</p>
              <p>• Image : {includeImage && imageMode === "ai" ? "générée par IA à chaque run" : "aucune"}</p>
              <p>• Sources : {selectedSourceIds.length + adhocSources.length} liée(s)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAutoOpen(false)}>Annuler</Button>
            <Button
              onClick={() => createSchedule.mutate()}
              disabled={createSchedule.isPending || !autoName.trim() || !autoDays.length}
              className="bg-gradient-to-r from-primary to-accent text-white"
            >
              {createSchedule.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />}
              Créer l'automatisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Mirror server-side computeNextRun
function computeNextRunISO(days: number[], hour: number, minute: number, tz: string): string {
  const now = new Date();
  for (let i = 0; i < 14; i++) {
    const c = new Date(now.getTime() + i * 86400000);
    const wdName = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(c);
    const wdMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    if (!days.includes(wdMap[wdName])) continue;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(c);
    const [y, m, d] = parts.split("-").map(Number);
    const local = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
    const asUTC = new Date(local + "Z").getTime();
    const tzString = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(asUTC));
    const mm = tzString.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
    let offsetMin = 0;
    if (mm) {
      const tzAsUTC = Date.UTC(+mm[3], +mm[1] - 1, +mm[2], +mm[4], +mm[5]);
      offsetMin = (asUTC - tzAsUTC) / 60000;
    }
    const target = new Date(asUTC + offsetMin * 60000);
    if (target.getTime() > now.getTime()) return target.toISOString();
  }
  return new Date(now.getTime() + 86400000).toISOString();
}

export default Composer;
