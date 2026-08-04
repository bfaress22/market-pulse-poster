import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { postId } = await req.json();
    if (!postId) return json(400, { success: false, error: "postId required" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return json(401, { success: false, error: "Unauthorized" });
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u.user?.id;
    if (!userId) return json(401, { success: false, error: "Unauthorized" });

    const { data: post } = await supabase.from("posts").select("*").eq("id", postId).eq("user_id", userId).maybeSingle();
    if (!post) return json(404, { success: false, error: "Post not found" });

    const { data: settings } = await supabase
      .from("user_settings")
      .select("linkedin_access_token, linkedin_token_expires_at, linkedin_person_urn, linkedin_organization_id")
      .eq("user_id", userId).maybeSingle();

    const accessToken = settings?.linkedin_access_token;
    const personUrn = settings?.linkedin_person_urn;
    const organizationId = settings?.linkedin_organization_id;
    const expiresAt = settings?.linkedin_token_expires_at;

    if (!accessToken || !personUrn) {
      return json(400, { success: false, error: "LinkedIn not connected. Go to Settings." });
    }
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
      await supabase.from("posts").update({ status: "ready" }).eq("id", postId);
      return json(200, {
        success: false, code: "LINKEDIN_TOKEN_EXPIRED", requiresReconnect: true,
        error: "Your LinkedIn connection has expired. Reconnect in Settings.",
      });
    }

    const normalizedPerson = personUrn.startsWith("urn:li:")
      ? personUrn
      : `urn:li:person:${personUrn}`;
    // Only use an organization author when it's a numeric page ID (a Client ID is NOT a page ID)
    const orgId = (organizationId ?? "").replace(/^urn:li:organization:/, "").trim();
    const useOrg = /^\d+$/.test(orgId);
    let authorUrn = useOrg ? `urn:li:organization:${orgId}` : normalizedPerson;

    let imageAsset: string | null = null;
    if (post.image_url && !post.image_url.startsWith("data:")) {
      try {
        const registerRes = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
              owner: authorUrn,
              serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
            },
          }),
        });
        if (registerRes.ok) {
          const rd = await registerRes.json();
          const uploadUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
          imageAsset = rd.value?.asset;
          if (uploadUrl) {
            const blob = await (await fetch(post.image_url)).blob();
            await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, body: blob });
          }
        }
      } catch (e) { console.error("img upload failed", e); }
    }

    const buildBody = (author: string) => ({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: post.content },
          shareMediaCategory: imageAsset ? "IMAGE" : "NONE",
          ...(imageAsset ? { media: [{ status: "READY", media: imageAsset }] } : {}),
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    });

    const postToLinkedIn = (author: string) =>
      fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(buildBody(author)),
      });

    let liRes = await postToLinkedIn(authorUrn);

    // 403 on /author => no page-posting permission (missing w_organization_social / not admin).
    // Fall back to publishing on the personal profile.
    if (liRes.status === 403 && authorUrn !== normalizedPerson) {
      const first = await liRes.text();
      console.error("LinkedIn org author denied, retrying as person:", first);
      authorUrn = normalizedPerson;
      liRes = await postToLinkedIn(authorUrn);
    }

    if (!liRes.ok) {
      const errText = await liRes.text();
      console.error("LinkedIn error:", liRes.status, errText);
      const invalid = liRes.status === 401 && errText.includes("INVALID_ACCESS_TOKEN");
      await supabase.from("posts").update({ status: invalid ? "ready" : "failed" }).eq("id", postId);
      return json(invalid ? 200 : 500, invalid
        ? { success: false, code: "LINKEDIN_TOKEN_EXPIRED", requiresReconnect: true, error: "Token invalid. Reconnect in Settings." }
        : { success: false, error: `LinkedIn API error [${liRes.status}]: ${errText}` });
    }

    const liData = await liRes.json();
    await supabase.from("posts").update({
      status: "published",
      published_at: new Date().toISOString(),
      linkedin_post_id: liData.id || null,
    }).eq("id", postId);

    return json(200, { success: true, linkedinPostId: liData.id });
  } catch (e) {
    console.error("publish error", e);
    return json(500, { success: false, error: e instanceof Error ? e.message : "Failed" });
  }
});
