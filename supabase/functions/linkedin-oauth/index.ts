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
    const payload = await req.json();
    const { action, code, redirectUri, state } = payload;
    const withPages = payload.withPages === true || payload.requestPageAccess === true;
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
          message: "Tu dois être connecté avant de lier LinkedIn. Redirection vers la page de connexion...",
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

      // Page scopes are only requested when the user says their LinkedIn app has them
      // (they require LinkedIn's Community Management / MDP approval).
      const scopes = withPages
        ? "openid profile email w_member_social w_organization_social r_organization_social rw_organization_admin"
        : "openid profile w_member_social email";


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
          message: "Tu dois être connecté avant de lier LinkedIn. Redirection vers la page de connexion...",
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
      const refreshToken = (tokenData.refresh_token as string | undefined) || null;
      const expiresAt = tokenData.expires_in
        ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
        : null;

      let personUrn = "";
      let personName = "Profil LinkedIn";
      let personAvatar: string | null = null;
      console.log("[linkedin-oauth] userinfo request start", { requestId });
      const userinfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      console.log("[linkedin-oauth] userinfo response", { requestId, status: userinfoRes.status, ok: userinfoRes.ok });
      if (userinfoRes.ok) {
        const u = await userinfoRes.json();
        if (u.sub) personUrn = `urn:li:person:${u.sub}`;
        personName = u.name || [u.given_name, u.family_name].filter(Boolean).join(" ") || personName;
        personAvatar = u.picture ?? null;
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

      const grantedScopes = (tokenData.scope as string | undefined) || "";

      // Upsert one destination per reachable LinkedIn identity
      const targetRows: Array<Record<string, unknown>> = [];
      if (personUrn) {
        targetRows.push({
          user_id: userId, kind: "person", urn: personUrn, name: personName,
          avatar_url: personAvatar, access_token: accessToken, refresh_token: refreshToken,
          token_expires_at: expiresAt, scopes: grantedScopes, status: "connected",
        });
      }

      // Company pages the member administers (requires org scopes on the LinkedIn app)
      let pagesError: string | null = null;
      if (grantedScopes.includes("organization")) {
        try {
          const headers = {
            Authorization: `Bearer ${accessToken}`,
            "X-Restli-Protocol-Version": "2.0.0",
            "Linkedin-Version": "202608",
          };
          const urls = [
            "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED",
            "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&state=APPROVED&projection=(elements*(role,state,organization~(id,localizedName)))",
          ];
          let acl: { elements?: any[] } | null = null;
          let lastStatus = 0;
          let lastBody = "";
          for (const url of urls) {
            const aclRes = await fetch(url, { headers });
            lastStatus = aclRes.status;
            if (aclRes.ok) {
              acl = await aclRes.json();
              break;
            }
            lastBody = await aclRes.text();
          }
          if (acl) {
            const allowedRoles = new Set(["ADMINISTRATOR", "CONTENT_ADMINISTRATOR", "DIRECT_SPONSORED_CONTENT_POSTER"]);
            const seen = new Set<string>();
            for (const el of acl.elements ?? []) {
              const role = el.role as string | undefined;
              if (role && !allowedRoles.has(role)) continue;
              const org = el["organization~"] ?? {};
              const rawUrn: string = el.organization ?? (org.id ? `urn:li:organization:${org.id}` : "");
              if (!rawUrn || seen.has(rawUrn)) continue;
              seen.add(rawUrn);
              let name = org.localizedName as string | undefined;
              if (!name) {
                const orgId = rawUrn.split(":").pop();
                const orgRes = await fetch(`https://api.linkedin.com/rest/organizations/${orgId}`, { headers });
                if (orgRes.ok) {
                  const orgJson = await orgRes.json();
                  name = orgJson.localizedName || orgJson.vanityName;
                }
              }
              targetRows.push({
                user_id: userId, kind: "organization", urn: rawUrn,
                name: name || `Page ${rawUrn.split(":").pop()}`,
                access_token: accessToken, refresh_token: refreshToken,
                token_expires_at: expiresAt, scopes: grantedScopes, status: "connected",
              });
            }
            if (!seen.size) {
              pagesError = "Aucune Page administrée trouvée (rôles ADMINISTRATOR / CONTENT_ADMINISTRATOR).";
            }
          } else {
            pagesError = `LinkedIn a refusé la liste des Pages (${lastStatus}).`;
            console.error("[linkedin-oauth] organizationAcls error", { requestId, status: lastStatus, body: lastBody.slice(0, 400) });
          }
        } catch (e) {
          pagesError = "Impossible de récupérer les Pages LinkedIn administrées.";
          console.error("[linkedin-oauth] organizationAcls failed", { requestId, e });
        }
      } else {
        pagesError = "Ton app LinkedIn n'a pas les permissions Pages (w_organization_social). Seul ton profil est disponible.";
      }

      const { error: targetsError } = await supabase
        .from("linkedin_targets")
        .upsert(targetRows, { onConflict: "user_id,urn" });
      if (targetsError) {
        console.error("[linkedin-oauth] targets upsert failed", { requestId, message: targetsError.message });
        return json(500, { success: false, error: "targets_upsert_failed", message: targetsError.message, requestId });
      }

      // Ensure exactly one default destination
      const { data: existing } = await supabase
        .from("linkedin_targets").select("id, is_default").eq("user_id", userId);
      if (existing?.length && !existing.some((t: { is_default: boolean }) => t.is_default)) {
        await supabase.from("linkedin_targets").update({ is_default: true }).eq("id", existing[0].id);
      }

      // Metadata only — access tokens stay on linkedin_targets (server-side).
      const { error: updateError } = await supabase.from("user_settings").update({
        linkedin_token_expires_at: expiresAt,
        linkedin_person_urn: personUrn || null,
      }).eq("user_id", userId);
      if (updateError) {
        console.error("[linkedin-oauth] settings update failed", { requestId, message: updateError.message });
      }

      console.log("[linkedin-oauth] exchange_code success", {
        requestId, personUrn: mask(personUrn), targets: targetRows.length, expiresIn: tokenData.expires_in,
      });
      return json(200, {
        success: true,
        personUrn,
        targetsCreated: targetRows.length,
        pagesWarning: pagesError,
        expiresIn: tokenData.expires_in,
        requestId,
      });

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
