import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { normalizeGrokModels, xaiErrorMessage } from "../_shared/ai-text.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Méthode non autorisée." });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { error: "Configuration indisponible." });
  const supabase = createClient(url, serviceKey);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Connexion requise." });
  try {
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth.user) return json(401, { error: "Connexion requise." });
    const { data: settings, error } = await supabase.from("user_settings")
      .select("xai_api_key").eq("user_id", auth.user.id).maybeSingle();
    if (error) return json(500, { error: "Impossible de charger les paramètres xAI." });
    if (!settings?.xai_api_key) return json(400, { error: "Enregistre d’abord ta clé API xAI dans les paramètres." });
    const response = await fetch("https://api.x.ai/v1/language-models", {
      headers: { Authorization: `Bearer ${settings.xai_api_key}` },
    });
    if (!response.ok) return json(response.status, { error: xaiErrorMessage(response.status) });
    const data = await response.json();
    const models = normalizeGrokModels(data.models ?? data.data);
    if (!models.length) return json(502, { error: "Aucun modèle de texte xAI disponible pour cette clé." });
    return json(200, { models });
  } catch {
    return json(502, { error: "Impossible de joindre xAI. Réessaie plus tard." });
  }
});