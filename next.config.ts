import type { NextConfig } from "next";

/**
 * Cross-origin isolation (COOP + COEP) enables SharedArrayBuffer, which lets
 * ONNX Runtime Web use multiple threads. Every resource the app loads is
 * same-origin, so `require-corp` costs nothing. If you host models on a CDN,
 * that CDN must send `Cross-Origin-Resource-Policy: cross-origin` and CORS headers.
 */
const isolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  env: {
    // Evaluated once at build time (used for the footer copyright year).
    NEXT_PUBLIC_BUILD_YEAR: String(new Date().getFullYear()),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: [...isolationHeaders, ...securityHeaders] },
      {
        source: "/models/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/ort/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
