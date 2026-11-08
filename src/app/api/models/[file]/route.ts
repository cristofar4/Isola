import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { AuthUnavailableError, getAuth } from "@/server/auth";
import { autoDownloadEnabled, downloadModel, localModelPath, modelForFile } from "@/server/models";

function json(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * GET /api/models/:file
 * Streams a segmentation model to a signed-in user. Background removal needs
 * an account, and this is where that's enforced: without a session there is
 * no model to run.
 */
export async function GET(request: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const model = modelForFile(file);
  if (!model) return json(404, "not-found", "Unknown model.");

  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return json(401, "auth-required", "Sign in to remove backgrounds.");
  } catch (error) {
    if (error instanceof AuthUnavailableError) return json(503, "auth-unavailable", `Accounts aren't configured: ${error.message}`);
    throw error;
  }

  let path = localModelPath(model);
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
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      // Private: only for the signed-in user's browser, which also keeps it in Cache Storage.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
