import { sniffImage } from "@/lib/image/sniff";
import { getRemoteProvider, ProviderError, remoteMaxUploadBytes } from "@/server/remote-provider";
import { limiter, usageSubject } from "@/server/usage";

function json(status: number, error: string, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error, message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * POST /api/remove-background
 * multipart/form-data with one `image` field (PNG, JPEG or WebP).
 * Returns a greyscale PNG alpha mask (white = subject).
 *
 * Image bytes are forwarded to the configured provider and are not stored or
 * logged by this route.
 */
export async function POST(request: Request) {
  const provider = getRemoteProvider();
  if (!provider) {
    return json(503, "not-configured", "Server processing isn't configured on this deployment.");
  }

  // Basic same-origin check so other sites can't spend this deployment's credits from a browser.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host && process.env.ISOLA_REMOTE_ALLOW_CROSS_ORIGIN !== "true") {
    return json(403, "forbidden", "Cross-origin requests aren't allowed.");
  }

  const usage = await limiter.consume(usageSubject(request));
  if (!usage.allowed) {
    return json(429, "rate-limited", "You've reached the processing limit for now. Try again later.", {
      "Retry-After": String(Math.ceil((usage.resetAt - Date.now()) / 1000)),
    });
  }

  const max = remoteMaxUploadBytes();
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > max + 64 * 1024) return json(413, "too-large", "This image is too large for server processing.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, "bad-request", "Expected multipart form data with an `image` field.");
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) return json(400, "bad-request", "Expected an `image` file field.");
  if (image.size > max) return json(413, "too-large", "This image is too large for server processing.");
  const sniff = sniffImage(new Uint8Array(await image.slice(0, 64 * 1024).arrayBuffer()));
  if (!sniff.ok) return json(415, "unsupported-type", "Only PNG, JPEG and WebP images are supported.");

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort());
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const mask = await provider.createMask(image, controller.signal);
    return new Response(mask, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(usage.remaining),
      },
    });
  } catch (error) {
    if (error instanceof ProviderError) return json(error.status, "provider-error", error.message);
    if (controller.signal.aborted) return json(504, "timeout", "The processing provider took too long to respond.");
    return json(502, "provider-error", "The processing provider couldn't be reached.");
  } finally {
    clearTimeout(timeout);
  }
}
