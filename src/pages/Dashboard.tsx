import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, subDays, startOfDay } from "date-fns";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useSignedImage } from "@/hooks/useSignedImage";
import { useLinkedInTargets } from "@/hooks/useLinkedInTargets";
import { POST_STATUS_LABELS, POST_STATUS_BADGE } from "@/lib/publishStatus";

const Thumb = ({ url }: { url: string }) => {
  const signed = useSignedImage(url);
  if (!signed) {
    return (
      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-primary/70" />
      </div>
    );
  }
  return <img src={signed} alt="" className="h-10 w-10 rounded-lg object-cover" />;
};
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, Send, Eye, Sparkles, BarChart3, Clock, CheckCircle2,
  AlertTriangle, Calendar, Plus, FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  draft: "hsl(var(--muted-foreground))",
  ready: "hsl(var(--primary))",
  scheduled: "hsl(var(--accent))",
  queued: "hsl(38 92% 50%)",
  processing: "hsl(217 91% 60%)",
  retrying: "hsl(25 95% 53%)",
  published: "hsl(var(--success))",
  failed: "hsl(var(--destructive))",
  generating: "hsl(var(--accent))",
};

const statusBadge = POST_STATUS_BADGE;

const Dashboard = () => {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { targets } = useLinkedInTargets();
  const linkedInConnected = targets.some((t) => t.status === "connected");

  const { data: jobs } = useQuery({
    queryKey: ["publication_jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publication_jobs")
        .select("id, post_id, target_id, schedule_id, status, attempt_count, scheduled_for, started_at, completed_at, linkedin_post_urn, error_code, error_message, last_attempt_at, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = posts?.length || 0;
    const published = posts?.filter((p) => p.status === "published").length || 0;
    const scheduled = posts?.filter((p) => ["scheduled", "queued"].includes(p.status)).length || 0;
    const drafts = posts?.filter((p) => ["draft", "ready"].includes(p.status)).length || 0;
    const failed = posts?.filter((p) => p.status === "failed").length || 0;
    const processing = posts?.filter((p) => ["processing", "retrying", "generating"].includes(p.status)).length || 0;
    const successRate = total ? Math.round((published / total) * 100) : 0;

    // Last 14 days activity
    const days = Array.from({ length: 14 }).map((_, i) => {
      const d = startOfDay(subDays(new Date(), 13 - i));
      const next = new Date(d.getTime() + 86400000);
      const dayPosts = posts?.filter((p) => {
        const c = new Date(p.created_at);
        return c >= d && c < next;
      }) || [];
      return {
        date: format(d, "dd MMM"),
        created: dayPosts.length,
        published: dayPosts.filter((p) => p.status === "published").length,
      };
    });

    const breakdown = ["draft", "ready", "scheduled", "queued", "processing", "retrying", "published", "failed"].map((s) => ({
      name: s,
      value: posts?.filter((p) => p.status === s).length || 0,
    })).filter((d) => d.value > 0);

    return { total, published, scheduled, drafts, failed, processing, successRate, days, breakdown };
  }, [posts]);

  const upcoming = posts?.filter((p) => ["scheduled", "queued", "processing", "retrying"].includes(p.status)).slice(0, 5) || [];
  const recent = posts?.slice(0, 6) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in-up">
      {!linkedInConnected && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/10">
          <CardContent className="p-4 flex items-center gap-3 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <p className="text-sm flex-1 min-w-[220px]">
              Ton compte LinkedIn n'est pas connecté. Configure tes identifiants pour publier tes posts.
            </p>
            <Button asChild size="sm" variant="outline" className="border-amber-500/50 hover:bg-amber-500/20">
              <Link to="/settings#linkedin-app">Configurer LinkedIn</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between mb-10">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Analytics</div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Tes <span className="text-gradient">performances</span>
          </h1>
          <p className="text-muted-foreground mt-2">Suivi, KPIs et historique de tes publications LinkedIn.</p>
        </div>
        <Button asChild className="bg-gradient-to-r from-primary to-accent text-white glow-primary">
          <Link to="/composer"><Plus className="h-4 w-4" /> Nouveau post</Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: "Total", value: stats.total, icon: FileText, color: "text-blue-400", bg: "from-blue-500/20 to-cyan-400/10" },
          { label: "Publiés", value: stats.published, icon: CheckCircle2, color: "text-emerald-400", bg: "from-emerald-500/20 to-teal-400/10" },
          { label: "Programmés / file", value: stats.scheduled, icon: Calendar, color: "text-purple-400", bg: "from-purple-500/20 to-pink-400/10" },
          { label: "En cours", value: stats.processing, icon: Clock, color: "text-sky-400", bg: "from-sky-500/20 to-blue-400/10" },
          { label: "Brouillons", value: stats.drafts, icon: Clock, color: "text-amber-400", bg: "from-amber-500/20 to-orange-400/10" },
          { label: "Taux succès", value: `${stats.successRate}%`, icon: BarChart3, color: "text-primary", bg: "from-primary/20 to-accent/10" },
        ].map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border/50 bg-card/60 backdrop-blur-xl">
            <div className={`absolute inset-0 bg-gradient-to-br ${s.bg} opacity-50`} />
            <CardContent className="relative p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-background/40 backdrop-blur border border-border/40 flex items-center justify-center">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-semibold tracking-tight">{s.value}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur-xl">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base">Activité — 14 derniers jours</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.days}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="created" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={2} />
                <Area type="monotone" dataKey="published" stroke="hsl(var(--accent))" fill="url(#g2)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base">Répartition par statut</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {stats.breakdown.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={stats.breakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {stats.breakdown.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">Aucune donnée</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming + Recent */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-accent" /> À venir
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {upcoming.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">Aucun post programmé.</div>
            ) : (
              <div className="space-y-2">
                {upcoming.map((p) => (
                  <Link key={p.id} to={`/post/${p.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-background/40 transition">
                    <div className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center">
                      <Calendar className="h-4 w-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.scheduled_at ? format(new Date(p.scheduled_at), "PPp") : "—"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xl">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Historique récent
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {recent.length === 0 ? (
              <div className="text-center py-10">
                <Sparkles className="h-6 w-6 text-primary/70 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucun post pour l'instant.</p>
                <Button asChild size="sm" className="mt-3">
                  <Link to="/composer">Créer le premier</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((p) => (
                  <Link key={p.id} to={`/post/${p.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-background/40 transition">
                    {p.image_url ? (
                      <Thumb url={p.image_url} />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <Sparkles className="h-4 w-4 text-primary/70" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(p.created_at), "PP")}
                      </p>
                    </div>
                    <Badge className={cn("capitalize border-0 text-xs", statusBadge[p.status] || statusBadge.draft)} variant="secondary">
                      {p.status === "published" && !p.linkedin_post_id ? "En attente confirmation" : (POST_STATUS_LABELS[p.status] || p.status)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {!!jobs?.length && (
        <Card className="mt-6 border-border/50 bg-card/60 backdrop-blur-xl">
          <CardHeader className="border-b border-border/40">
            <CardTitle className="text-base">Jobs de publication</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            {jobs.slice(0, 12).map((j) => {
              const targetName = targets.find((t) => t.id === j.target_id)?.name || "—";
              const post = posts?.find((p) => p.id === j.post_id);
              return (
                <div key={j.id} className="flex items-center gap-3 text-sm py-2 border-b border-border/40 last:border-0">
                  <Badge className={cn("border-0 text-xs", statusBadge[j.status === "success" ? "published" : j.status] || statusBadge.draft)} variant="secondary">
                    {j.status}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{targetName} · {post?.title || "Post"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {j.linkedin_post_urn || j.error_message || j.error_code || "—"}
                      {j.attempt_count ? ` · ${j.attempt_count} essai(s)` : ""}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {j.completed_at || j.started_at || j.scheduled_for
                      ? format(new Date(j.completed_at || j.started_at || j.scheduled_for || j.created_at), "dd MMM HH:mm")
                      : "—"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {stats.failed > 0 && (
        <Card className="mt-6 border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm">
              {stats.failed} publication{stats.failed > 1 ? "s" : ""} en échec. Réessaie depuis le détail du post.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
