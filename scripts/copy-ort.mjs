// Copies the ONNX Runtime Web runtime files into public/ort so they are served
// from this origin (no third-party CDN, works under cross-origin isolation).
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "node_modules", "onnxruntime-web", "dist");
const target = join(root, "public", "ort");
const files = [
  "ort.wasm.min.mjs",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort.webgpu.min.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

if (!existsSync(dist)) {
  console.warn("[isola] onnxruntime-web is not installed; skipping runtime copy.");
  process.exit(0);
}
mkdirSync(target, { recursive: true });
for (const file of files) copyFileSync(join(dist, file), join(target, file));
console.log(`[isola] Copied ${files.length} ONNX Runtime files to public/ort`);
