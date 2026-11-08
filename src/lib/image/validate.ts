import { FORMAT_LABEL, formatBytes, uploadLimits } from "@/lib/config";
import { SNIFF_BYTES, sniffImage, type SniffResult } from "./sniff";

export type ValidationCode =
  | "empty-file"
  | "too-large"
  | "unsupported-type"
  | "corrupt"
  | "dimension-too-large"
  | "too-many-pixels"
  | "too-small"
  | "decode-failed";

export interface ValidationError {
  code: ValidationCode;
  /** Short, user-facing explanation. */
  message: string;
}

export type ValidationResult =
  | { ok: true; info: SniffResult }
  | { ok: false; error: ValidationError };

export interface Limits {
  maxFileBytes: number;
  maxDimension: number;
  minDimension: number;
  maxMegapixels: number;
}

export async function readHead(file: Blob, bytes = SNIFF_BYTES): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
}

/**
 * Validate type (by content, not extension), size and dimensions before any
 * full decode happens.
 */
export async function validateImageFile(
  file: Blob,
  limits: Limits = uploadLimits,
): Promise<ValidationResult> {
  if (file.size === 0) {
    return { ok: false, error: { code: "empty-file", message: "This file is empty." } };
  }
  if (file.size > limits.maxFileBytes) {
    return {
      ok: false,
      error: {
        code: "too-large",
        message: `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(limits.maxFileBytes)}.`,
      },
    };
  }
  const head = await readHead(file);
  const sniff = sniffImage(head);
  if (!sniff.ok) {
    if (sniff.reason === "unknown-format") {
      return {
        ok: false,
        error: {
          code: "unsupported-type",
          message: sniff.detected
            ? `${sniff.detected} files aren't supported yet. Use ${FORMAT_LABEL}.`
            : `This doesn't look like a supported image. Use ${FORMAT_LABEL}.`,
        },
      };
    }
    return {
      ok: false,
      error: { code: "corrupt", message: "The image header is damaged or incomplete." },
    };
  }
  const { width, height } = sniff;
  if (width > limits.maxDimension || height > limits.maxDimension) {
    return {
      ok: false,
      error: {
        code: "dimension-too-large",
        message: `This image is ${width.toLocaleString("en-US")} × ${height.toLocaleString("en-US")}px. The longest side can be ${limits.maxDimension.toLocaleString("en-US")}px.`,
      },
    };
  }
  if ((width * height) / 1e6 > limits.maxMegapixels) {
    return {
      ok: false,
      error: {
        code: "too-many-pixels",
        message: `This image is ${((width * height) / 1e6).toFixed(1)} MP. The limit is ${limits.maxMegapixels} MP.`,
      },
    };
  }
  if (width < limits.minDimension || height < limits.minDimension) {
    return {
      ok: false,
      error: {
        code: "too-small",
        message: `This image is ${width} × ${height}px. Each side must be at least ${limits.minDimension}px.`,
      },
    };
  }
  const { ok: _ok, ...info } = sniff;
  void _ok;
  return { ok: true, info };
}
