/**
 * On-device segmentation models. Both are permissively licensed and run with
 * ONNX Runtime Web. Weights are not committed to the repository; fetch them
 * with `npm run models:fetch` (see scripts/fetch-models.mjs) or host them on a
 * CDN and set NEXT_PUBLIC_ISOLA_MODEL_BASE_URL.
 */

export type ModelId = "isnet-general-use" | "birefnet-lite";

export interface ModelSpec {
  id: ModelId;
  label: string;
  description: string;
  file: string;
  bytes: number;
  sha256: string;
  inputSize: number;
  mean: [number, number, number];
  std: [number, number, number];
  /** Whether the raw output needs a sigmoid to become a probability. */
  activation: "none" | "sigmoid";
  /**
   * Model too large for WebAssembly's 4 GB memory ceiling; only offered when
   * the browser exposes WebGPU.
   */
  requiresWebGPU: boolean;
  provenance: string;
  license: string;
  sourceUrl: string;
}

export const MODELS: Record<ModelId, ModelSpec> = {
  "isnet-general-use": {
    id: "isnet-general-use",
    label: "Standard",
    description: "Fast, general-purpose segmentation. Good for products and most photos.",
    file: "isnet-general-use.onnx",
    bytes: 178_648_008,
    sha256: "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
    inputSize: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
    activation: "none",
    requiresWebGPU: false,
    provenance: "IS-Net (DIS), general-use weights",
    license: "Apache-2.0",
    sourceUrl: "https://github.com/xuebinqin/DIS",
  },
  "birefnet-lite": {
    id: "birefnet-lite",
    label: "High detail",
    description: "Finer hair and edge detail. Needs a browser with WebGPU.",
    file: "BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx",
    bytes: 224_005_088,
    sha256: "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333",
    inputSize: 1024,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    activation: "sigmoid",
    requiresWebGPU: true,
    provenance: "BiRefNet (general, Swin-T backbone)",
    license: "MIT",
    sourceUrl: "https://github.com/ZhengPeng7/BiRefNet",
  },
};

export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

export function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}
