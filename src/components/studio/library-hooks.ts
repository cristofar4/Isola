"use client";

import { useEffect, useState } from "react";
import { loadLibrary, thumbUrl, useLibrary } from "@/lib/studio/library";

/** Loads the library from this browser once and returns its status. */
export function useLibraryReady() {
  const status = useLibrary((s) => s.status);
  useEffect(() => {
    void loadLibrary().catch(() => undefined);
  }, []);
  return status;
}

/** The thumbnail URL for an asset, once it's read from storage. */
export function useThumb(id: string | null | undefined) {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void thumbUrl(id).then((u) => alive && setUrl({ id, url: u }));
    return () => {
      alive = false;
    };
  }, [id]);
  return url && url.id === id ? url.url : null;
}

/** Formats a byte count for people. */
export function bytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatOf(mime: string) {
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/svg+xml") return "SVG";
  if (mime === "image/webp") return "WEBP";
  return "PNG";
}
