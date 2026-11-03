/** Resolve Firecrawl API key: user BYOK → env secret → project automation_config. */
export async function resolveProjectFirecrawlKey(
  supabase: { from: (t: string) => any },
  userKey?: string | null,
): Promise<string | null> {
  const fromUser = (userKey ?? "").trim();
  if (fromUser) return fromUser;

  const fromEnv = (Deno.env.get("FIRECRAWL_API_KEY") ?? "").trim();
  if (fromEnv) return fromEnv;

  try {
    const { data } = await supabase
      .from("automation_config")
      .select("firecrawl_api_key")
      .eq("id", 1)
      .maybeSingle();
    const fromProject = (data?.firecrawl_api_key ?? "").trim();
    return fromProject || null;
  } catch (e) {
    console.warn("resolveProjectFirecrawlKey failed", e);
    return null;
  }
}
