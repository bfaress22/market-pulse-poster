import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type LinkedInTarget = {
  id: string;
  user_id: string;
  kind: string;
  urn: string;
  name: string;
  avatar_url: string | null;
  token_expires_at: string | null;
  scopes: string | null;
  is_default: boolean;
  status: string;
  created_at: string;
};

export type TargetHealth = "connected" | "expiring" | "expired";

export const targetHealth = (t: LinkedInTarget): TargetHealth => {
  if (!t.token_expires_at) return t.status === "expired" ? "expired" : "connected";
  const ms = Date.parse(t.token_expires_at) - Date.now();
  if (ms <= 0 || t.status === "expired") return "expired";
  if (ms < 7 * 24 * 60 * 60 * 1000) return "expiring";
  return "connected";
};

export const HEALTH_META: Record<TargetHealth, { label: string; className: string }> = {
  connected: { label: "Connecté", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  expiring: { label: "Expire bientôt", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  expired: { label: "Expiré", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export const useLinkedInTargets = () => {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["linkedin_targets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("linkedin_targets")
        .select("*")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinkedInTarget[];
    },
  });

  const targets = query.data ?? [];
  const defaultTarget = targets.find((t) => t.is_default) ?? targets[0] ?? null;

  return { ...query, targets, defaultTarget };
};
