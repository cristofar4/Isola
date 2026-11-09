"use client";

import type { Rect } from "@/lib/editor/geometry";
import type { BatchSettings } from "./settings";

/**
 * Keeps the current batch in this browser's IndexedDB, so it survives a
 * reload, signing in (OAuth and email links are full page loads) and paying
 * through Paystack. Nothing here is uploaded anywhere. Records stay until the
 * visitor removes the images or clears the batch.
 */

const DB_NAME = "isola-batch";
const VERSION = 1;

export type PersistedStatus = "queued" | "ready" | "failed" | "cancelled";

export interface PersistedItem {
  id: string;
  order: number;
  name: string;
  size: number;
  width: number;
  height: number;
  status: PersistedStatus;
  error: { message: string; detail?: string; code?: string } | null;
  review: string | null;
  maskBlob: Blob | null;
  bounds: Rect | null;
  settings: BatchSettings;
  result: { engineId: string; backend: string; durationMs: number } | null;
  refined: boolean;
}

export interface PersistedMeta {
  name: string;
}

export interface PersistedBackground {
  id: string;
  name: string;
  blob: Blob;
}

export class StorageFullError extends Error {}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted."));
    tx.onerror = () => reject(tx.error);
  });
}

function wrap(error: unknown): Error {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return new StorageFullError("This browser's storage is full.");
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** The database, or null where IndexedDB isn't available (some private modes). */
export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ["files", "items", "meta", "backgrounds"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

async function write(stores: string[], fn: (tx: IDBTransaction) => void) {
  const db = await openDb();
  if (!db) throw new Error("Browser storage isn't available.");
  try {
    const tx = db.transaction(stores, "readwrite");
    fn(tx);
    await done(tx);
  } catch (error) {
    throw wrap(error);
  }
}

export function saveFile(id: string, file: File) {
  return write(["files"], (tx) => tx.objectStore("files").put(file, id));
}

export function saveItem(item: PersistedItem) {
  return write(["items"], (tx) => tx.objectStore("items").put(item, item.id));
}

export function deleteItem(id: string) {
  return write(["files", "items"], (tx) => {
    tx.objectStore("files").delete(id);
    tx.objectStore("items").delete(id);
  });
}

export function saveMeta(meta: PersistedMeta) {
  return write(["meta"], (tx) => tx.objectStore("meta").put(meta, "batch"));
}

export function saveBackground(background: PersistedBackground) {
  return write(["backgrounds"], (tx) => tx.objectStore("backgrounds").put(background, background.id));
}

export function clearAll() {
  return write(["files", "items", "meta", "backgrounds"], (tx) => {
    for (const store of ["files", "items", "meta", "backgrounds"]) tx.objectStore(store).clear();
  });
}

export async function loadAll(): Promise<{
  meta: PersistedMeta | null;
  items: Array<PersistedItem & { file: File }>;
  backgrounds: PersistedBackground[];
} | null> {
  const db = await openDb();
  if (!db) return null;
  const tx = db.transaction(["files", "items", "meta", "backgrounds"], "readonly");
  const [records, fileKeys, files, meta, backgrounds] = await Promise.all([
    request(tx.objectStore("items").getAll() as IDBRequest<PersistedItem[]>),
    request(tx.objectStore("files").getAllKeys()),
    request(tx.objectStore("files").getAll() as IDBRequest<File[]>),
    request(tx.objectStore("meta").get("batch") as IDBRequest<PersistedMeta | undefined>),
    request(tx.objectStore("backgrounds").getAll() as IDBRequest<PersistedBackground[]>),
  ]);
  const byId = new Map<string, File>();
  fileKeys.forEach((key, i) => {
    const blob = files[i];
    if (!blob) return;
    // Older engines may hand back a Blob; restore the File wrapper with its name.
    byId.set(String(key), blob instanceof File ? blob : new File([blob], String(key), { type: (blob as Blob).type }));
  });
  const items = records
    .filter((r) => byId.has(r.id))
    .sort((a, b) => a.order - b.order)
    .map((r) => {
      const file = byId.get(r.id)!;
      return { ...r, file: file.name === r.name ? file : new File([file], r.name, { type: file.type, lastModified: file.lastModified }) };
    });
  return { meta: meta ?? null, items, backgrounds };
}
