"use client";

let webgpuPromise: Promise<boolean> | null = null;

/** Whether this browser can create a WebGPU adapter (cached). */
export function detectWebGPU(): Promise<boolean> {
  webgpuPromise ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      if (!gpu) return false;
      return Boolean(await gpu.requestAdapter());
    } catch {
      return false;
    }
  })();
  return webgpuPromise;
}
