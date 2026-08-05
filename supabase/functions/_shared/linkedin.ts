// Shared LinkedIn publishing helpers used by publish-linkedin, publish-scheduled,
// run-schedules and run-topic-queue. Publishing is always targeted at an explicit
// linkedin_targets row (person profile or organization page) — no implicit fallback.

export type LinkedInTarget = {
  id: string;
  user_id: string;
  kind: "person" | "organization" | string;
  urn: string;
  name: string;
  access_token: string | null;
  token_expires_at: string | null;
  status: string;
  is_default: boolean;
};

export type PublishResult = {
  ok: boolean;
  targetId: string;
  targetName: string;
  linkedinId?: string;
  error?: string;
  code?: "LINKEDIN_TOKEN_EXPIRED" | "LINKEDIN_NOT_CONNECTED" | "LINKEDIN_API_ERROR";
  attempts: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const normalizeUrn = (urn: string, kind: string) => {
  if (urn.startsWith("urn:li:")) return urn;
  return kind === "organization" ? `urn:li:organization:${urn}` : `urn:li:person:${urn}`;
};

/** Loads the targets to publish to. Falls back to the default target, then to the
 * legacy user_settings connection (auto-migrated as a target) when nothing is given. */
export async function resolveTargets(
  supabase: any,
  userId: string,
  targetIds?: (string | null | undefined)[] | null,
): Promise<{ targets: LinkedInTarget[]; error?: string }> {
  const ids = (targetIds ?? []).filter((v): v is string => !!v);

  if (ids.length) {
    const { data } = await supabase
      .from("linkedin_targets").select("*").eq("user_id", userId).in("id", ids);
    const targets = (data ?? []) as LinkedInTarget[];
    if (!targets.length) return { targets: [], error: "Destination LinkedIn introuvable ou supprimée." };
    return { targets };
  }

  const { data: all } = await supabase
    .from("linkedin_targets").select("*").eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  const targets = (all ?? []) as LinkedInTarget[];
  if (!targets.length) {
    return { targets: [], error: "Aucune destination LinkedIn connectée. Va dans Réglages → Destinations LinkedIn." };
  }
  return { targets: [targets[0]] };
}

async function markTargetExpired(supabase: any, targetId: string) {
  await supabase.from("linkedin_targets").update({ status: "expired" }).eq("id", targetId);
}

async function uploadImage(
  accessToken: string,
  owner: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner,
          serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
        },
      }),
    });
    if (!reg.ok) {
      console.error("[linkedin] registerUpload failed", reg.status, await reg.text());
      return null;
    }
    const rd = await reg.json();
    const uploadUrl = rd.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
    const asset = rd.value?.asset ?? null;
    if (!uploadUrl || !asset) return null;
    const blob = await (await fetch(imageUrl)).blob();
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: blob,
    });
    if (!put.ok) {
      console.error("[linkedin] image PUT failed", put.status, await put.text());
      return null;
    }
    return asset as string;
  } catch (e) {
    console.error("[linkedin] image upload failed", e);
    return null;
  }
}

/** Publishes one piece of content to one target, retrying transient LinkedIn failures. */
export async function publishToTarget(
  supabase: any,
  target: LinkedInTarget,
  content: string,
  imageUrl: string | null,
  maxAttempts = 3,
): Promise<PublishResult> {
  const base = { targetId: target.id, targetName: target.name };

  if (!target.access_token) {
    return { ...base, ok: false, attempts: 0, code: "LINKEDIN_NOT_CONNECTED", error: `${target.name} : jeton LinkedIn absent. Reconnecte cette destination.` };
  }
  if (target.token_expires_at && Date.parse(target.token_expires_at) <= Date.now()) {
    await markTargetExpired(supabase, target.id);
    return { ...base, ok: false, attempts: 0, code: "LINKEDIN_TOKEN_EXPIRED", error: `${target.name} : connexion LinkedIn expirée. Reconnecte cette destination.` };
  }

  const accessToken = target.access_token;
  const author = normalizeUrn(target.urn, target.kind);
  const asset = imageUrl && !imageUrl.startsWith("data:")
    ? await uploadImage(accessToken, author, imageUrl)
    : null;

  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: asset ? "IMAGE" : "NONE",
        ...(asset ? { media: [{ status: "READY", media: asset }] } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  let lastError = "Échec de publication LinkedIn";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      await supabase.from("linkedin_targets").update({ status: "connected" }).eq("id", target.id);
      return { ...base, ok: true, attempts: attempt, linkedinId: data.id };
    }

    const text = await res.text();
    lastError = `LinkedIn [${res.status}] ${text}`;
    console.error("[linkedin] publish failed", { targetId: target.id, status: res.status, attempt, text });

    if (res.status === 401 && text.includes("INVALID_ACCESS_TOKEN")) {
      await markTargetExpired(supabase, target.id);
      return { ...base, ok: false, attempts: attempt, code: "LINKEDIN_TOKEN_EXPIRED", error: `${target.name} : jeton LinkedIn invalide. Reconnecte cette destination.` };
    }

    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt === maxAttempts) {
      return { ...base, ok: false, attempts: attempt, code: "LINKEDIN_API_ERROR", error: lastError };
    }
    await sleep(attempt * 1500);
  }

  return { ...base, ok: false, attempts: maxAttempts, code: "LINKEDIN_API_ERROR", error: lastError };
}

/** Publishes the same content to several targets, one result per target. */
export async function publishToTargets(
  supabase: any,
  targets: LinkedInTarget[],
  content: string,
  imageUrl: string | null,
): Promise<PublishResult[]> {
  const results: PublishResult[] = [];
  for (const t of targets) {
    results.push(await publishToTarget(supabase, t, content, imageUrl));
  }
  return results;
}
