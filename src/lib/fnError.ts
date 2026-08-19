/**
 * Turn a supabase.functions.invoke failure into a readable, user-facing message.
 * Edge functions return { success: false, error } bodies; the JS client only
 * surfaces "Edge function returned 4xx", so we read the response body.
 */
export async function fnErrorMessage(error: unknown, data?: any): Promise<string> {
  const ctx: any = (error as any)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.clone?.().json?.() ?? (await ctx.json());
      if (body?.error) return String(body.error);
    } catch { /* ignore */ }
  }
  const status: number | undefined = ctx?.status;
  if (status === 402) return "Crédits IA épuisés pour cet espace de travail. Ajoutez des crédits pour continuer.";
  if (status === 429) return "Trop de requêtes IA. Réessayez dans quelques instants.";
  if (data?.error) return String(data.error);
  return (error as any)?.message || "La génération a échoué";
}
