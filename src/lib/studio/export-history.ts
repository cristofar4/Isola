"use client";

/**
 * Recent exports, kept in this browser's IndexedDB so a download can be taken
 * again later. Nothing is uploaded. The newest exports keep their files up to
 * a size budget; older ones keep only their details. Recording never gets in
 * the way of a download: any storage failure is ignored.
 */

const DB_NAME = "isola-exports";
const STORE = "exports";
export const MAX_RECORDS = 8;
export const MAX_STORED_BYTES = 150 * 1024 * 1024;
export const EXPORTS_CHANGED = "isola:exports-changed";

export type ExportSource = "batch" | "editor" | "export-set";

export interface ExportRecord {
  id: string;
  /** What was exported, e.g. the batch name or the image name. */
  title: string;
  fileName: string;
  source: ExportSource;
  files: number;
  /** e.g. "PNG", "JPEG", "PNG + JPEG". */
  format: string;
  bytes: number;
  createdAt: number;
  /** Destinations in an export set, e.g. ["Square 1:1", "Wide 16:9"]. */
  destinations?: string[];
  thumb: Blob | null;
  /** The file itself, or null once it no longer fits the budget. */
  blob: Blob | null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function promised<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

/** A small JPEG of an image blob (or null for anything that isn't an image). */
async function thumbnail(source: Blob | null | undefined): Promise<Blob | null> {
  if (!source || !source.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    // Transparent areas show as the light checkerboard colour rather than black.
    ctx.fillStyle = "#F1F2EE";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  } catch {
    return null;
  }
}

export async function listExports(): Promise<ExportRecord[]> {
  const db = await open();
  if (!db) return [];
  try {
    const all = await promised(db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<ExportRecord[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function getExport(id: string): Promise<ExportRecord | null> {
  const db = await open();
  if (!db) return null;
  try {
    return (await promised(db.transaction(STORE).objectStore(STORE).get(id) as IDBRequest<ExportRecord | undefined>)) ?? null;
  } catch {
    return null;
  }
}

function changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EXPORTS_CHANGED));
}

/**
 * Remember an export. The record is written first so it's kept even if the
 * page is left straight away; the thumbnail and the size budget follow.
 * `preview` is an image used for the thumbnail (often the first file).
 */
export async function recordExport(input: Omit<ExportRecord, "id" | "createdAt" | "thumb" | "bytes"> & { preview?: Blob | null }): Promise<void> {
  try {
    const db = await open();
    if (!db) return;
    const { preview, ...rest } = input;
    const record: ExportRecord = { ...rest, id: crypto.randomUUID(), createdAt: Date.now(), bytes: input.blob?.size ?? 0, thumb: null };
    const first = db.transaction(STORE, "readwrite");
    first.objectStore(STORE).put(record);
    await finished(first);
    changed();

    record.thumb = await thumbnail(preview ?? input.blob);
    const others = (await listExports()).filter((r) => r.id !== record.id);
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let budget = MAX_STORED_BYTES;
    [record, ...others].forEach((r, i) => {
      if (i >= MAX_RECORDS) return void store.delete(r.id);
      const size = r.blob?.size ?? 0;
      if (r.blob && size <= budget) budget -= size;
      else if (r.blob) r.blob = null; // Too big for what's left: keep the details only.
      store.put(r);
    });
    await finished(tx);
    changed();
  } catch {
    // Full or unavailable storage only means this export isn't listed later.
  }
}

export async function deleteExport(id: string) {
  const db = await open();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await finished(tx).catch(() => undefined);
  changed();
}

export async function clearExports() {
  const db = await open();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await finished(tx).catch(() => undefined);
  changed();
}
