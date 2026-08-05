import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Clock, Languages, ListPlus, Loader2, Play, Trash2, Image as ImageIcon, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LANGUAGES, DEFAULT_LANGUAGE, languageLabel } from "@/lib/languages";
import { useNavigate } from "react-router-dom";
import { useLinkedInTargets } from "@/hooks/useLinkedInTargets";
import TargetSelect from "@/components/TargetSelect";


const STATUS_META: Record<string, { label: string; className: string }> = {
  scheduled_topic: { label: "En attente", className: "bg-primary/15 text-primary border-primary/30" },
  generating: { label: "Génération…", className: "bg-accent/15 text-accent border-accent/30" },
  published: { label: "Publié", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed: { label: "Échec", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

const TopicQueue = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [includeImage, setIncludeImage] = useState(true);
  const [runningId, setRunningId] = useState<string | null>(null);

  const { targets, defaultTarget } = useLinkedInTargets();
  const [targetIds, setTargetIds] = useState<string[]>([]);
  useEffect(() => {
    if (!targetIds.length && defaultTarget) setTargetIds([defaultTarget.id]);
  }, [defaultTarget, targetIds.length]);
  const targetName = (id: string | null) => targets.find((t) => t.id === id)?.name ?? null;


  const { data: topics, isLoading } = useQuery({
    queryKey: ["topic_queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_queue")
        .select("*")
        .eq("user_id", user!.id)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addTopic = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non authentifié");
      if (!subject.trim()) throw new Error("Renseigne un sujet");
      if (!date) throw new Error("Choisis une date de publication");
      const [h, m] = time.split(":").map(Number);
      const when = new Date(date);
      when.setHours(h || 0, m || 0, 0, 0);
      if (when.getTime() < Date.now()) throw new Error("La date doit être dans le futur");
      if (!targetIds.length) throw new Error("Choisis au moins une destination LinkedIn");
      const { error } = await supabase.from("topic_queue").insert({
        user_id: user.id,
        subject: subject.trim(),
        language,
        scheduled_at: when.toISOString(),
        include_image: includeImage,
        status: "scheduled_topic",
        target_ids: targetIds,
      });
      if (error) throw error;
    },

    onSuccess: () => {
      toast({ title: "Sujet ajouté à la file 🗓️", description: "Il sera généré puis publié à l'heure choisie." });
      setSubject("");
      setDate(undefined);
      qc.invalidateQueries({ queryKey: ["topic_queue"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeTopic = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("topic_queue").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Sujet supprimé" });
      qc.invalidateQueries({ queryKey: ["topic_queue"] });
    },
    onError: (e: any) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const runNow = async (id: string) => {
    setRunningId(id);
    try {
      const { data, error } = await supabase.functions.invoke("run-topic-queue", { body: { topic_id: id } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Échec");
      const r = data.results?.[0];
      if (r && !r.ok) throw new Error(r.error || "Échec de publication");
      toast({ title: "Généré et publié 🎉" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setRunningId(null);
      qc.invalidateQueries({ queryKey: ["topic_queue"] });
      qc.invalidateQueries({ queryKey: ["posts"] });
    }
  };

  const pending = (topics ?? []).filter((t: any) => t.status === "scheduled_topic" || t.status === "generating");
  const done = (topics ?? []).filter((t: any) => t.status === "published" || t.status === "failed");

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto animate-fade-in-up">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">File d'attente</div>
        <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
          Sujets en attente & <span className="text-gradient">planification</span>
        </h1>
        <p className="text-muted-foreground mt-2">
          Enregistre des sujets, choisis la langue de rédaction et la date exacte : l'IA génère puis publie automatiquement.
        </p>
      </div>

      <div className="grid lg:grid-cols-[420px_1fr] gap-6">
        {/* ADD */}
        <Card className="border-primary/40 bg-gradient-to-br from-primary/10 via-card/60 to-accent/10 backdrop-blur-xl lg:sticky lg:top-6 lg:self-start">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base flex items-center gap-2">
              <ListPlus className="h-4 w-4 text-primary" /> Ajouter un sujet
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sujet / thème</Label>
              <Textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                rows={3}
                placeholder="Ex : l'impact de la volatilité du cacao sur les stratégies d'achat…"
                className="bg-background/40"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Languages className="h-3 w-3" /> Langue de génération
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="bg-background/40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Date & heure de publication</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start", !date && "text-muted-foreground")}>
                    <CalendarIcon className="h-4 w-4" />
                    {date ? format(date, "PPP", { locale: frLocale }) : "Choisir une date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-background/40" />
            </div>

            <label className="flex items-center justify-between text-sm cursor-pointer">
              <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Générer une image</span>
              <Switch checked={includeImage} onCheckedChange={setIncludeImage} />
            </label>
            <TargetSelect value={targetIds} onChange={setTargetIds} />

            <Button
              onClick={() => addTopic.mutate()}
              disabled={addTopic.isPending || !subject.trim() || !date || !targetIds.length}

              className="w-full bg-gradient-to-r from-primary to-accent text-white glow-primary"
              size="lg"
            >
              {addTopic.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
              Ajouter à la file
            </Button>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Le robot vérifie la file toutes les 5 minutes : à l'heure prévue, le post est rédigé dans la langue choisie puis publié sur LinkedIn.
            </p>
          </CardContent>
        </Card>

        {/* LIST */}
        <div className="space-y-6">
          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> À venir
                <Badge variant="secondary" className="ml-1">{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {isLoading && <div className="p-6 text-sm text-muted-foreground">Chargement…</div>}
              {!isLoading && pending.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">Aucun sujet en attente pour le moment.</div>
              )}
              {pending.map((t: any) => {
                const meta = STATUS_META[t.status] ?? STATUS_META.scheduled_topic;
                return (
                  <div key={t.id} className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm leading-snug">{t.subject}</p>
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                        <Badge variant="outline" className={cn("text-[10px]", meta.className)}>{meta.label}</Badge>
                        <span className="flex items-center gap-1"><CalendarIcon className="h-3 w-3" />
                          {format(new Date(t.scheduled_at), "PPp", { locale: frLocale })}
                        </span>
                        <span className="flex items-center gap-1"><Languages className="h-3 w-3" />{languageLabel(t.language)}</span>
                        {t.include_image && <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" />image</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => runNow(t.id)} disabled={runningId === t.id}>
                        {runningId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeTopic.mutate(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                Historique de la file
                <Badge variant="secondary" className="ml-1">{done.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border/40">
              {done.length === 0 && <div className="p-6 text-sm text-muted-foreground">Rien de traité pour l'instant.</div>}
              {done.map((t: any) => {
                const meta = STATUS_META[t.status] ?? STATUS_META.failed;
                return (
                  <div key={t.id} className="p-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-sm leading-snug truncate">{t.subject}</p>
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                        <Badge variant="outline" className={cn("text-[10px]", meta.className)}>{meta.label}</Badge>
                        <span>{format(new Date(t.scheduled_at), "PPp", { locale: frLocale })}</span>
                        <span className="flex items-center gap-1"><Languages className="h-3 w-3" />{languageLabel(t.language)}</span>
                      </div>
                      {t.error && (
                        <p className="text-[11px] text-destructive flex items-start gap-1">
                          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />{t.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.post_id && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/post/${t.post_id}`)}>Voir</Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => removeTopic.mutate(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TopicQueue;
