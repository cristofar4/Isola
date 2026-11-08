import "server-only";

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MODELS, type ModelSpec } from "@/lib/processing/models";

/**
 * Model files are kept out of `public/` so they're only served to signed-in
 * users (see app/api/models). They're looked up in ISOLA_MODEL_DIR (default
 * ./models). If missing, the server downloads them once from the mirror,
 * verifies the SHA-256 checksum and caches them, so a fresh install works
 * without a manual step.
 */

const MIRROR = process.env.ISOLA_MODEL_MIRROR || "https://github.com/danielgatis/rembg/releases/download/v0.0.0/";

export function modelForFile(file: string): ModelSpec | null {
  return Object.values(MODELS).find((m) => m.file === file) ?? null;
}

function candidateDirs(): string[] {
  // turbopackIgnore: these are runtime locations; models must not be traced into the server bundle.
  const dirs = [process.env.ISOLA_MODEL_DIR || join(/*turbopackIgnore: true*/ process.cwd(), "models")];
  dirs.push(join(/*turbopackIgnore: true*/ tmpdir(), "isola-models"));
  return dirs;
}

function isComplete(path: string, model: ModelSpec) {
  try {
    return statSync(path).size === model.bytes;
  } catch {
    return false;
  }
}

/** Path of a verified local copy, or null. */
export function localModelPath(model: ModelSpec): string | null {
  for (const dir of candidateDirs()) {
    const path = join(/*turbopackIgnore: true*/ dir, model.file);
    if (isComplete(path, model)) return path;
  }
  return null;
}

const inflight = new Map<string, Promise<string>>();

async function sha256(path: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/** Download from the mirror into the first writable directory, verifying the checksum. */
export function downloadModel(model: ModelSpec): Promise<string> {
  const existing = inflight.get(model.id);
  if (existing) return existing;
  const task = (async () => {
    let lastError: unknown = null;
    for (const dir of candidateDirs()) {
      const dest = join(/*turbopackIgnore: true*/ dir, model.file);
      const partial = `${dest}.${process.pid}.partial`;
      try {
        mkdirSync(dir, { recursive: true });
        const response = await fetch(MIRROR + model.file, { redirect: "follow" });
        if (!response.ok || !response.body) throw new Error(`Mirror returned HTTP ${response.status}`);
        await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), createWriteStream(partial));
        const digest = await sha256(partial);
        if (digest !== model.sha256) throw new Error(`Checksum mismatch (${digest})`);
        renameSync(partial, dest);
        return dest;
      } catch (error) {
        lastError = error;
        if (existsSync(partial)) {
          try {
            unlinkSync(partial);
          } catch {
            /* ignore */
          }
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Model download failed");
  })();
  inflight.set(model.id, task);
  task.finally(() => inflight.delete(model.id)).catch(() => {});
  return task;
}

export function autoDownloadEnabled() {
  return process.env.ISOLA_MODEL_AUTO_DOWNLOAD !== "false";
}
