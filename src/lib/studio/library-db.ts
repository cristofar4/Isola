"use client";

/**
 * The studio library's storage: IndexedDB in this browser. Nothing here is
 * uploaded. Metadata (assets, collections, folders, projects, version
 * history, scenes, films, motion styles) lives in its own stores; image,
 * video and audio files and masks are kept apart in "blobs" so lists load
 * without reading any pixels.
 *
 * Version 2 added "scenes" (Scene Studio), "films" (Motion Studio) and
 * "motionStyles" (saved motion presets). Upgrades only add stores.
 */

const DB_NAME = "isola-library";
const VERSION = 2;
export const STORES = ["assets", "blobs", "collections", "folders", "projects", "snapshots", "scenes", "films", "motionStyles"] as const;
export type StoreName = (typeof STORES)[number];

export class LibraryStorageError extends Error {}

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openLibrary(): Promise<IDBDatabase | null> {
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
      for (const name of STORES) {
        if (db.objectStoreNames.contains(name)) continue;
        if (name === "blobs") db.createObjectStore(name);
        else {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name === "snapshots") store.createIndex("projectId", "projectId");
        }
      }
    };
    // Another tab with an older version open blocks the upgrade until it closes; give it a moment.
    let blockedTimer: ReturnType<typeof setTimeout> | undefined;
    req.onsuccess = () => {
      clearTimeout(blockedTimer);
      const db = req.result;
      // A newer version opened in another tab: let it upgrade, and reopen next time.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => {
      blockedTimer = setTimeout(() => {
        dbPromise = null;
        resolve(null);
      }, 8000);
    };
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
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted."));
    tx.onerror = () => reject(tx.error);
  });
}

function storageError(error: unknown) {
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
    return new LibraryStorageError("This browser's storage is full. Remove some assets or projects (and empty the trash), then try again.");
  }
  return new LibraryStorageError(error instanceof Error ? error.message : "Browser storage failed.");
}

async function db(): Promise<IDBDatabase> {
  const d = await openLibrary();
  if (!d) throw new LibraryStorageError("This browser isn't letting ISOLA store files (private browsing can do this).");
  return d;
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  return promised((await db()).transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function getOne<T>(store: StoreName, key: string): Promise<T | null> {
  return ((await promised((await db()).transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>)) ?? null) as T | null;
}

export async function getByProject<T>(projectId: string): Promise<T[]> {
  return promised((await db()).transaction("snapshots").objectStore("snapshots").index("projectId").getAll(projectId) as IDBRequest<T[]>);
}

/** Apply several writes atomically. Values go to keyPath stores; [key, blob] pairs go to "blobs". */
export async function write(ops: {
  put?: Array<[Exclude<StoreName, "blobs">, unknown]>;
  blobs?: Array<[string, Blob]>;
  remove?: Array<[StoreName, string]>;
}) {
  const names = new Set<StoreName>();
  ops.put?.forEach(([s]) => names.add(s));
  if (ops.blobs?.length) names.add("blobs");
  ops.remove?.forEach(([s]) => names.add(s));
  if (!names.size) return;
  try {
    const tx = (await db()).transaction([...names], "readwrite");
    ops.put?.forEach(([s, v]) => tx.objectStore(s).put(v));
    ops.blobs?.forEach(([k, b]) => tx.objectStore("blobs").put(b, k));
    ops.remove?.forEach(([s, k]) => tx.objectStore(s).delete(k));
    await finished(tx);
  } catch (error) {
    throw storageError(error);
  }
}

export async function getBlob(key: string): Promise<Blob | null> {
  return ((await promised((await db()).transaction("blobs").objectStore("blobs").get(key) as IDBRequest<Blob | undefined>)) ?? null) as Blob | null;
}

export async function blobKeys(): Promise<string[]> {
  return (await promised((await db()).transaction("blobs").objectStore("blobs").getAllKeys())).map(String);
}
