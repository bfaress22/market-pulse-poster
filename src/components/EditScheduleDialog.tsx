import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TargetSelect from "@/components/TargetSelect";
import { computeNextRunISO } from "@/lib/scheduleTime";

const DAYS = [
  { v: 1, label: "Lun" }, { v: 2, label: "Mar" }, { v: 3, label: "Mer" },
  { v: 4, label: "Jeu" }, { v: 5, label: "Ven" }, { v: 6, label: "Sam" }, { v: 7, label: "Dim" },
];

export type EditableSchedule = {
  id: string;
  name: string;
  prompt: string;
  days_of_week: number[];
  hour: number;
  minute: number;
  timezone: string;
  image_mode: "none" | "ai";
  target_ids: string[] | null;
  enabled: boolean;
};

type Props = { schedule: EditableSchedule | null; onClose: () => void };

export default function EditScheduleDialog({ schedule, onClose }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [withImage, setWithImage] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  useEffect(() => {
    if (!schedule) return;
    setName(schedule.name);
    setPrompt(schedule.prompt);
    setDays(schedule.days_of_week ?? []);
    setTime(`${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`);
    setTimezone(schedule.timezone || "Europe/Paris");
    setWithImage(schedule.image_mode === "ai");
    setTargetIds(schedule.target_ids ?? []);
  }, [schedule]);

  const save = useMutation({
    mutationFn: async () => {
      if (!schedule) return;
      if (!name.trim()) throw new Error("Le nom est requis.");
      if (!prompt.trim()) throw new Error("Le prompt est requis.");
      if (!days.length) throw new Error("Choisis au moins un jour.");
      if (!targetIds.length) throw new Error("Choisis au moins une destination.");
      const [h, m] = time.split(":").map(Number);
      const { error } = await supabase
        .from("schedules")
        .update({
          name: name.trim(),
          prompt,
          days_of_week: [...days].sort(),
          hour: h,
          minute: m,
          timezone,
          image_mode: withImage ? "ai" : "none",
          target_ids: targetIds,
          next_run_at: computeNextRunISO(days, h, m, timezone),
        })
        .eq("id", schedule.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      toast.success("Automatisation mise à jour");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Échec de la mise à jour"),
  });

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Dialog open={!!schedule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier l'automatisation</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Prompt</Label>
            <Textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Jours</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <button
                  key={d.v}
                  type="button"
                  onClick={() => toggleDay(d.v)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm border transition",
                    days.includes(d.v) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Heure</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fuseau horaire</Label>
              <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Europe/Paris" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label className="cursor-pointer" htmlFor="sched-img">Générer une image IA</Label>
            <Switch id="sched-img" checked={withImage} onCheckedChange={setWithImage} />
          </div>

          <TargetSelect value={targetIds} onChange={setTargetIds} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
