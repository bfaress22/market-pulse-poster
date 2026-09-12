import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Trash2, Clock, Loader2, CalendarClock, History, Wand2, Linkedin } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useLinkedInTargets } from "@/hooks/useLinkedInTargets";

const DAYS = [
  { v: 1, label: "Lun" }, { v: 2, label: "Mar" }, { v: 3, label: "Mer" },
  { v: 4, label: "Jeu" }, { v: 5, label: "Ven" }, { v: 6, label: "Sam" }, { v: 7, label: "Dim" },
];

type Schedule = {
  id: string;
  name: string;
  prompt: string;
  saved_source_ids: string[];
  adhoc_sources: { type: string; value: string }[];
  days_of_week: number[];
  hour: number;
  minute: number;
  timezone: string;
  image_mode: "none" | "ai";
  target_ids: string[] | null;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

export default function Schedules() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { targets } = useLinkedInTargets();


  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown) as Schedule[];
    },
  });

  const { data: runs } = useQuery({
    queryKey: ["schedule_runs"],
    queryFn: async () => {
      const { data } = await supabase.from("schedule_runs").select("*").order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
    refetchInterval: 15000,
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("schedules").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); toast.success("Supprimé"); },
  });

  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("run-schedules", { body: { schedule_id: id } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Échec");
      const r = data.results?.[0];
      if (r && !r.ok) throw new Error(r.error || "Échec");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule_runs"] });
      const r = data?.results?.[0];
      const per = r?.perTarget as { targetName: string; ok: boolean; urn?: string; error?: string }[] | undefined;
      if (per?.length) {
        const line = per.map((t) => `${t.targetName} ${t.ok ? "✅" : "❌"}`).join(" · ");
        if (per.every((t) => t.ok)) toast.success(line);
        else toast.error(line);
        return;
      }
      toast.success(r?.ok ? "Exécution terminée" : "Exécution partielle");
    },
    onError: (e: any) => toast.error(e?.message || "Échec"),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Schedules</h1>
          <p className="text-muted-foreground mt-1">Gère tes automatisations de publication. Pour en créer une nouvelle, va dans le Composer.</p>
        </div>
        <Button onClick={() => navigate("/composer")} className="gap-2 bg-gradient-to-r from-primary to-accent text-white">
          <Wand2 className="h-4 w-4" /> Créer dans le Composer
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !schedules?.length ? (
        <Card className="p-12 text-center">
          <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium">Aucune automatisation</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Configure ton post dans le Composer (mode IA + sources), puis clique sur <strong>« Automatiser »</strong> pour le rendre récurrent.
          </p>
          <Button onClick={() => navigate("/composer")} className="gap-2">
            <Wand2 className="h-4 w-4" /> Aller au Composer
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {schedules.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-semibold text-lg">{s.name}</h3>
                    <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "Actif" : "Pause"}</Badge>
                    <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />
                      {s.days_of_week.map((d) => DAYS.find((x) => x.v === d)?.label).join(" ")} • {String(s.hour).padStart(2, "0")}:{String(s.minute).padStart(2, "0")} {s.timezone}
                    </Badge>
                    {s.image_mode === "ai" && <Badge variant="outline">+ image IA</Badge>}
                    {(s.target_ids?.length ?? 0) > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Linkedin className="h-3 w-3" />
                        {(s.target_ids ?? []).map((id) => targets.find((t) => t.id === id)?.name).filter(Boolean).join(", ")
                          || `${s.target_ids?.length} destination(s)`}
                      </Badge>
                    )}

                    {(s.saved_source_ids?.length || s.adhoc_sources?.length) ? (
                      <Badge variant="outline">{(s.saved_source_ids?.length || 0) + (s.adhoc_sources?.length || 0)} source(s)</Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{s.prompt}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    {s.next_run_at && <span>Prochain : {format(new Date(s.next_run_at), "dd MMM HH:mm")} UTC · {s.timezone}</span>}
                    {s.last_run_at && <span>Dernier : {format(new Date(s.last_run_at), "dd MMM HH:mm")} UTC</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={s.enabled} onCheckedChange={(v) => toggleEnabled.mutate({ id: s.id, enabled: v })} />
                  <Button size="icon" variant="ghost" disabled={runNow.isPending} onClick={() => runNow.mutate(s.id)} title="Run now">
                    {runNow.isPending && runNow.variables === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { if (confirm("Supprimer cette automatisation ?")) remove.mutate(s.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!!runs?.length && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Historique des exécutions</h2>
          </div>
          <div className="space-y-2">
            {runs.map((r: any) => {
              const sched = schedules?.find((s) => s.id === r.schedule_id);
              return (
                <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant={r.status === "success" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                    <span className="font-medium">{sched?.name || "—"}</span>
                    {r.message && <span className="text-muted-foreground text-xs">{r.message}</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM HH:mm")}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
