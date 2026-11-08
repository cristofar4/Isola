import "server-only";

/**
 * Server-side background-removal providers. Credentials are read from server
 * environment variables only and never sent to the browser.
 *
 * To add a provider, implement `RemoteProvider` and register it in `providers`.
 */

export interface RemoteProvider {
  id: string;
  label: string;
  /** Returns a greyscale PNG mask (white = keep) for the given image. */
  createMask(image: Blob, signal: AbortSignal): Promise<Blob>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * remove.bg — https://www.remove.bg/api
 * POST /v1.0/removebg with `channels=alpha` returns the alpha matte only.
 */
function removeBg(apiKey: string): RemoteProvider {
  return {
    id: "removebg",
    label: "remove.bg (server)",
    async createMask(image, signal) {
      const form = new FormData();
      form.append("image_file", image, "image.png");
      form.append("size", process.env.REMOVE_BG_SIZE || "auto");
      form.append("format", "png");
      form.append("channels", "alpha");
      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
        body: form,
        signal,
      });
      if (!response.ok) {
        // Do not forward provider bodies verbatim; they can include account details.
        const status = response.status;
        const message =
          status === 402
            ? "The server's processing credits are used up."
            : status === 429
              ? "The server is rate limited by its provider. Try again shortly."
              : status === 400
                ? "The provider couldn't find a subject in this image."
                : "The processing provider returned an error.";
        throw new ProviderError(message, status === 400 ? 422 : 502);
      }
      return response.blob();
    },
  };
}

export function getRemoteProvider(): RemoteProvider | null {
  const id = process.env.ISOLA_REMOTE_PROVIDER;
  if (id === "removebg" && process.env.REMOVE_BG_API_KEY) return removeBg(process.env.REMOVE_BG_API_KEY);
  return null;
}

export function remoteMaxUploadBytes(): number {
  const mb = Number(process.env.ISOLA_REMOTE_MAX_UPLOAD_MB || 12);
  return (Number.isFinite(mb) && mb > 0 ? mb : 12) * 1024 * 1024;
}
