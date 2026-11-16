import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { AuthUnavailableError, getAuth } from "@/server/auth";
import type { ModelSpec } from "@/lib/processing/models";
import { autoDownloadEnabled, downloadModel, localModelPath, modelForFile, modelMirrorUrl } from "@/server/models";
import { guestTries, readTrial } from "@/server/trial";

function json(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/models/:file
 * Streams a segmentation model to a signed-in user, or to a guest with a
 * trial (see src/server/trial.ts). Without either there is no model to run.
 * Supports Range requests: the browser downloads the model in pieces, which
 * also lets serverless hosts serve it (each piece comes from the mirror).
 */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const model = modelForFile(file);
  if (!model) return json(404, "not-found", "Unknown model.");

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    // Guests with a trial (a few free tries before creating an account) get the model too.
    if (!session && !(guestTries() > 0 && readTrial(request))) return json(401, "auth-required", "Sign in to remove backgrounds.");
  } catch (error) {
    if (error instanceof AuthUnavailableError) return json(503, "auth-unavailable", `Accounts aren't configured: ${error.message}`);
    throw error;
  }

  const range = parseRange(request.headers.get("range"), model.bytes);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${model.bytes}`, "Cache-Control": "no-store" } });
  }

  let path = localModelPath(model);
  // Serverless hosts (Vercel, Netlify) can't keep or stream a 170 MB file, but they can pass on
  // a few megabytes at a time: the browser asks for the model in pieces, and each piece is
  // fetched from the mirror as it's requested.
  if (!path && range) {
    if (!autoDownloadEnabled()) return json(404, "model-missing", "The background removal model isn't installed on this server.");
    try {
      return await proxyRange(model, range);
    } catch (error) {
      console.error("[models] range proxy failed:", error instanceof Error ? error.message : error);
      return json(502, "model-download-failed", "The server couldn't fetch that part of the model. Try again.");
    }
  }
  if (!path) {
    if (!autoDownloadEnabled()) {
      return json(404, "model-missing", "The background removal model isn't installed on this server.");
    }
    try {
      path = await downloadModel(model);
    } catch (error) {
      console.error("[models] download failed:", error instanceof Error ? error.message : error);
      return json(502, "model-download-failed", "The server couldn't download the background removal model.");
    }
  }

  const size = statSync(path).size;
  if (range) {
    const stream = Readable.toWeb(createReadStream(path, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>;
    return new Response(stream, { status: 206, headers: { ...BINARY, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) } });
  }
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(stream, { headers: { ...BINARY, "Content-Length": String(size) } });
}

const BINARY = {
  "Content-Type": "application/octet-stream",
  "Accept-Ranges": "bytes",
  // Private: only for the signed-in user's (or guest's) browser, which also keeps it in Cache Storage.
  "Cache-Control": "private, max-age=31536000, immutable",
};

/** One "bytes=start-end" range inside the file, null without a Range header, or "invalid". */
function parseRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!m) return "invalid";
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (!Number.isSafeInteger(start) || start >= size || end < start) return "invalid";
  return { start, end };
}

/** A piece of the model straight from the mirror (which supports ranges), checked before it's passed on. */
async function proxyRange(model: ModelSpec, range: { start: number; end: number }) {
  const upstream = await fetch(modelMirrorUrl(model), { headers: { Range: `bytes=${range.start}-${range.end}` }, redirect: "follow" });
  const contentRange = upstream.headers.get("content-range") ?? "";
  if (upstream.status !== 206 || !upstream.body || contentRange !== `bytes ${range.start}-${range.end}/${model.bytes}`) {
    await upstream.body?.cancel().catch(() => undefined);
    throw new Error(`Mirror answered ${upstream.status} (${contentRange || "no Content-Range"})`);
  }
  return new Response(upstream.body, { status: 206, headers: { ...BINARY, "Content-Range": contentRange, "Content-Length": String(range.end - range.start + 1) } });
}
