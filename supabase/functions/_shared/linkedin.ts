// LinkedIn publishing: Posts API (/rest/posts) with Images API upload.
// ugcPosts is only a last-resort fallback for member posts when /rest/posts is unavailable.

import { jobLog } from "./logger.ts";
import { isPersistableImageUrl } from "./schedule-time.ts";

export const LINKEDIN_VERSION = "202608";

export type LinkedInTarget = {
  id: string;
  user_id: string;
  kind: "person" | "organization" | string;
  urn: string;
  name: string;
  access_token: string | null;
  refresh_token?: string | null;
  token_expires_at: string | null;
  status: string;
  is_default: boolean;
};

export type PublishErrorCode =
  | "LINKEDIN_TOKEN_EXPIRED"
  | "LINKEDIN_NOT_CONNECTED"
  | "LINKEDIN_FORBIDDEN"
  | "LINKEDIN_API_ERROR"
  | "LINKEDIN_RATE_LIMITED"
  | "LINKEDIN_TRANSIENT"
  | "INVALID_CONTENT"
  | "IMAGE_REQUIRED"
  | "IMAGE_NOT_PERSISTED"
  | "TARGET_INVALID"
  | "NETWORK_ERROR"
  | "TIMEOUT";

export type PublishResult = {
  ok: boolean;
  targetId: string;
  targetName: string;
  linkedinId?: string;
  error?: string;
  code?: PublishErrorCode;
  attempts: number;
  retryable: boolean;
  providerStatus?: number;
  confirmed: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const normalizeUrn = (urn: string, kind: string) => {
  if (urn.startsWith("urn:li:")) return urn;
  return kind === "organization" ? `urn:li:organization:${urn}` : `urn:li:person:${urn}`;
};

function restHeaders(accessToken: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "Linkedin-Version": LINKEDIN_VERSION,
    ...extra,
  };
}

function classifyStatus(status: number, body: string): { code: PublishErrorCode; retryable: boolean } {
  if (status === 401) return { code: "LINKEDIN_TOKEN_EXPIRED", retryable: false };
  if (status === 403) return { code: "LINKEDIN_FORBIDDEN", retryable: false };
  if (status === 429) return { code: "LINKEDIN_RATE_LIMITED", retryable: true };
  if (status === 400) {
    const invalid = /invalid|commentary|author|validation|DUPLICATE/i.test(body);
    return { code: invalid ? "INVALID_CONTENT" : "LINKEDIN_API_ERROR", retryable: false };
  }
  if (status === 502 || status === 503 || status === 504 || status >= 500) {
    return { code: "LINKEDIN_TRANSIENT", retryable: true };
  }
  return { code: "LINKEDIN_API_ERROR", retryable: false };
}

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

async function refreshAccessToken(
  supabase: any,
  target: LinkedInTarget,
): Promise<{ accessToken: string; expiresAt: string | null } | null> {
  if (!target.refresh_token) return null;
  const { data: settings } = await supabase
    .from("user_settings")
    .select("linkedin_client_id, linkedin_client_secret")
    .eq("user_id", target.user_id)
    .maybeSingle();
  const clientId = settings?.linkedin_client_id || Deno.env.get("LINKEDIN_CLIENT_ID");
  const clientSecret = settings?.linkedin_client_secret || Deno.env.get("LINKEDIN_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: target.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    jobLog("LINKEDIN_REFRESH_FAILED", { target: target.id, status: res.status });
    return null;
  }
  const data = await res.json();
  const accessToken = data.access_token as string;
  const expiresAt = data.expires_in
    ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString()
    : null;
  const refreshToken = (data.refresh_token as string | undefined) || target.refresh_token;
  await supabase.from("linkedin_targets").update({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: expiresAt,
    status: "connected",
  }).eq("id", target.id);
  jobLog("LINKEDIN_TOKEN_REFRESHED", { target: target.id });
  return { accessToken, expiresAt };
}

async function ensureFreshToken(supabase: any, target: LinkedInTarget): Promise<
  { ok: true; accessToken: string } | { ok: false; result: PublishResult }
> {
  const base = { targetId: target.id, targetName: target.name, attempts: 0, confirmed: false, retryable: false };
  if (!target.access_token && !target.refresh_token) {
    return {
      ok: false,
      result: { ...base, ok: false, code: "LINKEDIN_NOT_CONNECTED", error: `${target.name} : jeton LinkedIn absent. Reconnecte cette destination.` },
    };
  }

  const expiringSoon = target.token_expires_at
    && Date.parse(target.token_expires_at) <= Date.now() + 5 * 60_000;
  if (expiringSoon || !target.access_token) {
    const refreshed = await refreshAccessToken(supabase, target);
    if (refreshed) return { ok: true, accessToken: refreshed.accessToken };
    if (target.token_expires_at && Date.parse(target.token_expires_at) <= Date.now()) {
      await markTargetExpired(supabase, target.id);
      return {
        ok: false,
        result: { ...base, ok: false, code: "LINKEDIN_TOKEN_EXPIRED", error: `${target.name} : connexion LinkedIn expirée. Reconnecte cette destination.` },
      };
    }
  }
  return { ok: true, accessToken: target.access_token! };
}

async function uploadImagePostsApi(accessToken: string, owner: string, imageUrl: string): Promise<string | null> {
  const init = await fetch("https://api.linkedin.com/rest/images?action=initializeUpload", {
    method: "POST",
    headers: restHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!init.ok) {
    jobLog("IMAGE_INIT_FAILED", { status: init.status, api: "rest/images" });
    return null;
  }
  const rd = await init.json();
  const uploadUrl = rd.value?.uploadUrl;
  const imageUrn = rd.value?.image;
  if (!uploadUrl || !imageUrn) return null;

  const blob = await (await fetch(imageUrl)).blob();
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: blob,
  });
  if (!put.ok) {
    jobLog("IMAGE_PUT_FAILED", { status: put.status });
    return null;
  }
  return imageUrn as string;
}

async function uploadImageLegacy(accessToken: string, owner: string, imageUrl: string): Promise<string | null> {
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
  if (!reg.ok) return null;
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
  return put.ok ? (asset as string) : null;
}

async function createRestPost(
  accessToken: string,
  author: string,
  content: string,
  imageUrn: string | null,
  idempotencyKey?: string,
): Promise<{ ok: true; urn: string; status: number } | { ok: false; status: number; body: string }> {
  const body: Record<string, unknown> = {
    author,
    commentary: content,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (imageUrn) {
    body.content = { media: { id: imageUrn } };
  }

  const headers = restHeaders(accessToken);
  if (idempotencyKey) headers["X-Restli-Idempotency-Key"] = idempotencyKey.slice(0, 32);

  const res = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (res.ok || res.status === 201) {
    const urn = res.headers.get("x-restli-id") || (() => {
      try { return JSON.parse(text).id; } catch { return null; }
    })();
    if (!urn) return { ok: false, status: res.status, body: text || "LinkedIn n'a pas renvoyé d'identifiant de post." };
    return { ok: true, urn, status: res.status };
  }
  return { ok: false, status: res.status, body: text };
}

async function createUgcPost(
  accessToken: string,
  author: string,
  content: string,
  asset: string | null,
): Promise<{ ok: true; urn: string; status: number } | { ok: false; status: number; body: string }> {
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
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    let urn: string | undefined;
    try { urn = JSON.parse(text).id; } catch { /* ignore */ }
    if (!urn) return { ok: false, status: res.status, body: text || "LinkedIn n'a pas renvoyé d'identifiant de post." };
    return { ok: true, urn, status: res.status };
  }
  return { ok: false, status: res.status, body: text };
}

export async function publishLinkedInPost(opts: {
  supabase: any;
  target: LinkedInTarget;
  content: string;
  image?: string | null;
  idempotencyKey?: string;
  requireImage?: boolean;
  maxAttempts?: number;
}): Promise<PublishResult> {
  const { supabase, target, content, image, idempotencyKey, requireImage, maxAttempts = 3 } = opts;
  const base = { targetId: target.id, targetName: target.name, confirmed: false };

  if (!target.urn) {
    return { ...base, ok: false, attempts: 0, retryable: false, code: "TARGET_INVALID", error: `${target.name} : URN organisation/profil manquant.` };
  }
  if (!content?.trim()) {
    return { ...base, ok: false, attempts: 0, retryable: false, code: "INVALID_CONTENT", error: "Le contenu du post est vide." };
  }

  const token = await ensureFreshToken(supabase, target);
  if (!token.ok) return token.result;
  const accessToken = token.accessToken;
  const author = normalizeUrn(target.urn, target.kind);

  let imageUrn: string | null = null;
  if (image) {
    if (!isPersistableImageUrl(image)) {
      return {
        ...base, ok: false, attempts: 0, retryable: false, code: "IMAGE_NOT_PERSISTED",
        error: "L'image n'est pas une URL persistante (data: refusée). Régénère ou téléverse l'image.",
      };
    }
    jobLog("IMAGE_UPLOAD_START", { target: target.id });
    imageUrn = await uploadImagePostsApi(accessToken, author, image);
    if (!imageUrn) imageUrn = await uploadImageLegacy(accessToken, author, image);
    if (!imageUrn) {
      return {
        ...base, ok: false, attempts: 0, retryable: true, code: "IMAGE_NOT_PERSISTED",
        error: "Échec de l'upload image vers LinkedIn.",
      };
    }
    jobLog("IMAGE_READY", { target: target.id });
  } else if (requireImage) {
    return {
      ...base, ok: false, attempts: 0, retryable: false, code: "IMAGE_REQUIRED",
      error: "Image requise pour cette publication, absente ou non persistée.",
    };
  }

  let lastError = "Échec de publication LinkedIn";
  let lastStatus = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    jobLog("PUBLISH_REQUEST", { target: target.id, attempt, api: "rest/posts" });
    let created = await createRestPost(accessToken, author, content, imageUrn, idempotencyKey);

    const restUnavailable = !created.ok && (created.status === 404 || created.status === 410 ||
      (created.status === 403 && /PRODUCT|version|not enabled/i.test(created.body)));
    if (restUnavailable && target.kind === "person") {
      jobLog("PUBLISH_FALLBACK_UGC", { target: target.id, status: created.status });
      created = await createUgcPost(accessToken, author, content, imageUrn);
    }

    if (created.ok) {
      await supabase.from("linkedin_targets").update({ status: "connected" }).eq("id", target.id);
      jobLog("LINKEDIN_RESPONSE", { target: target.id, status: created.status, urn: created.urn });
      return {
        ...base, ok: true, attempts: attempt, linkedinId: created.urn,
        confirmed: true, retryable: false, providerStatus: created.status,
      };
    }

    lastStatus = created.status;
    lastError = `LinkedIn [${created.status}] ${created.body}`.slice(0, 800);
    const classified = classifyStatus(created.status, created.body);
    jobLog("LINKEDIN_ERROR", { target: target.id, status: created.status, attempt, code: classified.code });

    if (classified.code === "LINKEDIN_TOKEN_EXPIRED") {
      await markTargetExpired(supabase, target.id);
      return { ...base, ok: false, attempts: attempt, code: classified.code, error: `${target.name} : jeton LinkedIn invalide. Reconnecte cette destination.`, retryable: false, providerStatus: created.status };
    }
    if (!classified.retryable || attempt === maxAttempts) {
      return { ...base, ok: false, attempts: attempt, code: classified.code, error: lastError, retryable: classified.retryable && attempt < maxAttempts, providerStatus: created.status };
    }
    await sleep(attempt * 1500);
  }

  return { ...base, ok: false, attempts: maxAttempts, code: "LINKEDIN_TRANSIENT", error: lastError, retryable: true, providerStatus: lastStatus };
}

/** Backward-compatible wrapper used by existing callers. */
export async function publishToTarget(
  supabase: any,
  target: LinkedInTarget,
  content: string,
  imageUrl: string | null,
  maxAttempts = 3,
): Promise<PublishResult> {
  return publishLinkedInPost({ supabase, target, content, image: imageUrl, maxAttempts });
}

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
