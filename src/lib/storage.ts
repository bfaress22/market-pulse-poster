import { supabase } from "@/integrations/supabase/client";

const BUCKET = "post-assets";
const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days

/**
 * Extract the object path inside the `post-assets` bucket from a Supabase
 * public/signed URL. Returns null if the URL is not a post-assets URL.
 */
export function extractPostAssetPath(url: string): string | null {
  if (!url || url.startsWith("data:")) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/post-assets\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Given any URL, return a URL usable in <img src>. If it's a post-assets
 * URL (public or expired signed), re-sign it. Otherwise return as-is.
 */
export async function getDisplayableImageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const path = extractPostAssetPath(url);
  if (!path) return url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data?.signedUrl) {
    console.warn("createSignedUrl failed", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Upload a file to post-assets and return a signed URL.
 */
export async function uploadPostAsset(
  path: string,
  file: File | Blob,
  contentType?: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: contentType ?? (file as File).type,
    upsert: false,
  });
  if (error) throw error;
  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  if (signErr || !data?.signedUrl) throw signErr ?? new Error("Failed to sign URL");
  return data.signedUrl;
}
