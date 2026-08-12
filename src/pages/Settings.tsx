import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Save, Loader2, Link as LinkIcon, CheckCircle, XCircle,
  AlertTriangle, Plus, Trash2, Globe, Hash, Linkedin, BookMarked, Sparkles, KeyRound, Copy, Check, Building2,
} from "lucide-react";
import { POST_MODELS, IMAGE_MODELS } from "@/lib/ai-models";
import { useLinkedInTargets, targetHealth, HEALTH_META } from "@/hooks/useLinkedInTargets";


type UserSettings = {
  linkedin_client_id: string | null;
  linkedin_client_secret: string | null;
  linkedin_access_token: string | null;
  linkedin_token_expires_at: string | null;
  linkedin_person_urn: string | null;
  linkedin_organization_id: string | null;
  post_model: string;
  image_model: string;
  use_byok: boolean;
  openai_api_key: string | null;
  gemini_api_key: string | null;
  anthropic_api_key: string | null;
  mistral_api_key: string | null;
  groq_api_key: string | null;
  deepseek_api_key: string | null;
  xai_api_key: string | null;
  perplexity_api_key: string | null;
  openrouter_api_key: string | null;
  firecrawl_api_key: string | null;
  tone_instructions: string | null;
};

type ByokProvider = {
  field: keyof UserSettings;
  label: string;
  placeholder: string;
  url: string;
  hint: string;
};

const TEXT_PROVIDERS: ByokProvider[] = [
  { field: "openai_api_key", label: "OpenAI", placeholder: "sk-...", url: "https://platform.openai.com/api-keys", hint: "GPT-5, GPT-5 Mini, GPT-5 Nano, GPT-5.2." },
  { field: "gemini_api_key", label: "Google Gemini", placeholder: "AIza...", url: "https://aistudio.google.com/app/apikey", hint: "Tous Gemini texte + image (2.5/3.x, Nano Banana 1 & 2, Gemini 3 Pro Image)." },
  { field: "anthropic_api_key", label: "Anthropic Claude", placeholder: "sk-ant-...", url: "https://console.anthropic.com/settings/keys", hint: "Claude Opus, Sonnet, Haiku." },
  { field: "mistral_api_key", label: "Mistral AI", placeholder: "...", url: "https://console.mistral.ai/api-keys", hint: "Mistral Large, Medium, Small, Codestral." },
  { field: "groq_api_key", label: "Groq", placeholder: "gsk_...", url: "https://console.groq.com/keys", hint: "Llama 3.x, Mixtral — inférence ultra-rapide." },
  { field: "deepseek_api_key", label: "DeepSeek", placeholder: "sk-...", url: "https://platform.deepseek.com/api_keys", hint: "DeepSeek V3, R1 reasoning." },
  { field: "xai_api_key", label: "xAI Grok", placeholder: "xai-...", url: "https://console.x.ai/", hint: "Grok 2, Grok 4." },
  { field: "perplexity_api_key", label: "Perplexity", placeholder: "pplx-...", url: "https://www.perplexity.ai/settings/api", hint: "Sonar (LLM avec recherche intégrée)." },
  { field: "openrouter_api_key", label: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys", hint: "Routeur unifié vers 200+ modèles (Llama, Qwen, Cohere…)." },
];

const LS_KEY = (uid: string) => `linkedin_app_draft_${uid}`;
const LINKEDIN_OAUTH_STATE_KEY = "linkedin_oauth_state";

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [s, setS] = useState<UserSettings | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [withPages, setWithPages] = useState(false);
  const { targets } = useLinkedInTargets();

  const setDefaultTarget = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("linkedin_targets").update({ is_default: false }).eq("user_id", user!.id);
      const { error } = await supabase.from("linkedin_targets").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linkedin_targets"] });
      toast({ title: "Destination par défaut mise à jour" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const removeTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("linkedin_targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["linkedin_targets"] });
      toast({ title: "Destination supprimée" });
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });


  const [newSource, setNewSource] = useState<{ type: "url" | "keyword"; value: string; label: string }>({
    type: "url", value: "", label: "",
  });
  const redirectUrl = `${window.location.origin}/linkedin/callback`;

  const MISSING_SCOPES_MSG =
    "Échec de connexion : ton application LinkedIn Developer n'a pas encore été approuvée pour gérer les Pages (Community Management API). Décoche l'option ou demande l'accès sur le portail LinkedIn.";

  // Erreur OAuth renvoyée via l'URL (retour LinkedIn sans popup)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error");
    if (!oauthError) return;
    toast({
      title: "Connexion LinkedIn échouée",
      description: oauthError === "missing_company_scopes" ? MISSING_SCOPES_MSG : "L'autorisation LinkedIn a été refusée. Réessaie.",
      variant: "destructive",
    });
    window.history.replaceState({}, "", window.location.pathname);
  }, [toast]);

  // Listen for OAuth popup result
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "linkedin-oauth-result") return;
      setIsConnecting(false);
      localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
      if (event.data.success) {
        qc.invalidateQueries({ queryKey: ["user_settings"] });
        qc.invalidateQueries({ queryKey: ["linkedin_targets"] });
        toast({
          title: "LinkedIn connecté",
          description: event.data.pagesWarning || undefined,
        });
      } else {
        toast({
          title: "Échec de la connexion",
          description:
            event.data.errorCode === "missing_company_scopes"
              ? MISSING_SCOPES_MSG
              : event.data.error || "Erreur OAuth LinkedIn",
          variant: "destructive",
        });
      }

    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [qc, toast]);


  const { isLoading } = useQuery({
    queryKey: ["user_settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      let base = data as UserSettings | null;
      if (!base) {
        const { data: created } = await supabase.from("user_settings").insert({ user_id: user!.id }).select().single();
        base = created as UserSettings;
      }
      // Merge with localStorage draft (draft wins for unsaved LinkedIn app fields)
      try {
        const raw = localStorage.getItem(LS_KEY(user!.id));
        if (raw) {
          const draft = JSON.parse(raw) as Partial<UserSettings>;
          base = {
            ...base,
            linkedin_client_id: draft.linkedin_client_id ?? base.linkedin_client_id,
            linkedin_client_secret: draft.linkedin_client_secret ?? base.linkedin_client_secret,
            linkedin_organization_id: draft.linkedin_organization_id ?? base.linkedin_organization_id,
          };
        }
      } catch { /* ignore */ }
      setS(base);
      return base;
    },
  });

  // Persist LinkedIn app fields to localStorage on change
  useEffect(() => {
    if (!s || !user) return;
    try {
      localStorage.setItem(LS_KEY(user.id), JSON.stringify({
        linkedin_client_id: s.linkedin_client_id,
        linkedin_client_secret: s.linkedin_client_secret,
        linkedin_organization_id: s.linkedin_organization_id,
      }));
    } catch { /* ignore */ }
  }, [s?.linkedin_client_id, s?.linkedin_client_secret, s?.linkedin_organization_id, user, s]);

  const { data: sources } = useQuery({
    queryKey: ["content_sources", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("content_sources").select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!s || !user) return;
      const { error } = await supabase.from("user_settings").update({
        linkedin_client_id: s.linkedin_client_id,
        linkedin_client_secret: s.linkedin_client_secret,
        linkedin_organization_id: s.linkedin_organization_id,
        post_model: s.post_model,
        image_model: s.image_model,
        use_byok: s.use_byok,
        openai_api_key: s.openai_api_key,
        gemini_api_key: s.gemini_api_key,
        anthropic_api_key: s.anthropic_api_key,
        mistral_api_key: s.mistral_api_key,
        groq_api_key: s.groq_api_key,
        deepseek_api_key: s.deepseek_api_key,
        xai_api_key: s.xai_api_key,
        perplexity_api_key: s.perplexity_api_key,
        openrouter_api_key: s.openrouter_api_key,
        firecrawl_api_key: s.firecrawl_api_key,
        tone_instructions: s.tone_instructions,
      }).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Paramètres enregistrés" });
      qc.invalidateQueries({ queryKey: ["user_settings"] });
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const addSource = useMutation({
    mutationFn: async () => {
      if (!user || !newSource.value.trim()) return;
      const { error } = await supabase.from("content_sources").insert({
        user_id: user.id,
        source_type: newSource.type,
        value: newSource.value.trim(),
        label: newSource.label.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewSource({ type: newSource.type, value: "", label: "" });
      qc.invalidateQueries({ queryKey: ["content_sources"] });
    },
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_sources"] }),
  });

  const toggleSource = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("content_sources").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["content_sources"] }),
  });

  const handleConnectLinkedIn = async () => {
    if (!s?.linkedin_client_id || !s?.linkedin_client_secret) {
      toast({ title: "Identifiants requis", description: "Enregistre d'abord ton Client ID & Secret.", variant: "destructive" });
      return;
    }

    // Vérifier explicitement la session Supabase avant d'appeler l'Edge Function
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({
        title: "Connexion requise",
        description: "Tu dois être connecté à ton compte CommoHedge avant de lier LinkedIn.",
        variant: "destructive",
      });
      navigate("/auth", { state: { linkedinAuthRequired: true, message: "Connecte-toi à ton compte avant de lier LinkedIn." } });
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("linkedin-oauth", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action: "get_auth_url", redirectUri: redirectUrl, withPages, requestPageAccess: withPages },
      });
      if (error) {
        // Edge Function a renvoyé une erreur HTTP (ex: 401 non authentifié)
        let body: { error?: string; message?: string; redirectTo?: string } | null = null;
        if (error && typeof error === "object" && "context" in error && error.context && typeof error.context.json === "function") {
          try { body = await error.context.json(); } catch { /* ignore */ }
        }
        if (body?.error === "NOT_AUTHENTICATED") {
          toast({
            title: "Connexion requise",
            description: body.message || "Connecte-toi à ton compte CommoHedge avant de lier LinkedIn.",
            variant: "destructive",
          });
          navigate("/auth", { state: { linkedinAuthRequired: true, message: body.message } });
          setIsConnecting(false);
          return;
        }
        throw error;
      }
      if (!data?.success) throw new Error(data?.message || data?.error || "Impossible de générer l'URL LinkedIn.");
      if (!data.state || typeof data.state !== "string") throw new Error("State OAuth manquant. Réessaie la connexion LinkedIn.");

      localStorage.setItem(LINKEDIN_OAUTH_STATE_KEY, data.state);
      const popup = window.open(data.authUrl, "linkedin-oauth", "popup=yes,width=720,height=820");
      if (!popup) {
        localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
        setIsConnecting(false);
        throw new Error("Popup bloquée. Autorise les popups et réessaie.");
      }
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Échec", variant: "destructive" });
      setIsConnecting(false);
    }
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Copié dans le presse-papiers" });
    } catch {
      toast({ title: "Impossible de copier", variant: "destructive" });
    }
  };

  if (isLoading || !s) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const expiresAt = s.linkedin_token_expires_at ? new Date(s.linkedin_token_expires_at) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;
  const hasLinkedIn = !!(s.linkedin_access_token && s.linkedin_person_urn);
  const isConnected = hasLinkedIn && !isExpired;
  const hasAppCreds = !!(s.linkedin_client_id && s.linkedin_client_secret);

  const sections = [
    { id: "linkedin-app", label: "App LinkedIn", icon: KeyRound },
    { id: "linkedin-targets", label: "Destinations LinkedIn", icon: Linkedin },
    { id: "sources", label: "Sources de contenu", icon: BookMarked },
    { id: "ai-models", label: "IA & BYOK", icon: Sparkles },
  ];

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto animate-fade-in-up">
      {/* HEADER */}
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Paramètres</div>
        <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
          Configure ton <span className="text-gradient">workspace</span>
        </h1>
        <p className="text-muted-foreground mt-2">LinkedIn, sources d'inspiration, modèles IA et clés API — tout au même endroit.</p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        {/* LEFT: section nav */}
        <aside className="hidden lg:block">
          <nav className="sticky top-6 space-y-1">
            {sections.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-card/60 transition"
              >
                <sec.icon className="h-4 w-4" />
                {sec.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* RIGHT: sections */}
        <div className="space-y-6 scroll-smooth">

      {/* LinkedIn App Credentials */}
      <Card id="linkedin-app" className="border-border/50 bg-card/60 backdrop-blur-xl scroll-mt-6">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" /> Identifiants de l'app LinkedIn
            </CardTitle>
            {isConnected ? (
              <Badge className="gap-1.5 bg-green-500/15 text-green-500 border border-green-500/30">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> Connecté
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1.5 border-red-500/40 text-red-500">
                <span className="h-2 w-2 rounded-full bg-red-500" /> Non connecté
              </Badge>
            )}
          </div>
          <CardDescription>
            Crée une app LinkedIn sur{" "}
            <a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline">LinkedIn Developers</a>.
            Ajoute l'URL de redirection ci-dessous dans la configuration OAuth 2.0 de ton app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>URL de redirection</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all">{redirectUrl}</code>
              <Button type="button" variant="outline" size="icon" onClick={copyRedirect} aria-label="Copier l'URL">
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Client ID</Label>
            <Input value={s.linkedin_client_id || ""} onChange={(e) => setS({ ...s, linkedin_client_id: e.target.value })} placeholder="77abc123..." />
          </div>
          <div className="space-y-1">
            <Label>Client Secret</Label>
            <Input type="password" value={s.linkedin_client_secret || ""} onChange={(e) => setS({ ...s, linkedin_client_secret: e.target.value })} placeholder="WPL_AP1..." />
          </div>
          <div className="space-y-1">
            <Label>ID de Page LinkedIn (Organisation) — optionnel</Label>
            <Input value={s.linkedin_organization_id || ""} onChange={(e) => setS({ ...s, linkedin_organization_id: e.target.value })} placeholder="123456789 (laisser vide pour publier sur ton profil)" />
            <p className="text-xs text-muted-foreground">ID numérique uniquement. Publier sur une Page requiert l'approbation LinkedIn MDP de ton app.</p>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-gradient-to-r from-primary to-accent text-white"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* LinkedIn destinations */}
      <Card id="linkedin-targets" className="border-border/50 bg-card/60 backdrop-blur-xl scroll-mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Destinations LinkedIn
            <Badge variant="outline" className="ml-auto">{targets.length} connectée{targets.length > 1 ? "s" : ""}</Badge>
          </CardTitle>
          <CardDescription>
            Connecte plusieurs profils et Pages. Tu choisiras ensuite la destination dans le Composer, la file d'attente et tes automatisations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {targets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune destination pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {targets.map((t) => {
                const health = targetHealth(t);
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/30 p-3">
                    {t.kind === "organization"
                      ? <Building2 className="h-4 w-4 text-primary shrink-0" />
                      : <Linkedin className="h-4 w-4 text-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.kind === "organization" ? "Page LinkedIn" : "Profil personnel"}
                        {t.token_expires_at ? ` · expire le ${new Date(t.token_expires_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={HEALTH_META[health].className}>{HEALTH_META[health].label}</Badge>
                    {t.is_default ? (
                      <Badge className="bg-primary/15 text-primary border border-primary/30">Par défaut</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setDefaultTarget.mutate(t.id)}>Par défaut</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeTarget.mutate(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/30 p-3">
            <Checkbox id="with-pages" checked={withPages} onCheckedChange={(v) => setWithPages(!!v)} className="mt-0.5" />
            <Label htmlFor="with-pages" className="text-sm font-normal leading-snug">
              Demander l'accès aux Pages LinkedIn que j'administre
              <span className="block text-xs text-muted-foreground">
                Nécessite que ton app LinkedIn ait les permissions Community Management approuvées, sinon la connexion échoue.
              </span>
            </Label>
          </div>

          {!hasAppCreds && (
            <p className="text-xs text-amber-500">Renseigne d'abord ton Client ID et Client Secret ci-dessus.</p>
          )}
          <Button onClick={handleConnectLinkedIn} disabled={isConnecting || !hasAppCreds} className="w-full">
            {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
            {targets.length ? "Connecter une autre destination" : "Se connecter avec LinkedIn"}
          </Button>
        </CardContent>
      </Card>


      {/* Content Sources */}
      <Card id="sources" className="border-border/50 bg-card/60 backdrop-blur-xl scroll-mt-6">
        <CardHeader>
          <CardTitle>Sources de contenu</CardTitle>
          <CardDescription>URLs et mots-clés utilisés comme inspiration pour générer tes posts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={newSource.type} onValueChange={(v: "url" | "keyword") => setNewSource({ ...newSource, type: v })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="url">URL</SelectItem>
                <SelectItem value="keyword">Mot-clé</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder={newSource.type === "url" ? "https://exemple.com/actualites" : "IA, fintech, climat..."}
              value={newSource.value}
              onChange={(e) => setNewSource({ ...newSource, value: e.target.value })}
            />
            <Input placeholder="Libellé (optionnel)" value={newSource.label} onChange={(e) => setNewSource({ ...newSource, label: e.target.value })} className="w-40" />
            <Button onClick={() => addSource.mutate()} disabled={!newSource.value.trim()}><Plus className="h-4 w-4" /></Button>
          </div>

          <div className="space-y-2">
            {sources?.length ? sources.map((src) => (
              <div key={src.id} className="flex items-center gap-3 p-3 rounded-lg border">
                {src.source_type === "url" ? <Globe className="h-4 w-4 text-muted-foreground" /> : <Hash className="h-4 w-4 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{src.label || src.value}</p>
                  {src.label && <p className="text-xs text-muted-foreground truncate">{src.value}</p>}
                </div>
                <Switch checked={src.enabled} onCheckedChange={(v) => toggleSource.mutate({ id: src.id, enabled: v })} />
                <Button variant="ghost" size="icon" onClick={() => deleteSource.mutate(src.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-4">Aucune source. Ajoute des URLs ou mots-clés ci-dessus.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* AI Models */}
      <Card id="ai-models" className="border-border/50 bg-card/60 backdrop-blur-xl scroll-mt-6">
        <CardHeader>
          <CardTitle>Modèles IA</CardTitle>
          <CardDescription>Choisis quel modèle utiliser par fonctionnalité.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Modèle de génération de post (texte)</Label>
            <Select value={s.post_model} onValueChange={(v) => setS({ ...s, post_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POST_MODELS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Modèle de génération d'image</Label>
            <Select value={s.image_model} onValueChange={(v) => setS({ ...s, image_model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMAGE_MODELS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ton & instructions (optionnel)</Label>
            <Textarea
              value={s.tone_instructions || ""}
              onChange={(e) => setS({ ...s, tone_instructions: e.target.value })}
              placeholder="Ex : professionnel, incisif, orienté fondateurs SaaS B2B. Termine toujours par une question."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div>
              <Label>Utilise tes propres clés API (BYOK)</Label>
              <p className="text-xs text-muted-foreground">Utilise tes propres clés au lieu de Lovable AI / connecteurs partagés. Tu ne paies que ce que tu consommes chez chaque fournisseur.</p>
            </div>
            <Switch checked={s.use_byok} onCheckedChange={(v) => setS({ ...s, use_byok: v })} />
          </div>
          {s.use_byok && (
            <div className="space-y-4 pl-4 border-l-2 border-primary/30">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Modèles IA (texte & image)</p>
                <div className="space-y-3">
                  {TEXT_PROVIDERS.map((p) => (
                    <div key={p.field as string} className="space-y-1">
                      <Label>Clé API {p.label}</Label>
                      <Input
                        type="password"
                        autoComplete="off"
                        value={(s[p.field] as string | null) || ""}
                        onChange={(e) => setS({ ...s, [p.field]: e.target.value } as UserSettings)}
                        placeholder={p.placeholder}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {p.hint}{" "}
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Récupérer la clé →</a>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Sources de contenu (scraping & recherche)</p>
                <div className="space-y-1">
                  <Label>Clé API Firecrawl</Label>
                  <Input type="password" autoComplete="off" value={s.firecrawl_api_key || ""} onChange={(e) => setS({ ...s, firecrawl_api_key: e.target.value })} placeholder="fc-..." />
                  <p className="text-[11px] text-muted-foreground">
                    Utilisée pour scraper les URLs et faire les recherches web (mots-clés) dans tes Sources.{" "}
                    <a href="https://www.firecrawl.dev/app/api-keys" target="_blank" rel="noreferrer" className="text-primary hover:underline">Récupérer la clé →</a>
                  </p>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground">
                💡 Tu peux ne renseigner que certaines clés. Pour celles qui sont vides, l'app retombe automatiquement sur Lovable AI / connecteurs partagés.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full bg-gradient-to-r from-primary to-accent text-white glow-primary" size="lg">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Enregistrer tous les paramètres
      </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
