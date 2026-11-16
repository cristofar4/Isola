/**
 * Profile photos. A photo chosen in Settings is cropped to a square and
 * resized in the browser to AVATAR_SIZE pixels, then stored on the account
 * as a small data URL (a few kilobytes), so it shows wherever you're signed
 * in. Photos from Google or GitHub sign-in are https URLs.
 */

export const AVATAR_SIZE = 160;
/** Longest stored photo, in characters of its data URL (base64 of a 160px JPEG is usually 6–12 KB). */
export const AVATAR_MAX_CHARS = 48 * 1024;

export function isAcceptableAvatar(value: unknown): value is string {
  if (typeof value !== "string" || value.length > AVATAR_MAX_CHARS) return false;
  if (/^https:\/\/[^\s"'<>]+$/.test(value)) return value.length <= 2048;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/** Square-crop and resize a picked photo to a small JPEG data URL. */
export async function avatarFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't resize photos.");
    ctx.imageSmoothingQuality = "high";
    // White behind transparent pixels (JPEG has no transparency).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    for (const quality of [0.86, 0.75, 0.6]) {
      const url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= AVATAR_MAX_CHARS) return url;
    }
    throw new Error("That photo is too detailed to store. Try another one.");
  } finally {
    bitmap.close();
  }
}
