import { after } from "next/server";
import { uploadLimits } from "@/lib/config";
import { SNIFF_BYTES, sniffImage } from "@/lib/image/sniff";
import { exportPolicy } from "@/lib/plan-policy";
import { recordUse } from "@/server/api-keys";
import { CORS_HEADERS, apiError, authenticate, consumeRate, preflight, rateHeaders } from "@/server/public-api";
import { API_MODEL, SegmenterError, decodeInput, renderOutput, segment } from "@/server/segmenter";

export function OPTIONS() {
  return preflight();
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * POST /api/v1/remove-background
 * Authorization: Bearer isola_sk_…
 * Body: multipart/form-data with `image`, or the raw image with Content-Type image/png|jpeg|webp.
 * Options (form fields or query): output=cutout|mask, format=png|jpeg, background=#RRGGBB|transparent.
 */
export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;
  const caller = auth.caller;

  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > uploadLimits.maxFileBytes + 64 * 1024) {
    return apiError(413, "payload_too_large", `Images can be at most ${Math.round(uploadLimits.maxFileBytes / 1024 / 1024)} MB.`);
  }

  const url = new URL(request.url);
  const fields = new Map<string, string>(url.searchParams);
  const type = (request.headers.get("content-type") || "").toLowerCase();
  let bytes: Uint8Array;
  try {
    if (type.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const image = form.get("image");
      if (!(image instanceof Blob)) return apiError(400, "invalid_request", "Add the image as a file in the `image` field.");
      for (const [k, v] of form.entries()) if (typeof v === "string") fields.set(k, v);
      bytes = new Uint8Array(await image.arrayBuffer());
    } else if (/^image\/(png|jpeg|jpg|webp)\b/.test(type) || type.startsWith("application/octet-stream")) {
      bytes = new Uint8Array(await request.arrayBuffer());
    } else {
      return apiError(415, "unsupported_media_type", "Send multipart/form-data with an `image` field, or the image bytes with Content-Type image/png, image/jpeg or image/webp.");
    }
  } catch {
    return apiError(400, "invalid_request", "The request body couldn't be read.");
  }
  if (bytes.length === 0) return apiError(400, "invalid_request", "The image is empty.");
  if (bytes.length > uploadLimits.maxFileBytes) {
    return apiError(413, "payload_too_large", `Images can be at most ${Math.round(uploadLimits.maxFileBytes / 1024 / 1024)} MB.`);
  }

  // Same checks as the app: by content, then header dimensions, before decoding anything.
  const sniff = sniffImage(bytes.subarray(0, SNIFF_BYTES));
  if (!sniff.ok) {
    return sniff.reason === "unknown-format"
      ? apiError(415, "unsupported_media_type", `${sniff.detected ? `${sniff.detected} isn't supported.` : "That isn't a supported image."} Use PNG, JPEG or WebP.`)
      : apiError(422, "decode_failed", "The image header is damaged or incomplete.");
  }
  if (sniff.width > uploadLimits.maxDimension || sniff.height > uploadLimits.maxDimension) {
    return apiError(422, "image_too_large", `The longest side can be ${uploadLimits.maxDimension}px; this image is ${sniff.width} × ${sniff.height}px.`);
  }
  if ((sniff.width * sniff.height) / 1e6 > uploadLimits.maxMegapixels) {
    return apiError(422, "image_too_large", `Images can be at most ${uploadLimits.maxMegapixels} MP.`);
  }
  if (sniff.width < uploadLimits.minDimension || sniff.height < uploadLimits.minDimension) {
    return apiError(422, "image_too_small", `Each side must be at least ${uploadLimits.minDimension}px.`);
  }

  const output = (fields.get("output") || "cutout").toLowerCase();
  const format = (fields.get("format") || "png").toLowerCase().replace("jpg", "jpeg");
  const bg = (fields.get("background") || "transparent").trim();
  if (output !== "cutout" && output !== "mask") return apiError(400, "invalid_request", "`output` must be `cutout` or `mask`.");
  if (format !== "png" && format !== "jpeg") return apiError(400, "invalid_request", "`format` must be `png` or `jpeg`.");
  if (bg !== "transparent" && !HEX.test(bg)) return apiError(400, "invalid_request", "`background` must be `transparent` or a colour like #FFFFFF.");
  if (output === "mask" && (format !== "png" || bg !== "transparent")) {
    return apiError(400, "invalid_request", "Masks are returned as greyscale PNG; leave `format` and `background` unset.");
  }
  if (output === "mask" && !caller.pro) {
    return apiError(403, "pro_required", "Masks are part of Pro. Free keys return watermarked cutouts up to 1,000px.");
  }

  const rate = await consumeRate(caller);
  if (!rate.allowed) {
    return apiError(429, "rate_limited", "This key has reached its hourly limit. Wait for the reset, or use another key.", {
      ...rateHeaders(rate),
      "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))),
    });
  }

  const policy = exportPolicy(caller.pro);
  try {
    const decoded = await decodeInput(bytes);
    const { mask, durationMs } = await segment(decoded);
    const rendered = await renderOutput(decoded, mask, {
      output,
      format,
      background: bg === "transparent" ? null : bg.toUpperCase(),
      policy,
    });
    after(() => recordUse(caller.key));
    const ext = format === "jpeg" ? "jpg" : "png";
    return new Response(new Uint8Array(rendered.body), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        ...rateHeaders(rate),
        "Content-Type": rendered.contentType,
        "Content-Length": String(rendered.body.length),
        "Content-Disposition": `inline; filename="${output === "mask" ? "mask" : "cutout"}.${ext}"`,
        "X-Isola-Width": String(rendered.width),
        "X-Isola-Height": String(rendered.height),
        "X-Isola-Original-Width": String(decoded.width),
        "X-Isola-Original-Height": String(decoded.height),
        "X-Isola-Plan": policy.plan,
        "X-Isola-Watermark": String(policy.watermark),
        "X-Isola-Model": API_MODEL.id,
        "X-Isola-Duration-Ms": String(durationMs),
      },
    });
  } catch (error) {
    if (error instanceof SegmenterError) {
      return apiError(error.status, error.code, error.message, { ...rateHeaders(rate), ...(error.code === "server_busy" ? { "Retry-After": "5" } : {}) });
    }
    console.error("[api] remove-background failed:", error instanceof Error ? error.message : error);
    return apiError(500, "internal_error", "Something went wrong processing this image.", rateHeaders(rate));
  }
}
