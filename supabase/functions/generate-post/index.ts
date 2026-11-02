import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTextProvider, xaiErrorMessage } from "../_shared/ai-text.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Settings = {
  post_model: string;
  use_byok: boolean;
  openai_api_key: string | null;
  xai_api_key: string | null;
  gemini_api_key: string | null;
  tone_instructions: string | null;
};

async function callAi(model: string, settings: Settings, messages: unknown[], tools: unknown[], toolName: string) {
  const provider = resolveTextProvider(model, settings);
  const { url, key } = provider;
  model = provider.model;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, tools, tool_choice: { type: "function", function: { name: toolName } } }),
  });
  if (!res.ok) {
    if (url.startsWith("https://api.x.ai/")) throw new Error(xaiErrorMessage(res.status));
    const t = await res.text();
    throw new Error(`AI call failed [${res.status}]: ${t}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { newsMarkdown, language } = await req.json();
    if (!newsMarkdown) return json(400, { success: false, error: "newsMarkdown required" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: s } = await supabase.from("user_settings")
      .select("post_model, use_byok, openai_api_key, xai_api_key, gemini_api_key, tone_instructions")
      .eq("user_id", userId).maybeSingle();
    const settings: Settings = s as Settings ?? {
      post_model: "google/gemini-3-flash-preview", use_byok: false,
      openai_api_key: null, xai_api_key: null, gemini_api_key: null, tone_instructions: null,
    };

    const LANG_NAMES: Record<string, string> = {
      fr: "French (français)", en: "English", es: "Spanish (español)", de: "German (Deutsch)",
      it: "Italian (italiano)", pt: "Portuguese (português)", nl: "Dutch", ar: "Arabic (العربية)",
    };
    const langCode = (typeof language === "string" && language) || "fr";
    const langName = LANG_NAMES[langCode] ?? langCode;

    const systemPrompt = `Follow the user request. Produce a LinkedIn post from the provided material.
Prefer ${langName} unless the material or request says otherwise.
Do not add branding, hashtags, CTAs, or structure unless asked.
${settings.tone_instructions ? `\nAutomation memory / voice:\n${settings.tone_instructions}` : ""}
Return JSON via the create_linkedin_post tool.`;

    const data = await callAi(
      settings.post_model,
      settings,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Material:\n\n${String(newsMarkdown).substring(0, 8000)}` },
      ],
      [{
        type: "function",
        function: {
          name: "create_linkedin_post",
          description: "Create a structured LinkedIn post",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
              newsSummary: { type: "string" },
              imagePrompt: { type: "string" },
            },
            required: ["title", "content", "newsSummary", "imagePrompt"],
            additionalProperties: false,
          },
        },
      }],
      "create_linkedin_post",
    );

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return json(500, { success: false, error: "AI did not return structured data" });
    const postData = JSON.parse(toolCall.function.arguments);
    return json(200, { success: true, ...postData });
  } catch (e) {
    console.error("generate-post error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
