import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap, AlertCircle, MailCheck } from "lucide-react";

const frError = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Confirme d'abord ton email (vérifie ta boîte de réception).";
  if (m.includes("already registered") || m.includes("already exists")) return "Un compte existe déjà avec cet email. Connecte-toi.";
  if (m.includes("pwned") || m.includes("weak")) return "Mot de passe trop faible ou compromis. Choisis-en un autre.";
  if (m.includes("rate limit")) return "Trop de tentatives. Réessaie dans quelques minutes.";
  return msg;
};

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const linkedinRedirect = location.state as { linkedinAuthRequired?: boolean; message?: string } | null;

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) toast({ title: "Connexion impossible", description: frError(error.message), variant: "destructive" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Mot de passe trop court", description: "8 caractères minimum.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Les mots de passe ne correspondent pas", variant: "destructive" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: name.trim() || undefined, full_name: name.trim() || undefined },
      },
    });
    setBusy(false);
    if (error) {
      toast({ title: "Inscription impossible", description: frError(error.message), variant: "destructive" });
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      toast({ title: "Compte existant", description: "Un compte existe déjà avec cet email. Connecte-toi.", variant: "destructive" });
      setTab("signin");
      return;
    }
    if (!data.session) setSentTo(email.trim());
  };

  const handleGoogle = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      toast({ title: "Connexion Google impossible", description: error.message, variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">LinkedIn AutoPost</CardTitle>
          <CardDescription>Génère et publie des posts IA sur ta page LinkedIn.</CardDescription>
        </CardHeader>
        <CardContent>
          {linkedinRedirect?.linkedinAuthRequired && (
            <div className="mb-4 p-3 rounded-lg bg-muted border text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{linkedinRedirect.message || "Connecte-toi avant de lier LinkedIn."}</span>
            </div>
          )}

          {sentTo ? (
            <div className="text-center space-y-4 py-4">
              <MailCheck className="h-10 w-10 mx-auto text-primary" />
              <p className="font-medium">Vérifie ta boîte mail</p>
              <p className="text-sm text-muted-foreground">
                Un lien de confirmation a été envoyé à <b>{sentTo}</b>. Clique dessus pour activer ton compte, puis connecte-toi.
              </p>
              <Button variant="outline" className="w-full" onClick={() => { setSentTo(null); setTab("signin"); }}>
                Retour à la connexion
              </Button>
            </div>
          ) : (
            <>
              <Button variant="outline" className="w-full mb-4" onClick={handleGoogle} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continuer avec Google"}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="signin">Connexion</TabsTrigger>
                  <TabsTrigger value="signup">Inscription</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-3 mt-4">
                    <div className="space-y-1">
                      <Label htmlFor="e1">Email</Label>
                      <Input id="e1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p1">Mot de passe</Label>
                      <Input id="p1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-3 mt-4">
                    <div className="space-y-1">
                      <Label htmlFor="n2">Nom</Label>
                      <Input id="n2" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="e2">Email</Label>
                      <Input id="e2" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="p2">Mot de passe (8 caractères min.)</Label>
                      <Input id="p2" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="c2">Confirmer le mot de passe</Label>
                      <Input id="c2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer mon compte"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
