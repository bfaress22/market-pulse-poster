import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Supabase = ReturnType<typeof createClient>;

export type Caller =
  | { kind: "cron" }
  | { kind: "user"; userId: string };

export async function authorizeCronOrUser(req: Request, supabase: Supabase): Promise<Caller | null> {
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  const envSecret = Deno.env.get("CRON_SECRET") || "";
  if (envSecret && (cronHeader === envSecret || bearer === envSecret)) {
    return { kind: "cron" };
  }

  const { data: cfg } = await supabase.from("automation_config").select("cron_secret").eq("id", 1).maybeSingle();
  const stored = (cfg as { cron_secret?: string } | null)?.cron_secret || "";
  if (stored && (cronHeader === stored || bearer === stored)) {
    return { kind: "cron" };
  }

  if (bearer && bearer !== envSecret && bearer !== stored) {
    const { data, error } = await supabase.auth.getUser(bearer);
    if (!error && data.user?.id) return { kind: "user", userId: data.user.id };
  }
  return null;
}

export async function requireUser(req: Request, supabase: Supabase): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user?.id) return null;
  return data.user.id;
}
