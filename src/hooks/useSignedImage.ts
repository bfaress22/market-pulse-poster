import { useEffect, useState } from "react";
import { getDisplayableImageUrl } from "@/lib/storage";

/**
 * Resolve a post-assets URL to a fresh signed URL. Data URLs and non-bucket
 * URLs pass through unchanged.
 */
export function useSignedImage(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(
    url && url.startsWith("data:") ? url : null,
  );

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setResolved(null);
      return;
    }
    if (url.startsWith("data:")) {
      setResolved(url);
      return;
    }
    getDisplayableImageUrl(url).then((u) => {
      if (!cancelled) setResolved(u);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}
