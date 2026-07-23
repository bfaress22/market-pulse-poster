import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const mask = (value: string | null | undefined) => {
  if (!value) return "missing";
  if (value.length <= 8) return "present";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};

const readProviderBody = async (res: Response) => {
  const raw = await res.text();
  if (!raw) return { raw: "" };
  try {
    return { raw, parsed: JSON.parse(raw) };
  } catch {
    return { raw };
  }
};

async function getUserId(req: Request, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const auth = req.headers.get("Authorization");
  console.log("[linkedin-oauth] auth header", { present: !!auth, bearer: auth?.startsWith("Bearer ") ?? false });
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.log("[linkedin-oauth] auth getUser failed", { message: error.message });
    return null;
  }
  console.log("[linkedin-oauth] auth getUser success", { userId: mask(data.user?.id) });
  return data.user?.id ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const requestId = crypto.randomUUID();

  try {
    const { action, code, redirectUri, state } = await req.json();
    console.log("[linkedin-oauth] request received", {
      requestId,
      action,
      hasCode: !!code,
      codeLength: typeof code === "string" ? code.length : 0,
      hasState: !!state,
      redirectUri,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (action === "get_auth_url") {
      const userId = await getUserId(req, supabase);
      if (!userId) {
        console.log("[linkedin-oauth] get_auth_url rejected", { requestId, reason: "not_authenticated" });
        return json(401, {
          success: false,
          error: "NOT_AUTHENTICATED",
          message: "Tu dois être connecté à ton compte CommoHedge avant de lier LinkedIn. Redirection vers la page de connexion...",
          redirectTo: "/auth",
        });
      }

      const { data: settings } = await supabase
        .from("user_settings").select("linkedin_client_id").eq("user_id", userId).maybeSingle();
      const clientId = settings?.linkedin_client_id || Deno.env.get("LINKEDIN_CLIENT_ID");
      console.log("[linkedin-oauth] credentials lookup", {
        requestId,
        userId: mask(userId),
        clientIdSource: settings?.linkedin_client_id ? "user_settings" : "env",
        clientId: mask(clientId),
      });
      if (!clientId) {
        return json(400, {
          success: false,
          error: "missing_client_id",
          message: "Set your LinkedIn Client ID in Settings first.",
          requestId,
        });
      }

      const scopes = "openid profile w_member_social email";

      const generatedState = `${userId}.${crypto.randomUUID()}`;
      const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(generatedState)}`;
      console.log("[linkedin-oauth] auth url generated", {
        requestId,
        redirectUri,
        scopes,
        stateUserMatches: generatedState.startsWith(`${userId}.`),
      });
      return json(200, { success: true, authUrl, state: generatedState, requestId });
    }

    if (action === "exchange_code") {
      const userId = await getUserId(req, supabase);
      if (!userId) {
        console.log("[linkedin-oauth] exchange_code rejected", { requestId, reason: "not_authenticated" });
        return json(401, {
          success: false,
          error: "NOT_AUTHENTICATED",
          message: "Tu dois être connecté à ton compte CommoHedge avant de lier LinkedIn. Redirection vers la page de connexion...",
          redirectTo: "/auth",
        });
      }

      if (!code || typeof code !== "string") {
        console.log("[linkedin-oauth] exchange_code rejected", { requestId, reason: "missing_code" });
        return json(400, {
          success: false,
          error: "missing_code",
          message: "Aucun code d'autorisation LinkedIn reçu.",
          requestId,
        });
      }

      if (!state || typeof state !== "string") {
        console.log("[linkedin-oauth] exchange_code rejected", { requestId, reason: "missing_state" });
        return json(400, {
          success: false,
          error: "state_mismatch",
          message: "Le paramètre state LinkedIn est manquant. Relance la connexion.",
          requestId,
        });
      }

      const [stateUserId, nonce] = state.split(".");
      const stateMatchesUser = stateUserId === userId && !!nonce;
      console.log("[linkedin-oauth] state validation", {
        requestId,
        stateUserId: mask(stateUserId),
        currentUserId: mask(userId),
        hasNonce: !!nonce,
        stateMatchesUser,
      });
      if (!stateMatchesUser) {
        return json(400, {
          success: false,
          error: "state_mismatch",
          message: "La validation de sécurité LinkedIn a échoué. Relance la connexion.",
          requestId,
        });
      }

      const { data: settings } = await supabase
        .from("user_settings").select("linkedin_client_id, linkedin_client_secret").eq("user_id", userId).maybeSingle();
      const clientId = settings?.linkedin_client_id || Deno.env.get("LINKEDIN_CLIENT_ID");
      const clientSecret = settings?.linkedin_client_secret || Deno.env.get("LINKEDIN_CLIENT_SECRET");
      console.log("[linkedin-oauth] exchange credentials lookup", {
        requestId,
        clientIdSource: settings?.linkedin_client_id ? "user_settings" : "env",
        hasClientSecret: !!clientSecret,
      });
      if (!clientId || !clientSecret) {
        return json(400, {
          success: false,
          error: "missing_linkedin_credentials",
          message: "LinkedIn app credentials not set.",
          requestId,
        });
      }

      console.log("[linkedin-oauth] token exchange start", { requestId, redirectUri, codeLength: code.length });
      const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code", code, redirect_uri: redirectUri,
          client_id: clientId, client_secret: clientSecret,
        }),
      });
      const tokenBody = await readProviderBody(tokenRes);
      const tokenData = tokenBody.parsed ?? {};
      console.log("[linkedin-oauth] token exchange response", {
        requestId,
        status: tokenRes.status,
        ok: tokenRes.ok,
        providerError: tokenData.error,
        providerMessage: tokenData.error_description,
      });
      if (!tokenRes.ok) {
        console.error("[linkedin-oauth] token exchange error", { requestId, status: tokenRes.status, body: tokenBody.raw });
        return json(400, {
          success: false,
          error: tokenData.error || "linkedin_token_exchange_failed",
          message: tokenData.error_description || tokenBody.raw || "Token exchange failed",
          providerStatus: tokenRes.status,
          providerDetails: tokenData,
          requestId,
        });
      }

      const accessToken = tokenData.access_token as string;
      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

      let personUrn = "";
      console.log("[linkedin-oauth] userinfo request start", { requestId });
      const userinfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log("[linkedin-oauth] userinfo response", { requestId, status: userinfoRes.status, ok: userinfoRes.ok });
      if (userinfoRes.ok) {
        const u = await userinfoRes.json();
        if (u.sub) personUrn = `urn:li:person:${u.sub}`;
      } else {
        const userinfoBody = await readProviderBody(userinfoRes);
        console.error("[linkedin-oauth] userinfo error", { requestId, status: userinfoRes.status, body: userinfoBody.raw });
        return json(400, {
          success: false,
          error: "linkedin_userinfo_failed",
          message: "Impossible de récupérer le profil LinkedIn connecté.",
          providerStatus: userinfoRes.status,
          providerDetails: userinfoBody.parsed ?? userinfoBody.raw,
          requestId,
        });
      }

      const { error: updateError } = await supabase.from("user_settings").update({
        linkedin_access_token: accessToken,
        linkedin_token_expires_at: expiresAt,
        linkedin_person_urn: personUrn || null,
      }).eq("user_id", userId);
      if (updateError) {
        console.error("[linkedin-oauth] settings update failed", { requestId, message: updateError.message });
        return json(500, {
          success: false,
          error: "settings_update_failed",
          message: updateError.message,
          requestId,
        });
      }

      console.log("[linkedin-oauth] exchange_code success", { requestId, personUrn: mask(personUrn), expiresIn: tokenData.expires_in });
      return json(200, { success: true, personUrn, expiresIn: tokenData.expires_in, requestId });
    }

    console.log("[linkedin-oauth] invalid action", { requestId, action });
    return json(400, { success: false, error: "invalid_action", message: "Invalid action", requestId });
  } catch (error) {
    console.error("[linkedin-oauth] unhandled error", { requestId, error });
    return json(500, {
      success: false,
      error: "linkedin_oauth_unhandled_error",
      message: error instanceof Error ? error.message : "Unknown error",
      requestId,
    });
  }
});
