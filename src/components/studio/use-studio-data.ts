"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BatchSettings } from "@/lib/batch/settings";
import { checkCollection, type Report } from "@/lib/consistency";
import { exportPolicy } from "@/lib/plan-policy";
import { useCheckTarget } from "@/lib/studio/check-target";
import { EXPORTS_CHANGED, listExports, type ExportRecord } from "@/lib/studio/export-history";
import { maskStatsFor } from "@/lib/studio/mask-stats";
import { cutoutPreview, loadSnapshot, originalThumb, type BatchSnapshot, type SnapshotItem } from "@/lib/studio/snapshot";

/** Re-run `load` when the visitor comes back to this tab (say, after working in Batch Studio). */
function useOnReturn(load: () => void) {
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
}

export type SnapshotState = { status: "loading" } | { status: "unavailable" } | { status: "ready"; snapshot: BatchSnapshot };

export function useSnapshot(): SnapshotState {
  const [state, setState] = useState<SnapshotState>({ status: "loading" });
  const load = useCallback(() => {
    void loadSnapshot().then((snapshot) => setState(snapshot ? { status: "ready", snapshot } : { status: "unavailable" }));
  }, []);
  useEffect(load, [load]);
  useOnReturn(load);
  return state;
}

export function useExportHistory(): ExportRecord[] | null {
  const [records, setRecords] = useState<ExportRecord[] | null>(null);
  const load = useCallback(() => void listExports().then(setRecords), []);
  useEffect(() => {
    load();
    window.addEventListener(EXPORTS_CHANGED, load);
    return () => window.removeEventListener(EXPORTS_CHANGED, load);
  }, [load]);
  useOnReturn(load);
  return records;
}

/**
 * Object URLs for blobs made by `make`, created once the work finishes and
 * revoked when `key` changes or the component goes away.
 */
function useAsyncUrls(make: () => Promise<Array<Blob | null>>, key: string): Array<string | null> {
  const [urls, setUrls] = useState<Array<string | null>>([]);
  useEffect(() => {
    let alive = true;
    let made: Array<string | null> = [];
    void make().then((blobs) => {
      if (!alive) return;
      made = blobs.map((b) => (b ? URL.createObjectURL(b) : null));
      setUrls(made);
    });
    return () => {
      alive = false;
      made.forEach((u) => u && URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` summarises what `make` draws
  }, [key]);
  return urls;
}

/** Object URLs for blobs already in hand (e.g. export thumbnails). */
export function useBlobUrls(blobs: Array<Blob | null | undefined>): Array<string | null> {
  const key = blobs.map((b) => (b ? `${b.size}:${b.type}` : "-")).join("|");
  return useAsyncUrls(async () => blobs.map((b) => b ?? null), key);
}

/** Thumbnails of the first `count` originals. */
export function useOriginalThumbs(items: SnapshotItem[], count: number): Array<string | null> {
  const chosen = items.slice(0, count);
  return useAsyncUrls(() => Promise.all(chosen.map((i) => originalThumb(i.file))), chosen.map((i) => i.id).join("|"));
}

/** Previews of finished items with given settings, drawn by the export renderer. */
export function useCutoutPreviews(
  jobs: Array<{ item: SnapshotItem; settings: BatchSettings } | null>,
  backgrounds: Map<string, Blob>,
  pro: boolean,
  maxSide = 360,
): Array<string | null> {
  const key = `${pro}:${maxSide}:` + jobs.map((j) => (j ? `${j.item.id}:${j.item.maskBlob?.size}:${JSON.stringify(j.settings)}` : "-")).join("|");
  return useAsyncUrls(async () => {
    const out: Array<Blob | null> = [];
    for (const job of jobs) out.push(job ? await cutoutPreview(job.item, job.settings, exportPolicy(pro), backgrounds, maxSide) : null);
    return out;
  }, key);
}

/** The consistency report for the saved batch's finished images. */
export function useSnapshotReport(snapshot: BatchSnapshot | null, pro: boolean): Report | null {
  const [target] = useCheckTarget();
  const [entries, setEntries] = useState<Parameters<typeof checkCollection>[0] | null>(null);
  const ready = useMemo(() => snapshot?.items.filter((i) => i.status === "ready" && i.maskBlob) ?? [], [snapshot]);
  useEffect(() => {
    let alive = true;
    void Promise.all(
      ready.map(async (i) => ({
        id: i.id,
        name: i.name,
        width: i.width,
        height: i.height,
        bounds: i.bounds,
        settings: i.settings,
        review: i.review,
        stats: await maskStatsFor(i.maskBlob, `${i.id}:${i.maskBlob?.size ?? 0}:${i.width}x${i.height}`),
      })),
    ).then((list) => alive && setEntries(list));
    return () => {
      alive = false;
    };
  }, [ready]);
  return useMemo(() => (entries ? checkCollection(entries, { target, policy: exportPolicy(pro) }) : null), [entries, target, pro]);
}

export interface StorageInfo {
  usage: number | null;
  persisted: boolean | null;
  canPersist: boolean;
}

async function readStorage(): Promise<StorageInfo | null> {
  const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!storage?.estimate) return null;
  const [estimate, persisted] = await Promise.all([storage.estimate().catch(() => null), storage.persisted?.().catch(() => null) ?? null]);
  return { usage: estimate?.usage ?? null, persisted, canPersist: typeof storage.persist === "function" };
}

/** How much this browser holds for ISOLA, and whether it's protected from automatic clean-up. */
export function useStorageInfo(): [StorageInfo, () => Promise<void>] {
  const [info, setInfo] = useState<StorageInfo>({ usage: null, persisted: null, canPersist: false });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void readStorage().then((next) => alive && next && setInfo(next));
    return () => {
      alive = false;
    };
  }, [tick]);
  const persist = useCallback(async () => {
    await navigator.storage?.persist?.().catch(() => false);
    setTick((t) => t + 1);
  }, []);
  return [info, persist];
}

/** "today at 10:24", "yesterday at 16:37", "23 Jan at 09:11". */
export function whenText(ms: number) {
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const diff = Math.floor((day.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff <= 0) return `today at ${time}`;
  if (diff === 1) return `yesterday at ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === day.getFullYear() ? undefined : "numeric" })} at ${time}`;
}

export function bytesText(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
