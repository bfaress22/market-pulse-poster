import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Linkedin, User } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { HEALTH_META, targetHealth, useLinkedInTargets } from "@/hooks/useLinkedInTargets";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  multiple?: boolean;
  className?: string;
};

/** Destination picker used by the Composer, the topic queue and automations. */
const TargetSelect = ({ value, onChange, label = "Publier sur", multiple = true, className }: Props) => {
  const { targets, isLoading } = useLinkedInTargets();

  const toggle = (id: string) => {
    if (!multiple) return onChange([id]);
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Linkedin className="h-3 w-3" /> {label}
        </span>
        {targets.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {value.length || 0} sélectionnée{value.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Chargement des destinations…</p>
      ) : targets.length === 0 ? (
        <p className="text-xs text-amber-500">
          Aucune destination LinkedIn.{" "}
          <Link to="/settings#linkedin-targets" className="underline">Connecte un compte ou une page</Link>.
        </p>
      ) : (
        <div className="space-y-1.5">
          {targets.map((t) => {
            const health = targetHealth(t);
            const selected = value.includes(t.id);
            return (
              <button
                type="button"
                key={t.id}
                onClick={() => toggle(t.id)}
                className={cn(
                  "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
                  selected ? "border-primary/60 bg-primary/10" : "border-border/50 bg-background/30 hover:bg-background/50",
                )}
              >
                <Checkbox checked={selected} className="pointer-events-none" />
                {t.kind === "organization"
                  ? <Building2 className="h-4 w-4 text-primary shrink-0" />
                  : <User className="h-4 w-4 text-primary shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{t.name}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t.kind === "organization" ? "Page LinkedIn" : "Profil personnel"}
                    {t.is_default ? " · par défaut" : ""}
                  </span>
                </span>
                <Badge variant="outline" className={cn("text-[10px] shrink-0", HEALTH_META[health].className)}>
                  {HEALTH_META[health].label}
                </Badge>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TargetSelect;
