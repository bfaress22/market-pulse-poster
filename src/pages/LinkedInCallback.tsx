import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LINKEDIN_OAUTH_STATE_KEY = "linkedin_oauth_state";

const readFunctionError = async (error: unknown) => {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = await context.json();
        if (body?.message) return String(body.message);
        if (body?.error) return String(body.error);
      } catch {
        try {
          const text = await context.text();
          if (text) return text;
        } catch { /* ignore */ }
      }
    }
  }

  return error instanceof Error ? error.message : "Failed to exchange code";
};

const LinkedInCallback = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const notifyParentAndClose = (payload: { success: boolean; error?: string }) => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: "linkedin-oauth-result", ...payload }, window.location.origin);
        window.close();
        return true;
      }

      return false;
    };

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
      notifyParentAndClose({
        success: false,
        error: params.get("error_description") || "Authorization was denied.",
      });
      setStatus("error");
      setMessage(params.get("error_description") || "Authorization was denied.");
      return;
    }

    if (!code) {
      localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
      notifyParentAndClose({ success: false, error: "No authorization code received." });
      setStatus("error");
      setMessage("No authorization code received.");
      return;
    }

    if (!state) {
      localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
      notifyParentAndClose({ success: false, error: "Le paramètre state LinkedIn est manquant. Relance la connexion." });
      setStatus("error");
      setMessage("Le paramètre state LinkedIn est manquant. Relance la connexion.");
      return;
    }

    const storedState = localStorage.getItem(LINKEDIN_OAUTH_STATE_KEY);
    if (!storedState || storedState !== state) {
      localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
      notifyParentAndClose({ success: false, error: "La validation de sécurité LinkedIn a échoué. Relance la connexion." });
      setStatus("error");
      setMessage("La validation de sécurité LinkedIn a échoué. Relance la connexion.");
      return;
    }

    const exchangeCode = async () => {
      try {
        // Wait for the session to be restored from localStorage before invoking
        // the edge function (popup window may not have it ready instantly).
        let { data: sessionData } = await supabase.auth.getSession();
        for (let i = 0; i < 20 && !sessionData.session; i++) {
          await new Promise((r) => setTimeout(r, 100));
          ({ data: sessionData } = await supabase.auth.getSession());
        }
        if (!sessionData.session) {
          throw new Error("You are not signed in. Please log in and reconnect LinkedIn from Settings.");
        }

        const { data, error: fnError } = await supabase.functions.invoke("linkedin-oauth", {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          body: {
            action: "exchange_code",
            code,
            state,
            redirectUri: `${window.location.origin}/linkedin/callback`,
          },
        });

        if (fnError) throw new Error(await readFunctionError(fnError));
        if (!data.success) throw new Error(data.message || data.error);

        localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);

        if (notifyParentAndClose({ success: true })) {
          return;
        }

        setStatus("success");
        setMessage(`Connected successfully! Person URN: ${data.personUrn}`);
        
        // Redirect to settings after 2 seconds
        setTimeout(() => navigate("/settings"), 2000);
      } catch (err) {
        localStorage.removeItem(LINKEDIN_OAUTH_STATE_KEY);
        notifyParentAndClose({
          success: false,
          error: err instanceof Error ? err.message : "Failed to exchange code",
        });
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Failed to exchange code");
      }
    };

    exchangeCode();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-lg font-medium">Connecting to LinkedIn...</p>
              <p className="text-sm text-muted-foreground">Exchanging authorization code for access token</p>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-medium">LinkedIn Connected!</p>
              <p className="text-sm text-muted-foreground">{message}</p>
              <p className="text-xs text-muted-foreground">Redirecting to settings...</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-lg font-medium">Connection Failed</p>
              <p className="text-sm text-muted-foreground">{message}</p>
              <Button onClick={() => navigate("/settings")} className="mt-4">
                Back to Settings
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default LinkedInCallback;
